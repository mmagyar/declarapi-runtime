import elastic from '@elastic/elasticsearch'
import { v4 as uuid } from 'uuid'
import { AuthInput, ContractType, Implementations, AuthenticationDefinition, ManageableFields } from './globalTypes.js'
import { mapFilter } from 'microtil'
import { AbstractBackend, getUserIdFields, filterToAccess, authorizedByPermission, BackendResult } from './backendAbstract.js'
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
export const defaultSize = 64
type ES = Implementations.elasticsearch
const getById = async (index:string, id:string) => {
  const { body: { _source } } = await client().get({ index, id })
  return _source
}
const getByIdChecked = async (
  index:string,
  id:string,
  authentication:AuthenticationDefinition,
  auth:AuthInput,
  manageFields:ManageableFields
) => filterToAccess([getById(index, id)], authentication, auth, manageFields)

export const get = async <IN, OUT>(
  contract: ContractType<'GET', ES, IN, OUT>,
  auth: AuthInput,
  input:IN
): Promise<BackendResult<OUT>> => {
  const index = contract.implementation.index.toLowerCase()
  const { manageFields, authentication: authDef } = contract
  const userIdFilter: any = {
    bool: {
      should: getUserIdFields(manageFields).map(userIdField => {
        const r:any = { term: { } }
        r.term[userIdField] = auth.sub
        return r
      })
    }
  }

  const id:string | string[] = (input as any)?.id
  const search:string = (input as any)?.search
  if (Array.isArray(id)) {
    if (id.length === 0) return [] as any
    const { body: { docs } } = await client().mget({ index, body: { ids: id } })
    return filterToAccess(mapFilter(docs, (x: any) => x._source), authDef, auth, manageFields) as any
  } else if (id) {
    return getByIdChecked(index, id, authDef, auth, manageFields) as any
  } else if (search) {
    const queryString = {
      query: {
        bool: {
          must: [{ simple_query_string: { query: search } }]
        }
      }

    }
    if (!authorizedByPermission(authDef, auth)) queryString.query.bool.must.push(userIdFilter)
    const all = await client().search({
      index,
      body: queryString,
      size: contract.implementation.maxResults || defaultSize
    })
    return new Array(all.body.hits.hits).flatMap((y: any) => y.map((x: any) => x._source)) as any
  }

  const searchAll:any = { index, size: contract.implementation.maxResults || defaultSize }
  if (!authorizedByPermission(authDef, auth)) { searchAll.body = { query: userIdFilter } }
  const all = await client().search(searchAll)
  const result = new Array(all.body.hits.hits).flatMap((y: any) => y.map((x: any) => x._source))
  return result as any
}

export const post = async <IN, OUT>(
  contract: ContractType<'POST', ES, IN, OUT>,
  auth:AuthInput,
  id: string|undefined,
  body: IN): Promise<BackendResult<OUT>> => {
  if (!authorizedByPermission(contract.authentication, auth)) return { error: 'forbidden' }
  const idNew = id || uuid()
  const newBody: any = { ...body }
  newBody.id = idNew

  if (contract.manageFields.createdBy === true) {
    newBody.createdBy = auth.sub
  }
  await client().create({
    id: idNew,
    index: contract.implementation.index.toLowerCase(),
    refresh: 'wait_for',
    body: newBody
  })

  return { result: newBody }
}

export const del = async <IN, OUT>(
  contract: ContractType<'DELETE', ES, IN, OUT>,
  auth:AuthInput,
  id: string|string[]
): Promise<BackendResult<OUT>> => {
  const index = contract.implementation.index.toLowerCase()
  if (Array.isArray(id)) {
    await Promise.all(id.map(x => del<IN, OUT>(contract, auth, x)))
    return { result: {} as any }
  }
  const result = await getByIdChecked(index, id, contract.authentication, auth, contract.manageFields)
  if (!result || result.length === 0) return { error: 'forbidden' }

  await client().delete({ index, id, refresh: 'wait_for' })
  return { result: {} as any }
}

export const patch = async <IN, OUT>(
  contract: ContractType<'PATCH', ES, IN, OUT>,
  auth:AuthInput,
  id: string,
  body: IN
): Promise<BackendResult<OUT>> => {
  const index = contract.implementation.index.toLowerCase()
  const result = await getByIdChecked(index, id, contract.authentication, auth, contract.manageFields)
  if (!result || result.length === 0) return { error: 'forbidden' }

  await client().update(
    {
      index: index.toLocaleLowerCase(),
      refresh: 'wait_for',
      id,
      body: { doc: body }
    })
  return { result: {} as any }
}

export const put = async <IN, OUT>(
  contract: ContractType<'PUT', ES, IN, OUT>,
  auth:AuthInput,
  id: string,
  body: IN
): Promise<BackendResult<OUT>> => {
  const index = contract.implementation.index.toLowerCase()
  const result = await getByIdChecked(index, id, contract.authentication, auth, contract.manageFields)

  if (!result || result.length === 0) return { error: 'forbidden' }

  const newBody :any = { ...body }
  if (contract.manageFields.createdBy === true) {
    newBody.createdBy = result[0].createdBy
  }

  await client().index(
    {
      index,
      refresh: 'wait_for',
      id,
      body: newBody
    })
  return { result: {} as any }
}

export const getElasticsearchProvider = ():AbstractBackend<ES> => ({
  get,
  post,
  put,
  patch,
  delete: del
})
