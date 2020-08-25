
import { v4 as uuid } from 'uuid'
import { ContractType, ManageableFields, AuthInput, AuthenticationDefinition, Implementations, KeyValueStoreTypes } from './globalTypes.js'
import { memoryKV } from './memoryKv.js'
import workerKv from './workerKv.js'
import { AbstractBackend, BackendResult } from './backendAbstract.js'

export type ValueType = string | ArrayBuffer | ArrayBufferView | ReadableStream
export type KvDataTypes = 'text' | 'json' | 'arrayBuffer' |'stream'

export type GetResultType<T> =
  T extends undefined ? string :
  T extends 'text' ? string :
  T extends 'json' ? object :
  T extends 'arrayBuffer' ? ArrayBuffer :
  T extends 'stream' ? ReadableStream :
  never

export type ListEntry = { name: string, expiration?: number, metadata: object}
/* eslint-disable camelcase */
export type KvListReturn ={
  keys: ListEntry[],
  list_complete: boolean,
  cursor: string
}

export type KV = {
  list: (options?: {prefix?: string, limit?: number, cursor?: string}) => Promise<KvListReturn>
  get: (<T extends KvDataTypes> (key:string, type?:T) => Promise<GetResultType<T> | null>)
  getWithMetadata:(<T extends KvDataTypes>(key:string, type?:T) => Promise<{value:GetResultType<T> | null, metadata: object | null}>),
  put: (key:string, value:ValueType, additional?: {metadata?:any, expiration?:number, expirationTtl?:number}) => Promise<void>
  delete: (key:string) => Promise<void>
};

type WorkerCache ={memory? :KV, worker?: KV} & {[key:string]: KV}
type WorkerTypes = keyof WorkerCache
const clientInstance: WorkerCache = {}

/**
 * Global variable to set custom key value store implementation
 * **/
export declare var customKv:{[key:string]: () => KV}

const typeToString = (input:KeyValueStoreTypes) => typeof input === 'string' ? input : input.custom
export const client = (key:KeyValueStoreTypes):KV => clientInstance[typeToString(key)] || init(typeToString(key))
export const destroyClient = (key:WorkerTypes) => {
  delete clientInstance[key]
}
export const init = (key:WorkerTypes):KV => {
  if (key === 'worker') {
    clientInstance.worker = workerKv()
    return clientInstance.worker as KV
  }

  if (key === 'memory') {
    clientInstance.memory = memoryKV()
    return clientInstance.memory as KV
  }
  if (typeof customKv !== 'undefined') {
    if (key in customKv) {
      clientInstance[key] = customKv[key]()
      return clientInstance[key]
    }
  }

  throw new Error(`Unknown key value backend: '${key}'`)
}

const authorizedByPermission = (auth:AuthenticationDefinition, authInput:AuthInput) =>
  typeof auth === 'boolean' ||
  auth.some(x => (authInput.permissions || []).some(y => x === y))

const getUserIdFields = (fields:ManageableFields):string[] => Object.entries(fields).filter(x => x[1]).map(x => x[0])

const filterToAccess = (input:any[], auth:AuthenticationDefinition, authInput:AuthInput, fields:ManageableFields):any[] =>
  authorizedByPermission(auth, authInput) ? input : input.filter((x:any) => getUserIdFields(fields).some(y => x[y] === authInput.sub))
const keyId = (index:string, id:string):string => `${index}:records:${id}`
type KVi = Implementations.keyValue

const getByIdChecked = async (
  id:string,
  auth:AuthInput,
  type:KeyValueStoreTypes,
  index:string,
  authDef: AuthenticationDefinition,
  manageFields:ManageableFields) => {
  const result = await client(type).get(keyId(index, id), 'json')
  return filterToAccess([result], authDef, auth, manageFields)
}

