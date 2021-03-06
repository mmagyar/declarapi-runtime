import { v4 as uuid } from 'uuid'
import { ContractType, ManageableFields, AuthInput, AuthenticationDefinition, Implementations, KeyValueStoreTypes, HandleResult } from './globalTypes.js'
import { memoryKV } from './memoryKv.js'
import { workerKv } from './workerKv.js'
import { AbstractBackend, forbidden, notFound } from './backendAbstract.js'

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

type WorkerCache = {[key:string]: KV}
const clientInstance: WorkerCache = {}

/**
 * Global variable to set custom key value store implementation
 * **/
export declare var customKv:{[key:string]: () => KV}

const typeToString = (input:KeyValueStoreTypes) => typeof input === 'string' ? input : input.custom
export const client = (key:KeyValueStoreTypes):KV => clientInstance[typeToString(key)] || init(typeToString(key))

export const destroyAllClients = () => {
  for (const key of Object.keys(clientInstance)) delete clientInstance[key]
}

export const destroyClient = (key:string) => {
  delete clientInstance[key]
}
export const init = (key:any):KV => {
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
  idIn: undefined | string | string[],
  input?:IN
): Promise<HandleResult<OUT>> => {
  const id: string | string[] = idIn || (input as any)?.id
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
    if (!result) return notFound({ id, input })
    const filtered = filterToAccess([result], contract.authentication, auth, contract.manageFields)
    if (filtered.length === 0) return forbidden(input)
    return { result: filtered as any }
  }

  if (!contract.implementation.allowGetAll) return { errorType: 'badInput', status: 400, errors: ['Get all is disabled, id must be provided'] }

  const accessAll = authorizedByPermission(contract.authentication, auth)
  const listId : Promise<object|null>[] = []

  const result:KvListReturn = await client(type)
    .list({ limit: Math.max(10, limit), cursor, prefix: `${index}:records` })
  result.keys.forEach(async (x:ListEntry) => {
    if (accessAll || (x.metadata as any).createdBy === auth.sub) {
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
  id: string| undefined,
  body: IN): Promise<HandleResult<OUT>> => {
  const type = contract.implementation.backend
  const index = contract.implementation.prefix

  const newId = id || uuid()

  const newBody: {[key:string]:any} = { ...body }

  if (contract.manageFields.id === true) {
    newBody.id = newId
  }

  const metadata:{[key:string]:any} = {}
  if (contract.manageFields.createdBy === true) {
    newBody.createdBy = auth.sub
    metadata.createdBy = auth.sub
  }
  // Maybe skip check if it is generated?
  const got = await client(type).get(keyId(index, newId))
  if (got) return { errorType: 'conflict', data: body, status: 409, errors: [] }

  // TODO returned without the full id, that contains the index, or maybe always remove the index when returning?
  await client(type).put(keyId(index, newId), JSON.stringify(newBody), { metadata })

  return { result: newBody as any }
}

export const del = async <IN, OUT>(
  contract: ContractType<'DELETE', KVi, IN, OUT>,
  auth:AuthInput,
  id: string|string[]
): Promise<HandleResult<OUT>> => {
  if (Array.isArray(id)) {
    const data = await Promise.all(
      id.map(async (x) => ({ id, result: await del(contract, auth, x) })))
    const errors = data.reduce(
      (p, c) => p.concat(Array.isArray(c.result.errors) && c.result.errors.length
        ? c.result.errors
        : []), [] as (string[]))
    if (errors.length) {
      return { errorType: 'forbidden', data, status: 403, errors }
    }
    return { result: {} as any }
  }
  const type = contract.implementation.backend
  const index = contract.implementation.prefix
  const result = await getByIdChecked(id, auth, type, index, contract.authentication, contract.manageFields)

  if (result.length === 1 && result[0] === null) {
    return notFound({ id })
  }

  if (!result || result.length === 0) return forbidden(id, [`forbidden - could not delete item: ${id} `])

  await client(type).delete(keyId(index, id))
  return { result: {} as any }
}

export const patch = async <IN, OUT>(
  contract: ContractType<'PATCH', KVi, IN, OUT>,
  auth:AuthInput,
  id: string,
  body: IN
): Promise<HandleResult<OUT>> => {
  const type = contract.implementation.backend
  const index = contract.implementation.prefix
  const result = await getByIdChecked(id, auth, type, index, contract.authentication, contract.manageFields)
  if (!result || result.length === 0) return forbidden({ id, body })

  const newBody:{[key:string]:any} = { ...result[0] }
  for (const [key, value] of Object.entries(body)) {
    newBody[key] = value
  }
  if (contract.manageFields.createdBy === true) {
    newBody.createdBy = result[0].createdBy
  }

  const key = keyId(index, id)
  const { value, metadata } = await client(type).getWithMetadata(key)
  if (value == null) {
    return notFound({ id, body })
  }

  await client(type).put(key, JSON.stringify(newBody), { metadata })

  return { result: {} as any }
}

export const put = async <IN, OUT>(
  contract: ContractType<'PUT', KVi, IN, OUT>,
  auth:AuthInput,
  id: string,
  body: IN
): Promise<HandleResult<OUT>> => {
  const type = contract.implementation.backend
  const index = contract.implementation.prefix
  const result = await getByIdChecked(id, auth, type, index, contract.authentication, contract.manageFields)
  if (!result || result.length === 0) return forbidden({ id, body })

  const newBody :{[key:string]:any} = { ...body }
  if (contract.manageFields.createdBy === true) {
    newBody.createdBy = result[0].createdBy
  }

  const key = keyId(index, id)
  const { value, metadata } = await client(type).getWithMetadata(key)
  if (value == null) {
    return notFound({ id, body })
  }

  await client(type).put(key, JSON.stringify(newBody), { metadata })

  return { result: {} as any }
}

export const getKvProvider = ():AbstractBackend<Implementations.keyValue> => ({
  get,
  post,
  put,
  patch,
  delete: del
})
