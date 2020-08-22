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
