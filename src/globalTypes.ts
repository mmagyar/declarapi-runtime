import { ObjectType, Validation } from 'yaschva'

export type AuthenticationDefinition = (string | {createdBy: boolean})[] | boolean
export type ManageableFields = { createdBy?: boolean }

export type HttpMethods = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type SearchTypes = 'textSearch' | 'full' | 'idOnly' | ObjectType;

export type AuthInput = { permissions? : string [], sub?: string }

export type KeyValueStoreTypes ='memory' | 'workerKV' | {custom:string}
export namespace Implementations {
  /** Expect manual implementation, nothing is generated**/
  export type manual = {type:'manual'}
  /** Generate generic elasticsearch backend **/
  export type elasticsearch = { type: 'elasticsearch', index: string, maxResults?: number }
  /** Generate a generic key value store implementation use either:
   *  - in memory : only for testing / dev, no persistance
   *  - workerKV : using the HTTP API for cloudflare worker key value store.
   *               requires ENV vars to be set
   *  - custom : Use the implementation provided under global.customKV[custom]
   * **/
  export type keyValue = { type: 'key-value', prefix:string, backend: KeyValueStoreTypes, allowGetAll?: true}
}
export type Implementation =
  Implementations.manual |
  Implementations.elasticsearch |
  Implementations.keyValue

export type ContractType<METHOD extends HttpMethods, IMPL extends Implementation, IN, OUT> = {
  name: string
  type: METHOD
  manageFields: ManageableFields,
  handle?: (input: IN, auth: AuthInput, contract:ContractType<METHOD, IMPL, IN, OUT>, id?:string) => Promise<OUT>
  arguments: Validation
  returns: Validation
  authentication: AuthenticationDefinition
  implementation: IMPL
}
