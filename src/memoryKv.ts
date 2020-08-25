import { KvListReturn, KV, ValueType, ListEntry, GetResultType, KvDataTypes } from './backendKv.js'

function ab2str (buf:ArrayBuffer):string {
  return String.fromCharCode.apply(null, (new Uint16Array(buf) as any))
}
function str2ab (str:string):ArrayBuffer {
  var buf = new ArrayBuffer(str.length * 2) // 2 bytes for each char
  var bufView = new Uint16Array(buf)
  for (var i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i)
  }
  return buf
}

export const memoryKV = (): KV => {
  const db = new Map<string, string>()
  const dbMeta = new Map<string, ListEntry>()

  const list = async (options?: {limit?: number, cursor?: string, prefix?: string}):Promise<KvListReturn> => {
    let currentCursor = ''
    let cursorFound = false
    const { cursor, limit, prefix } = options || {}
    const result = []
    for (const value of dbMeta.values()) {
      if (cursor && !cursorFound) {
        if (value.name === cursor) {
          cursorFound = true
        } else {
          continue
        }
      }
      if (limit && result.length === limit) {
        currentCursor = value.name
        break
      }

      if (!prefix || value.name.startsWith(prefix)) {
        result.push(value)
      }
    }
    return {
      keys: result,
      cursor: currentCursor,
      list_complete: true
    }
  }
  const get = async <T extends KvDataTypes>(key:string, type?:T) : Promise<GetResultType<T>|null> => {
    const returned = db.get(key)

    if (returned == null) return null

    if (type === 'json') return JSON.parse(returned)
    else if (type === 'arrayBuffer') return str2ab(returned) as GetResultType<T>
    else if (type === 'stream') return returned == null ? null : JSON.parse(returned)

    return returned as GetResultType<T>
  }
  const put = async (key:string, value:ValueType, additional?: {metadata?:any, expiration?:number, expirationTtl?:number}): Promise<void> => {
    const { expiration, expirationTtl } = additional || {}
    const exp = expiration || (expirationTtl ? (Date.now() / 1000) + expirationTtl : undefined)
    if (value instanceof ArrayBuffer) {
      db.set(key, ab2str(value))
    } else {
      db.set(key, typeof value === 'string' ? value : JSON.stringify(value))
    }
    if (additional) { dbMeta.set(key, { name: key, metadata: additional.metadata, expiration: exp }) }
  }

  const destroy = async (key:string):Promise<void> => {
    db.delete(key)
    dbMeta.delete(key)
  }

  const getWithMetadata = async <T extends KvDataTypes>(key:string, type?:T) : Promise<{value:GetResultType<T> | null, metadata: object | null}> => {
    return {
      value: await get(key, type),
      metadata: (await list({ prefix: key }))?.keys[0]?.metadata || null
    }
  }

  return { list, get, put, delete: destroy, getWithMetadata }
}

export default memoryKV
