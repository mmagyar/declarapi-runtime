import ava from 'ava'
import { ContractType, Implementations, ManageableFields, AuthenticationDefinition, AuthInput, HttpMethods } from './globalTypes.js'

ava('It provides utility functions for testing', t => { t.pass() })

export type TestContractOut = {id:string, b:string}
export type TestContractIn = {id?:string, a:string}
export type TestContractType =
  ContractType<HttpMethods, Implementations.manual, TestContractIn, TestContractOut>

export const defaultHandler = async (input: {id?:string, a:string, c?:string}, auth:AuthInput, _2:TestContractType, id?:string) =>
  ({ id: input.id || id || 'gen', b: input.a, c: input.c })

export const getContract = (input: {
  manageFields?:ManageableFields,
  authentication?:AuthenticationDefinition,
  name?:string,
  handle? : (input: TestContractIn, auth: AuthInput, contract:TestContractType, id?:string) => Promise<TestContractOut>,
  method?: HttpMethods
} = { handle: defaultHandler }
):TestContractType => {
  return {
    authentication: input.authentication || false,
    arguments: { id: ['string', '?'], a: 'string', c: ['?', 'string'] },
    implementation: { type: 'manual' },
    returns: { id: 'string', b: 'string', c: ['?', 'string'] },
    handle: input.handle,
    type: input.method || 'GET',
    name: input.name || 'test-contract',
    manageFields: input.manageFields || {}
  }
}
