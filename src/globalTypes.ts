import { ObjectType, Validation } from 'yaschva'

export type AuthenticationDefinition = (string | {createdBy: boolean})[] | boolean
export type ManageableFields = { createdBy?: boolean }

export type HttpMethods = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type SearchTypes = 'textSearch' | 'full' | 'idOnly' | ObjectType;

export type AuthInput = { permissions? : string [], sub?: string }

export type ContractType<T, K> = {
  name: string
  type: HttpMethods
  manageFields: ManageableFields,
  handle?: (input: T, auth: AuthInput, contract:ContractType<T, K>) => Promise<K>
  arguments: Validation
  returns: Validation
  authentication: AuthenticationDefinition
}