export const get = async <IN, OUT>(
  contract: ContractType<'GET', KVi, IN, OUT>,
  auth: AuthInput,
  input:IN
): Promise<BackendResult<OUT>> => {
  const id: string | string[] = (input as any)?.id
  let cursor = (input as any)?.cursor
  const limit = (input as any)?. limit || 64
  const type = contract.implementation.backend
  const index = contract.implementation.prefix
  if (Array.isArray(id)) {
    if (id.length === 0) return { result: [] as any }
    const docs = (await Promise.all(id.map(x => client(type).get(keyId(index, x), 'json'))))
      .filter(x => x != null)
    return { result: filterToAccess(docs, contract.authentication, auth, contract.manageFields) as any }
  } else if (id) {
    const result = await client(type).get(keyId(index, id), 'json')
    if (!result) return { error: 'notFound' }
    const filtered = filterToAccess([result], contract.authentication, auth, contract.manageFields)
    if (filtered.length === 0) return { error: 'forbidden' }
    return { result: filtered as any }
  }

  if (!contract.implementation.allowGetAll) return { error: 'badInput', data: 'Get all is disabled, id must be provided' }

  const accessAll = authorizedByPermission(contract.authentication, auth)
  const listId : Promise<object|null>[] = []

  const result:KvListReturn = await client(type)
    .list({ limit: Math.max(10, limit), cursor, prefix: `${index}:records` })
  result.keys.forEach(async (x:ListEntry) => {
    if (accessAll || (x.metadata as any)?.createdBy === auth.sub) {
      listId.push(client(type).get(x.name, 'json'))
    }
  })

  if (listId.length >= limit) cursor = null
  if (result.list_complete) cursor = null

  return {
    result: (await Promise.all(listId) as any).filter((x:any) => x != null),
    cursor: result.cursor,
    more: !result.list_complete
  }
}

export const post = async <IN, OUT>(
  contract: ContractType<'POST', KVi, IN, OUT>,
  auth:AuthInput,
  body: IN): Promise<BackendResult<OUT>> => {
  const type = contract.implementation.backend
  const index = contract.implementation.prefix
  if (!authorizedByPermission(contract.authentication, auth)) return { error: 'forbidden' }
  const id = (body as any)?.id || uuid()
  const newBody: {[key:string]:any} = { ...body }
  newBody.id = id

  const metadata:{[key:string]:any} = {}
  if (contract.manageFields.createdBy === true) {
    newBody.createdBy = auth.sub
    metadata.createdBy = auth.sub
  }
  // Maybe skip check if it is generated?
  const got = await client(type).get(keyId(index, id))
  if (got) return { error: 'conflict' }

  // TODO returned without the full id, that contains the index, or maybe always remove the index when returning?
  await client(type).put(keyId(index, id), JSON.stringify(newBody), { metadata })

  return { result: newBody as any }
}

export const del = async <IN, OUT>(
  contract: ContractType<'DELETE', KVi, IN, OUT>,
  auth:AuthInput,
  id: string|string[]
): Promise<BackendResult<OUT>> => {
  if (Array.isArray(id)) {
    await Promise.all(id.map(x => del(contract, auth, x)))
    return { result: {} as any }
  }
  const type = contract.implementation.backend
  const index = contract.implementation.prefix
  const result = await getByIdChecked(id, auth, type, index, contract.authentication, contract.manageFields)
  if (!result || result.length === 0) return { error: 'forbidden' }

  await client(type).delete(keyId(index, id))
  return { result: {} as any }
}

export const patch = async <IN, OUT>(
  contract: ContractType<'PATCH', KVi, IN, OUT>,
  auth:AuthInput,
  body: IN,
  id: string
): Promise<BackendResult<OUT>> => {
  const type = contract.implementation.backend
  const index = contract.implementation.prefix
  const result = await getByIdChecked(id, auth, type, index, contract.authentication, contract.manageFields)
  if (!result || result.length === 0) return { error: 'forbidden' }

  const newBody:{[key:string]:any} = { ...result[0] }
  for (const [key, value] of Object.entries(body)) {
    newBody[key] = value
  }

  const key = keyId(index, id)
  const { metadata } = await client(type).getWithMetadata(key)

  await client(type).put(key, JSON.stringify(newBody), { metadata })

  return { result: {} as any }
}

export const put = async <IN, OUT>(
  contract: ContractType<'PUT', KVi, IN, OUT>,
  auth:AuthInput,
  body: IN,
  id: string
): Promise<BackendResult<OUT>> => {
  const type = contract.implementation.backend
  const index = contract.implementation.prefix
  const result = await getByIdChecked(id, auth, type, index, contract.authentication, contract.manageFields)
  if (!result || result.length === 0) return { error: 'forbidden' }

  const newBody :{[key:string]:any} = { ...body }
  if (contract.manageFields.createdBy === true) {
    newBody.createdBy = result[0].createdBy
  }

  const key = keyId(index, id)
  const { metadata } = await client(type).getWithMetadata(key)

  await client(type).put(key, JSON.stringify(newBody), { metadata })

  return { result: {} as any }
}

export const getElasticsearchProvider = ():AbstractBackend<Implementations.keyValue> => ({
  get,
  post,
  put,
  patch,
  delete: del
})