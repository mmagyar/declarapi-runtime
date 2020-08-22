import { v4 as uuid } from 'uuid'
import { ContractType, ManageableFields, AuthInput, AuthType } from './globalTypes.js'
import { RequestHandlingError } from './RequestHandlingError.js'
import { memoryKV } from './memoryKv.js'
import { KV, KvListReturn, ListEntry } from './abstractKv.js'
import Fuse from 'fuse.js'
import { ValueTypes, ObjectType, isObj, isObjectMeta, isArray } from 'yaschva'
import workerKv from './workerKv.js'

type WorkerCache ={memory? :KV, worker?: KV} & {[key:string]: KV}
type WorkerTypes = keyof WorkerCache
const clientInstance: WorkerCache = {}

/**
 * Global variable to set custom key value store implementation
 * **/
export declare var customKv:{[key:string]: () => KV}

export const client = (key:WorkerTypes):KV => clientInstance[key] || init(key)
export const destroyClient = (key:WorkerTypes) => {
  delete clientInstance[key]
}
export const init = (key:WorkerTypes):KV => {
  if (key === 'worker') {
    clientInstance.worker = workerKv()
    return clientInstance.worker
  }

  if (key === 'memory') {
    clientInstance.memory = memoryKV()
    return clientInstance.memory
  }
  if (typeof customKv !== 'undefined') {
    if (key in customKv) {
      clientInstance[key] = customKv[key]()
    }
  }

  throw new Error(`Unknown key value backend: '${key}'`)
}

const authorizedByPermission = (auth:AuthType, authInput:AuthInput) =>
  typeof auth === 'boolean' ||
  auth.some(x => (authInput.permissions || []).some(y => x === y))

const getUserIdFields = (fields:ManageableFields):string[] => Object.entries(fields).filter(x => x[1]).map(x => x[0])

const filterToAccess = (input:any[], auth:AuthType, authInput:AuthInput, fields:ManageableFields):any[] =>
  authorizedByPermission(auth, authInput) ? input : input.filter((x:any) => getUserIdFields(fields).some(y => x[y] === authInput.sub))
const keyId = (index:string, id:string):string => `${index}:records:${id}`
export const get = async (
  type: WorkerTypes,
  index: string,
  contract: ContractType<any, any>,
  authInput:AuthInput,
  id?: string | string[] | null,
  search?: string | null
): Promise<any> => {
  if (Array.isArray(id)) {
    if (id.length === 0) return []
    const docs = (await Promise.all(id.map(x => client(type).get(keyId(index, x), 'json'))))
      .filter(x => x != null)
    return filterToAccess(docs, contract.authentication, authInput, contract.manageFields)
  } else if (id) {
    const result = await client(type).get(keyId(index, id), 'json')
    if (!result) throw new RequestHandlingError('Key not found', 404)
    /// Maybe check filtered and throw 403 when not found
    const filtered = filterToAccess([result], contract.authentication, authInput, contract.manageFields)
    if (filtered.length === 0) throw new RequestHandlingError('Forbidden', 403)
    return filtered
  } else if (search) {
    const cacheId = `${index}:$Al'kesh:${authInput.sub}`
    let cached = await client(type).get(cacheId, 'text')
    if (!cached) {
      cached = await get(type, index, contract, authInput)
      const value = JSON.stringify(cached)
      await client(type).put(cacheId, value, { metadata: { type: 'cache' }, expirationTtl: 120 })
    } else {
      cached = JSON.parse(cached)
    }

    const subKeys = (current:ValueTypes, idx:string):string[] => {
      if (Array.isArray(current)) {
        return current.flatMap(x => subKeys(x, idx))
      } else if (isArray(current)) {
        return subKeys(current.$array, idx)
      } else if (isObjectMeta(current)) {
        return keysOfSchema(current.$object, idx)
      } else if (typeof current === 'object' && isObj(current)) {
        return keysOfSchema(current, idx)
      }
      return [idx]
    }
    const keysOfSchema = (returns: ObjectType, idPrefix?:string):string[] => {
      return Object.keys(returns).flatMap(x => subKeys(returns[x], `${idPrefix ? idPrefix + '.' : ''}${x}`))
    }

    const keys = [...new Set(subKeys(contract.returns, ''))]
    if (!cached || cached.length === 0) return []
    // TODO we may need to pass the contract here, to make sure we don't miss any fields
    const opts :Fuse.IFuseOptions<object> = { keys }
    const fuse = new Fuse((cached as any), opts)
    const searched = fuse.search(search)
    return (searched.map(x => x.item) as any)
  }

  const accessAll = authorizedByPermission(contract.authentication, authInput)
  const listId : Promise<object|null>[] = []
  let cursor
  do {
    const result:KvListReturn = await client(type).list({ limit: 10, cursor, prefix: `${index}:records` })
    result.keys.forEach(async (x:ListEntry) => {
      // Maybe prefix key with user id instead?
      if (accessAll || (x.metadata as any)?.createdBy === authInput.sub) {
        listId.push(client(type).get(x.name, 'json'))
      }
    })

    cursor = result.cursor
  } while (cursor)

  return (await Promise.all(listId) as any).filter((x:any) => x != null)
}

