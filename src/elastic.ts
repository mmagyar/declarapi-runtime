import elastic from '@elastic/elasticsearch'
import { v4 as uuid } from 'uuid'
import { AuthInput, ContractType, ManageableFields, AuthenticationDefinition } from './globalTypes.js'
import { RequestHandlingError } from './RequestHandlingError.js'
import { mapFilter } from 'microtil'
type Client = elastic.Client
const Client = elastic.Client
let clientInstance: Client | undefined
export const client = () => clientInstance || init()
export const destroyClient = () => {
  clientInstance = undefined
}
export const init = () => {
  const node = process.env.ELASTIC_HOST
  const username = process.env.ELASTIC_USER_NAME
  const password = process.env.ELASTIC_PASSWORD
  const apiKey = process.env.ELASTIC_API_KEY
  const apiId = process.env.ELASTIC_API_ID
  const unauthenticated = process.env.ELASTIC_UNAUTHENTICATED

  const setup: any = { node, requestTimeout: 90000 }

  if (username && password) {
    setup.auth = { username, password }
  } else if (apiKey) {
    setup.auth = apiId ? { apiKey: { id: apiId, api_key: apiKey } } : { apiKey }
  } else if (!unauthenticated) {
    console.warn('Elasticsearch api credentials are not set')
  }

  clientInstance = new Client(setup)
  return clientInstance
}

export const info = () => client().info()
export const defaultSize = 1000
const authorizedByPermission = (auth:AuthenticationDefinition, authInput:AuthInput) =>
  typeof auth === 'boolean' ||
  auth.some(x => (authInput.permissions || []).some(y => x === y))

const getUserIdFields = (fields:ManageableFields):string[] => Object.entries(fields).filter(x => x[1]).map(x => x[0])

const filterToAccess = (input:any[], auth:AuthenticationDefinition, authInput:AuthInput, fields:ManageableFields):any[] =>
  authorizedByPermission(auth, authInput) ? input : input.filter((x:any) => getUserIdFields(fields).some(y => x[y] === authInput.sub))

export const get = async (
  indexName: string,
  contract: ContractType<any, any>,
  authInput:AuthInput,
  id?: string | string[] | null,
  search?: string | null
): Promise<any> => {
  const index = indexName.toLocaleLowerCase()
  const { manageFields } = contract
  const userIdFilter: any = {
    bool: {
      should: getUserIdFields(manageFields).map(userIdField => {
        const r:any = { term: { } }
        r.term[userIdField] = authInput.sub
        return r
      })
    }
  }

  if (Array.isArray(id)) {
    if (id.length === 0) return []
    const { body: { docs } } = await client().mget({ index, body: { ids: id } })
    return filterToAccess(mapFilter(docs, (x: any) => x._source), contract.authentication, authInput, manageFields)
  } else if (id) {
    const { body } = await client().get({ index, id })
    return filterToAccess([body._source], contract.authentication, authInput, manageFields)
  } else if (search) {
    const queryString = {
      query: {
        bool: {
          must: [{ simple_query_string: { query: search } }]
        }
      }

    }
    if (!authorizedByPermission(contract.authentication, authInput)) queryString.query.bool.must.push(userIdFilter)
    const all = await client().search({ index, body: queryString, size: defaultSize })
    return new Array(all.body.hits.hits).flatMap((y: any) => y.map((x: any) => x._source))
  }

  const searchAll:any = { index, size: defaultSize }
  if (!authorizedByPermission(contract.authentication, authInput)) { searchAll.body = { query: userIdFilter } }
  const all = await client().search(searchAll)
  const result = new Array(all.body.hits.hits).flatMap((y: any) => y.map((x: any) => x._source))
  return result
}
export const post = async <T extends {[key: string]: any}>(index: string, contract: ContractType<T, any>,
  auth:AuthInput, body: T):
Promise<T & any> => {
  if (!authorizedByPermission(contract.authentication, auth)) throw new RequestHandlingError('User not authorized to POST', 403)
  const id = body.id || uuid()
  const newBody: any = { ...body }
  newBody.id = id

  if (contract.manageFields.createdBy === true) {
    newBody.createdBy = auth.sub
  }
  await client().create({
    id,
    index: index.toLocaleLowerCase(),
    refresh: 'wait_for',
    body: newBody
  })

  return newBody
}

export const del = async (index: string, contract: ContractType<any, any>,
  auth:AuthInput, id: string|string[]): Promise<any> => {
  if (Array.isArray(id)) return (await Promise.all(id.map(x => del(index, contract, auth, x)))).map(x => x[0])
  const result = await get(index, contract, auth, id)
  if (!result || result.length === 0) {
    throw new RequestHandlingError('User has no right to delete this', 403)
  }

  await client().delete(
    { index: index.toLocaleLowerCase(), id, refresh: 'wait_for' })
  return result
}

export const patch = async <T extends object, K extends object>(index: string, contract: ContractType< T, K>,
  auth:AuthInput, body: T, id: string
): Promise<K> => {
  const result = await get(index, contract, auth, id)
  if (!result || result.length === 0) {
    throw new RequestHandlingError('User has no right to patch this', 403)
  }
  await client().update(
    {
      index: index.toLocaleLowerCase(),
      refresh: 'wait_for',
      id,
      body: { doc: body }
    })
  return (await get(index, contract, auth, id) as any)[0]
}

export const put = async <T extends object, K extends object>(index: string, contract: ContractType<T, K>,
  auth:AuthInput, body: T, id: string
): Promise<K> => {
  const result: any[] = await get(index, contract, auth, id)
  if (!result || result.length === 0) {
    throw new RequestHandlingError('User has no right to patch this', 403)
  }
  const newBody :any = { ...body }
  if (contract.manageFields.createdBy === true) {
    newBody.createdBy = result[0].createdBy
  }

  await client().index(
    {
      index: index.toLocaleLowerCase(),
      refresh: 'wait_for',
      id,
      body: newBody
    })
  return (await get(index, contract, auth, id) as any)[0]
}
