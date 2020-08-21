import { KV, ValueType, KvListReturn, KvDataTypes, GetResultType } from './abstractKv.js'
import FormData from 'form-data'
import fetch, { Response, RequestInfo, RequestInit } from 'node-fetch'
import { RequestHandlingError } from './RequestHandlingError.js'

const delay = async (time = 1000) => new Promise((resolve) => setTimeout(() => resolve(), time))

const fetchLimited = async (
  url: RequestInfo,
  init?: RequestInit,
  nowOriginal? : number
): Promise<Response> => {
  const now = nowOriginal || Date.now()
  const fetched = await fetch(url, init)
  if (fetched.status === 429) {
    console.log('Rate Limited', Date.now() - now, fetched.headers, await fetched.json())
    await delay()
    return fetchLimited(url, init, now)
  }
  // const requestTook = Date.now() - now
  // if (nowOriginal) console.log('REQUEST TOOK', requestTook)
  return fetched
}

const fetchWithThrow = async (
  url: RequestInfo,
  init?: RequestInit,
  throwOnKeyNotFound: boolean = true
): Promise<any> => {
  const fetched = fetchLimited(url, init)
  const [status, result]:[number, string] =
  await fetched.then(async x => [x.status, await x.text()])

  if (status >= 400) {
    if (!throwOnKeyNotFound && status === 404) {
      return undefined
    }
    throw new RequestHandlingError(result, status)
  }
  return result
}

// const errorCodes = {
//   10001: 'service temporarily unavailable',
//   10002: 'missing CF-Ray header',
//   10003: 'missing account public ID',
//   10004: 'missing account tag',
//   10005: 'URL parameter account tag does not match JWT account tag',
//   10006: 'malformed account tag',
//   10007: 'malformed page argument',
//   10008: 'malformed per_page argument',
//   10009: 'key not found',
//   10010: 'malformed namespace',
//   10011: 'malformed namespace ID',
//   10012: 'malformed value',
//   10013: 'namespace not found',
//   10014: 'namespace already exists',
//   10015: 'missing account internal ID',
//   10016: 'malformed account internal ID',
//   10018: 'too many namespaces in this account',
//   10019: 'missing title',
//   10021: 'this namespace does not support the list-keys endpoint',
//   10022: 'too many requests',
//   10024: 'payload too large',
//   10025: 'endpoint does not exist',
//   10026: 'not entitled',
//   10028: 'invalid limit argument',
//   10029: 'invalid request',
//   10030: 'key too long',
//   10033: 'invalid expiration',
//   10034: 'invalid expiration ttl',
//   10035: 'this namespace does not support the bulk endpoint',
//   10037: 'the user lacks the permissions to perform this operation',
//   10038: 'this namespace does not support the list-keys prefix parameter',
//   10041: 'invalid "list keys" cursor',
//   10042: 'illegal key name',
//   10043: 'invalid order',
//   10044: 'invalid direction',
//   10045: 'deprecated endpoint',
//   10046: 'too many bulk requests',
//   10047: 'invalid metadata'
// }
export const workerKv = (): KV => {
  const accountIdentifier = process.env.WORKER_ACCOUNT
  if (!accountIdentifier) throw new Error('Account id not set on WORKER_ACCOUNT')
  const namespaceIdentifier = process.env.WORKER_KV_NAMESPACE
  if (!namespaceIdentifier) throw new Error('Namespace id not set on WORKER_KV_NAMESPACE')
  const token = process.env.WORKER_KV_TOKEN
  if (!token) throw new Error('Auth token not set on WORKER_KV_TOKEN')

  const headers = ({
    Authorization: `Bearer ${token}`
  })
  const baseUrl = 'https://api.cloudflare.com/client/v4'
  const namespaced = `${baseUrl}/accounts/${accountIdentifier}/storage/kv/namespaces/${namespaceIdentifier}`

  const list = async (options?: {limit?: number, cursor?: string, prefix?: string}):Promise<KvListReturn> => {
    const { cursor, limit, prefix } = options || {}

    const params = []
    if (limit)params.push(`limit=${limit < 10 ? 10 : limit}`)
    if (cursor)params.push(`cursor=${cursor}`)
    if (prefix)params.push(`prefix=${prefix}`)

    const url = `${namespaced}/keys${params.length ? '?' + params.join('&') : ''}`

    const response = await fetchWithThrow(url, { headers })
    if (!response.success) {
      throw new Error(JSON.stringify(response))
    }
    return {
      cursor: response.result_info.cursor,
      keys: response.result,
      list_complete: !response.result_info.cursor || response.result.length === 0
    }
  }

  const get = async <T extends KvDataTypes>(key:string, type?:T) : Promise<GetResultType<T>|null> => {
    if (type !== 'text' || type !== 'json') throw new Error('API only supports text type')

    const result = await fetchWithThrow(`${namespaced}/values/${key}`, { headers })
    if (!result) return null

    if (type === 'text') return result
    return JSON.parse(result)
  }

  const put = async (key:string, value:ValueType, additional?: {metadata?:any, expiration?:number, expirationTtl?:number}): Promise<void> => {
    const { expiration, expirationTtl, metadata } = additional || {}

    const form = new FormData()

    if (metadata) { form.append('metadata', JSON.stringify(metadata)) }

    if (typeof value === 'string') {
      form.append('value', value)
    } else {
      form.append('value', JSON.stringify(value))
    }
    const params = []
    if (expiration)params.push(`expiration=${expiration}`)
    else if (expirationTtl)params.push(`expiration_ttl=${expirationTtl}`)

    const url = `${namespaced}/values/${key}${params.length ? '?' + params.join('&') : ''}`

    return fetchWithThrow(url, {
      headers: { ...headers, ...form.getHeaders() },
      method: 'PUT',
      body: form
    })
  }

  const destroy = async (key:string | string[]):Promise<void> => {
    if (Array.isArray(key)) {
      return fetchWithThrow(`${namespaced}/bulk`, {
        headers: { ...headers, 'Content-Type': 'application/json' },
        method: 'DELETE',
        body: JSON.stringify(key)
      })
    }

    return fetchWithThrow(`${namespaced}/values/${key}`, { headers, method: 'DELETE' })
  }

  const getWithMetadata = async (key:string) : Promise<{value:string | null, metadata: object | null}> => {
    return {
      value: await get(key, 'text'),
      metadata: (await list({ prefix: key }))?.keys[0]?.metadata || null
    }
  }

  return { list, get, put, delete: destroy, getWithMetadata }
}

export default workerKv
