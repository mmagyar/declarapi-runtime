import ava from 'ava'
import { ContractType, Implementations, ManageableFields, AuthenticationDefinition, AuthInput } from './globalTypes.js'

ava('It provides utility functions for testing', t => { t.pass() })

export type TestContractOut = {id:string, b:string}
export type TestContractIn = {id:string, a:string}
export type TestContractType =
  ContractType<'GET', Implementations.manual, TestContractIn, TestContractOut>
export const getContract = (input: {
  manageFields?:ManageableFields,
  authentication?:AuthenticationDefinition,
  name?:string,
  handle? : (input: TestContractIn, auth: AuthInput, contract:TestContractType) => Promise<TestContractOut>
} = {
  handle: async (input: {id:string, a:string, c?:string}) =>
    ({ id: input.id, b: input.a, c: input.c })
}
):TestContractType => {
  return {
    authentication: input.authentication || false,
    arguments: { id: 'string', a: 'string', c: ['?', 'string'] },
    implementation: { type: 'manual' },
    returns: { id: 'string', b: 'string', c: ['?', 'string'] },
    handle: input.handle,
    type: 'GET',
    name: input.name || 'test-contract',
    manageFields: input.manageFields || {}
  }
}