export const post = async <T extends {[key: string]: any}>(
  type: WorkerTypes,
  index: string,
  contract: ContractType<T, any>,
  authInput:AuthInput, body: T):
Promise<T & any> => {
  if (!authorizedByPermission(contract.authentication, authInput)) throw new RequestHandlingError('User not authorized to POST', 403)
  const id = body.id || uuid()
  const newBody: any = { ...body }
  newBody.id = id

  const metadata:any = {}
  if (contract.manageFields.createdBy === true) {
    newBody.createdBy = authInput.sub
    metadata.createdBy = authInput.sub
  }
  // Maybe skip check if it is generated?
  const got = await client(type).get(keyId(index, id))
  if (got) {
    throw new RequestHandlingError('Resource already exists', 409)
  }
  // TODO returned without the full id, that contains the index, or maybe always remove the index when returning?
  await client(type).put(keyId(index, id), newBody, { metadata })

  return newBody
}

export const del = async (type: WorkerTypes, index: string, contract: ContractType<any, any>, auth:AuthInput, id: string|string[]): Promise<any> => {
  if (Array.isArray(id)) return (await Promise.all(id.map(x => del(type, index, contract, auth, x)))).map(x => x[0])
  const result = await get(type, index, contract, auth, id)
  if (!result || result.length === 0) {
    throw new RequestHandlingError('User has no right to delete this', 403)
  }

  await client(type).delete(keyId(index, id))
  return result
}

export const patch = async <T extends object, K extends object>(type: WorkerTypes, index: string, contract: ContractType<T, K>, auth:AuthInput, body: T, id: string
): Promise<K> => {
  const result = await get(type, index, contract, auth, id)
  if (!result || result.length === 0) {
    throw new RequestHandlingError('User has no right to patch this', 403)
  }

  const newBody:any = { ...result[0] }
  for (const [key, value] of Object.entries(body)) {
    newBody[key] = value
  }

  const key = keyId(index, id)
  const { metadata } = await client(type).getWithMetadata(key)

  await client(type).put(key, newBody, { metadata })

  return (await get(type, index, contract, auth, id) as any)[0]
}

export const put = async <T extends object, K extends object>(
  type: WorkerTypes,
  index: string,
  contract: ContractType<T, K>,
  auth:AuthInput,
  body: T,
  id: string
): Promise<K> => {
  const result: any[] = await get(type, index, contract, auth, id)
  if (!result || result.length === 0) {
    throw new RequestHandlingError('User has no right to patch this', 403)
  }
  const newBody :any = { ...body }
  if (contract.manageFields.createdBy === true) {
    newBody.createdBy = result[0].createdBy
  }

  const key = keyId(index, id)
  const { metadata } = await client(type).getWithMetadata(key)

  await client(type).put(key, newBody, { metadata })

  return (await get(type, index, contract, auth, id) as any)[0]
}
