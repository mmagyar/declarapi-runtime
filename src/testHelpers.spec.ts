import ava from 'ava'
import { ContractType, ManageableFields, AuthenticationDefinition, AuthInput, HttpMethods, Implementation, HandleResult } from './globalTypes.js'
import { Validation } from 'yaschva'
ava('uses test contract generation', t => t.pass())
export type TestContractOut = {id:string, b:string}
export type TestContractIn = {id?:string, a:string}
export type TestContractType<T extends HttpMethods> =
  ContractType<T, Implementation, TestContractIn, TestContractOut>

export const defaultHandler = async <T extends HttpMethods>(input: {id?:string, a:string, c?:string}, auth:AuthInput, _2:TestContractType<T>, id?:string) =>
  ({ result: { id: input.id || id || 'gen', b: input.a, c: input.c } })

export const getContract = <T extends HttpMethods = 'GET'>(input: {
  manageFields?:ManageableFields,
  authentication?:AuthenticationDefinition,
  name?:string,
  handle? : (input: TestContractIn, auth: AuthInput, contract:TestContractType<T>, id?:string) => Promise<HandleResult<TestContractOut>>,
  method?: T,
  implementation?: Implementation,
  arguments ?: Validation
  returns?: Validation
} = { handle: defaultHandler }
):TestContractType<T> => {
  return {
    authentication: input.authentication || false,
    arguments: input.arguments || { id: ['string', '?'], a: 'string', c: ['?', 'string'] },
    implementation: input.implementation || { type: 'manual' },
    returns: input.returns || { id: 'string', b: 'string', c: ['?', 'string'] },
    handle: input.handle,
    type: (input.method || 'GET') as T,
    name: input.name || 'test-contract',
    manageFields: input.manageFields || {}
  }
}
