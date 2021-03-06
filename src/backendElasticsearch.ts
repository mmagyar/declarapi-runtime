import elastic from '@elastic/elasticsearch'
import { v4 as uuid } from 'uuid'
import { AuthInput, ContractType, Implementations, AuthenticationDefinition, ManageableFields, HandleResult } from './globalTypes.js'
import { mapFilter } from 'microtil'
import { AbstractBackend, filterToAccess, authorizedByPermission, forbidden, notFound } from './backendAbstract.js'
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
export const createIndex = (name:string) => client().indices.create({ index: name })
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
) => filterToAccess([await getById(index, id)], authentication, auth, manageFields)

export const get = async <IN, OUT>(
  contract: ContractType<'GET', ES, IN, OUT>,
  auth: AuthInput,
  idIn: string | string[] | undefined,
  input?:IN
): Promise<HandleResult<OUT>> => {
  const index = contract.implementation.index.toLowerCase()
  const { manageFields, authentication: authDef } = contract
  const userIdFilter: any = {
    match: {
      createdBy: auth.sub || ''
    }
  }

  const id:string | string[] = idIn || (input as any)?.id
  const search:string = (input as any)?.search
  if (Array.isArray(id)) {
    if (id.length === 0) return { result: ([] as any) }
    const { body: { docs } } = await client().mget({ index, body: { ids: id } })
    return { result: filterToAccess(mapFilter(docs, (x: any) => x._source), authDef, auth, manageFields) as any }
  } else if (id) {
    try {
      const got = await getByIdChecked(index, id, authDef, auth, manageFields) as any[]
      if (got.length === 0) {
        return forbidden(id)
      }
      return { result: (got as any) }
    } catch (got) {
      if (got.meta.statusCode === 404) return notFound({ id, input })
      throw got
    }
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
    return { result: new Array(all.body.hits.hits).flatMap((y: any) => y.map((x: any) => x._source)) as any }
  }

  const searchAll:any = { index, size: contract.implementation.maxResults || defaultSize }
  if (!authorizedByPermission(authDef, auth)) {
    searchAll.body = {
      query: {
        bool: {
          must: [userIdFilter]
        }
      }
    }
  }

  const all = await client().search(searchAll)
  const result = new Array(all.body.hits.hits).flatMap((y: any) => y.map((x: any) => x._source))

  // console.log('IN THE END', result)
  return { result: result as any }
}

export const post = async <IN, OUT>(
  contract: ContractType<'POST', ES, IN, OUT>,
  auth:AuthInput,
  id: string|undefined,
  body: IN): Promise<HandleResult<OUT>> => {
  const idNew = id || uuid()
  const newBody: any = { ...body }
  if (contract.manageFields.id === true) { newBody.id = idNew }

  if (contract.manageFields.createdBy === true) {
    newBody.createdBy = auth.sub
  }

  try {
    await client().create({
      id: idNew,
      index: contract.implementation.index.toLowerCase(),
      refresh: 'wait_for',
      body: newBody
    })
  } catch (e) {
    if (e.meta.statusCode === 409) return { errorType: 'conflict', data: body, status: 409, errors: [] }
    throw e
  }

  return { result: newBody }
}

export const del = async <IN, OUT>(
  contract: ContractType<'DELETE', ES, IN, OUT>,
  auth:AuthInput,
  id: string|string[]
): Promise<HandleResult<OUT>> => {
  const index = contract.implementation.index.toLowerCase()
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
  try {
    const result = await getByIdChecked(
      index, id, contract.authentication, auth, contract.manageFields)
    if (!result || result.length === 0) {
      return forbidden(id, ['Can\'t delete, unauthorized'])
    }

    await client().delete({ index, id, refresh: 'wait_for' })
  } catch (error) {
    if (error.meta.statusCode === 404) return { errorType: 'notFound', status: 404, data: id, errors: [] }
    throw error
  }
  return { result: {} as any }
}

export const patch = async <IN, OUT>(
  contract: ContractType<'PATCH', ES, IN, OUT>,
  auth:AuthInput,
  id: string,
  body: IN
): Promise<HandleResult<OUT>> => {
  const index = contract.implementation.index.toLowerCase()
  try {
    const result = await getByIdChecked(index, id, contract.authentication, auth, contract.manageFields)
    if (!result || result.length === 0) return forbidden({ id, body })
    let newBody:any = body
    if (contract.manageFields.createdBy === true) {
      newBody = { ...(body as any) }
      newBody.createdBy = result[0].createdBy
    }
    await client().update({
      index,
      refresh: 'wait_for',
      id,
      body: { doc: newBody }
    })
  } catch (error) {
    if (error.meta.statusCode === 404) return notFound({ id, body })
    throw error
  }
  return { result: {} as any }
}

export const put = async <IN, OUT>(
  contract: ContractType<'PUT', ES, IN, OUT>,
  auth:AuthInput,
  id: string,
  body: IN
): Promise<HandleResult<OUT>> => {
  const index = contract.implementation.index.toLowerCase()
  try {
    const result = await getByIdChecked(index, id, contract.authentication, auth, contract.manageFields)

    if (!result || result.length === 0) return forbidden({ id, body })

    let newBody:any = body
    if (contract.manageFields.createdBy === true) {
      newBody = { ...(body as any) }
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
  } catch (error) {
    if (error.meta.statusCode === 404) return notFound({ id, body })
    throw error
  }
}

export const getElasticsearchProvider = ():AbstractBackend<ES> => ({
  get,
  post,
  put,
  patch,
  delete: del
})
