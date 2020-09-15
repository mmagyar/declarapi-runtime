import { Validation } from 'yaschva'
import {
  ContractType,
  AuthInput,
  AuthenticationDefinition,
  Implementation,
  HandleResult
} from './globalTypes.js'

export type BackendMetadata = {
  id: string,
  createdBy?: string,
  createdAt?: string,
  updatedBy?: string,
  updatedAt?: string

}
export type BackendDataStructure<OUT> = {
  data: OUT,
  metadata: BackendMetadata
}

export const metadataValidation :Validation = {
  id: 'string',
  createdBy: ['?', 'string'],
  createdAt: ['?', 'string'],
  updatedBy: ['?', 'string'],
  updatedAt: ['?', 'string']
}
export const authorizedByPermission = (
  auth: AuthenticationDefinition,
  authInput: AuthInput
) =>
  typeof auth === 'boolean' ||
  auth.some(x => (authInput.permissions || []).some(y => x === y))

// export const filterToAccess = (
//  input: any[],
//  auth: AuthenticationDefinition,
//  authInput: AuthInput,
// ): any[] =>
//  authorizedByPermission(auth, authInput) ? input : input.filter((x: any) =>
//    x === authInput.sub)
//  )

export const keyId = (index: string, id: string): string =>
  `${index}:records:${id}`

export type Get<IMPL extends Implementation> = <IN, OUT extends Array<BackendDataStructure<unknown>>>(
  contract: ContractType<'GET', IMPL, IN, OUT>,
  auth: AuthInput,
  id: string | string[] | undefined,
  body?: IN
) => Promise<HandleResult<OUT>>

export type Post<IMPL extends Implementation> = <IN>(
  contract: ContractType<'POST', IMPL, IN, BackendMetadata>,
  auth: AuthInput,
  id: string | undefined,
  body: IN
) => Promise<HandleResult<BackendMetadata>>

export type Delete<IMPL extends Implementation> = <IN>(
  contract: ContractType<'DELETE', IMPL, IN, Array<BackendMetadata>>,
  auth: AuthInput,
  id: string | string[]
) => Promise<HandleResult<Array<BackendMetadata>>>

export type Patch<IMPL extends Implementation> = <IN>(
  contract: ContractType<'PATCH', IMPL, IN, BackendMetadata>,
  auth: AuthInput,
  id: string,
  body: IN
) => Promise<HandleResult<BackendMetadata>>

export type Put<IMPL extends Implementation> = <IN>(
  contract: ContractType<'PUT', IMPL, IN, BackendMetadata>,
  auth: AuthInput,
  id: string,
  body: IN
) => Promise<HandleResult<BackendMetadata>>

export type AbstractBackend<K extends Implementation> = {
  get: Get<K>
  post: Post<K>
  delete: Delete<K>
  patch: Patch<K>
  put: Put<K>
}

export const forbidden = (data: any, errors: string[] = ['forbidden']) => ({
  errorType: 'forbidden',
  data,
  status: 403,
  errors
})

export const notFound = (data: any, errors: string[] = ['not found']) => ({
  errorType: 'notFound',
  data,
  status: 404,
  errors
})
