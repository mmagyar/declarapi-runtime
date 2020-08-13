import { ObjectType, Validation } from 'yaschva'

export type AuthType = (string | {createdBy: boolean})[] | boolean
export type ManageableFields = { createdBy?: boolean }

export type HttpMethods = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type SearchTypes = 'textSearch' | 'full' | 'idOnly' | ObjectType;

export type AuthInput = {permissions? : string [], sub?: string}
export type ContractAuth = { authentication: AuthType}
export type HandlerAuth = AuthInput & ContractAuth

export type ContractType<T, K> = {
  name: string
  type: HttpMethods
  manageFields: ManageableFields,
  handle?: (input: T, auth: HandlerAuth, contract:ContractType<T, K>) => Promise<K>
  arguments: Validation
  returns: Validation
} & ContractAuth
