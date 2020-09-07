import {
  ContractType,
  ManageableFields,
  AuthInput,
  AuthenticationDefinition,
  Implementation,
  HandleResult
} from './globalTypes.js'

export const authorizedByPermission = (
  auth: AuthenticationDefinition,
  authInput: AuthInput
) =>
  typeof auth === 'boolean' ||
  auth.some(x => (authInput.permissions || []).some(y => x === y))

export const getUserIdFields = (fields: ManageableFields): string[] =>
  Object.entries(fields).filter(x => x[1]).map(x => x[0])

export const filterToAccess = (
  input: any[],
  auth: AuthenticationDefinition,
  authInput: AuthInput,
  fields: ManageableFields
): any[] =>
  authorizedByPermission(auth, authInput) ? input : input.filter((x: any) =>
    getUserIdFields(fields).some(y => x[y] === authInput.sub)
  )

export const keyId = (index: string, id: string): string =>
  `${index}:records:${id}`

export type Get<IMPL extends Implementation> = <IN, OUT>(
  contract: ContractType<'GET', IMPL, IN, OUT>,
  auth: AuthInput,
  id: string | string[] | undefined,
  body?: IN
) => Promise<HandleResult<OUT>>

export type Post<IMPL extends Implementation> = <IN, OUT>(
  contract: ContractType<'POST', IMPL, IN, OUT>,
  auth: AuthInput,
  id: string | undefined,
  body: IN
) => Promise<HandleResult<OUT>>

export type Delete<IMPL extends Implementation> = <IN, OUT>(
  contract: ContractType<'DELETE', IMPL, IN, OUT>,
  auth: AuthInput,
  id: string | string[]
) => Promise<HandleResult<OUT>>

export type Patch<IMPL extends Implementation> = <IN, OUT>(
  contract: ContractType<'PATCH', IMPL, IN, OUT>,
  auth: AuthInput,
  id: string,
  body: IN
) => Promise<HandleResult<OUT>>

export type Put<IMPL extends Implementation> = <IN, OUT>(
  contract: ContractType<'PUT', IMPL, IN, OUT>,
  auth: AuthInput,
  id: string,
  body: IN
) => Promise<HandleResult<OUT>>

export type AbstractBackend<K extends Implementation> = {
  get: Get<K>
  post: Post<K>
  delete: Delete<K>
  patch: Patch<K>
  put: Put<K>
}

export const forbidden = (data: any, errors: string[] = []) => ({
  errorType: 'forbidden',
  data,
  status: 403,
  errors
})
