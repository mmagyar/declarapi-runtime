import test, { ExecutionContext } from 'ava'
import { ContractType, ManageableFields, AuthenticationDefinition, AuthInput, HttpMethods, Implementation, HandleResult, AnyContract, HandleResultSuccess, isContractInError, HandleErrorResponse } from './globalTypes.js'
import { Validation } from 'yaschva'
import { AbstractBackend } from './backendAbstract.js'
import { getProvider } from './backendProviders.js'
test('uses test contract generation', t => t.pass())
export type TestContractOut = {id:string, b:string}
export type TestContractIn = {id?:string, a:string}
export type TestContractType<T extends HttpMethods, IN> =
  ContractType<T, Implementation, IN, TestContractOut>

export type TestFn<CONTR extends AnyContract> = (backend:AbstractBackend<any>, postContract:CONTR)=>(t:ExecutionContext)=> Promise<void>
export const runTestArray = <CONTR extends AnyContract>(contract:CONTR, tests: [string, TestFn<CONTR>][]) => {
  for (const testE of tests) {
    const implementation :Implementation = { ...contract.implementation }
    const alphanumericTestName = (Date.now() + testE[0].trim().toLowerCase().replace(' ', '_').replace(/[^a-z0-9]/gi, '')).substring(0, 255)
    switch (implementation.type) {
      case 'key-value':
        implementation.prefix = alphanumericTestName
        break
      case 'elasticsearch':
        implementation.index = alphanumericTestName
        break
      case 'manual':
        throw new Error('manual implementation not supported with these tests')
    }

    const postContract = { ...contract, implementation }
    test(testE[0], testE[1](getProvider(postContract.implementation.type), postContract))
  }
}

export const defaultHandler = async <T extends HttpMethods, IN>(input: {id?:string, a:string, c?:string}, auth:AuthInput, _2:TestContractType<T, IN>, id?:string) =>
  ({ result: { id: input.id || id || 'gen', b: input.a, c: input.c } })

export const getContract = <T extends HttpMethods = 'GET', IN = TestContractIn>(input: {
  manageFields?:ManageableFields,
  authentication?:AuthenticationDefinition,
  name?:string,
  handle? : (input: IN, auth: AuthInput, contract:TestContractType<T, IN>, id?:string) => Promise<HandleResult<TestContractOut>>,
  method?: T,
  implementation?: Implementation,
  arguments ?: Validation
  returns?: Validation
} = { handle: defaultHandler as any }
):TestContractType<T, IN> => {
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

export const ExpectGood = <A extends ContractType<any, any, any, OUT>, OUT=unknown>(
  doAction: ((backend:AbstractBackend<any>, contract:A, t:ExecutionContext) => Promise<HandleResult<OUT>>),
  asserts: ((a:HandleResultSuccess<OUT>, t:ExecutionContext, contract:A) => (void|Promise<void>))) =>
    (backend:AbstractBackend<any>, contract:A) => async (t:ExecutionContext) => {
      const result = await doAction(backend, contract, t)
      return isContractInError(result)
        ? t.fail('Expected success: ' + JSON.stringify(result, null, 2))
        : asserts(result, t, contract)
    }

export const ExpectBad = <A extends ContractType<any, any, any, OUT>, OUT=unknown>(
  doAction: ((backend:AbstractBackend<any>, contract:A, t:ExecutionContext) => Promise<HandleResult<OUT>>),
  asserts: ((a:HandleErrorResponse, t:ExecutionContext, contract:A) => (void|Promise<void>))) =>
    (backend:AbstractBackend<any>, contract:A) => async (t:ExecutionContext) => {
      const result = await doAction(backend, contract, t)
      return isContractInError(result)
        ? asserts(result, t, contract)
        : t.fail('Expected success: ' + JSON.stringify(result, null, 2))
    }
