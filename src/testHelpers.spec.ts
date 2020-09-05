import test, { ExecutionContext } from 'ava'
import { ContractType, ManageableFields, AuthenticationDefinition, AuthInput, HttpMethods, Implementation, HandleResult, HandleResultSuccess, isContractInError, HandleErrorResponse, Implementations } from './globalTypes.js'
import { Validation, generate, validate } from 'yaschva'
import { AbstractBackend } from './backendAbstract.js'
import { getProvider } from './backendProviders.js'
test('uses test contract generation', t => t.pass())
export type TestContractOut = {id:string, b:string}
export type TestContractIn = {id?:string, a:string}
export type TestContractType<T extends HttpMethods, IMPL extends Implementation, IN, OUT> =
  ContractType<T, IMPL, IN, OUT>

export type CONTRACT_COLLECTION<A extends Implementation> = {
  post: ContractType<'POST', A, any, any>,
  get: ContractType<'GET', A, any, any>,
  del: ContractType<'DELETE', A, any, any>,
  put: ContractType<'PUT', A, any, any>,
  patch: ContractType<'PATCH', A, any, any>
}

export type ANY_CONTRACTS = CONTRACT_COLLECTION<Implementation>

export type TestFn = (backend:AbstractBackend<any>, postContract:CONTRACT_COLLECTION<any>)=>(t:ExecutionContext)=> Promise<void>
export const runTestArray = <A extends Implementation>(contracts:CONTRACT_COLLECTION<A>, tests: [string, TestFn][]) => {
  if (!contracts.get) throw new Error(JSON.stringify(contracts, null, 2))
  for (const testE of tests) {
    const implementation :Implementation = { ...contracts.get.implementation }
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

    const postContract:CONTRACT_COLLECTION<any> = {
      get: { ...contracts.get, implementation },
      post: { ...contracts.post, implementation },
      del: { ...contracts.del, implementation },
      patch: { ...contracts.patch, implementation },
      put: { ...contracts.put, implementation }

    }
    test(testE[0], testE[1](getProvider(implementation.type), postContract))
  }
}

export const mockHandle = async <METHOD extends HttpMethods, IMPL extends Implementation, IN, OUT>(input: IN, _: AuthInput, contract:ContractType<METHOD, IMPL, IN, OUT>) : Promise<HandleResult<OUT>> => {
  const valid = validate(contract.arguments, input)
  if (valid.result === 'fail') {
    return { errorType: 'validation error', errors: [], status: 400 }
  }
  return { result: generate(contract.returns) }
}

export const getContract = <T extends HttpMethods, IMPL extends Implementation=Implementations.manual, IN = TestContractIn, OUT = TestContractOut>(input: {
  manageFields?:ManageableFields,
  authentication?:AuthenticationDefinition,
  name?:string,
  handle? : (input: IN, auth: AuthInput, contract:TestContractType<T, IMPL, IN, OUT>, id?:string) => Promise<HandleResult<OUT>>,
  method?: T,
  implementation?: IMPL,
  arguments ?: Validation
  returns?: Validation
} = { handle: mockHandle }
):TestContractType<T, IMPL, IN, OUT> => {
  return {
    authentication: input.authentication || false,
    arguments: input.arguments || { id: ['string', '?'], a: 'string', c: ['?', 'string'] },
    implementation: input.implementation || ({ type: 'manual' })as any,
    returns: input.returns || { id: 'string', b: 'string', c: ['?', 'string'] },
    handle: input.handle,
    type: (input.method || 'GET') as T,
    name: input.name || 'test-contract',
    manageFields: input.manageFields || {}
  }
}

export const ExpectGood = <OUT=unknown>(
  doAction: ((backend:AbstractBackend<any>, contract:ANY_CONTRACTS, t:ExecutionContext) => Promise<HandleResult<OUT>>),
  asserts: ((a:HandleResultSuccess<OUT>, t:ExecutionContext, contract:ANY_CONTRACTS) => (void|Promise<void>))) =>
    (backend:AbstractBackend<any>, contract:ANY_CONTRACTS) => async (t:ExecutionContext) => {
      const result = await doAction(backend, contract, t)
      return isContractInError(result)
        ? t.fail('Expected success: ' + JSON.stringify(result, null, 2))
        : asserts(result, t, contract)
    }

export const ExpectBad = <OUT=unknown>(
  doAction: ((backend:AbstractBackend<any>, contract:ANY_CONTRACTS, t:ExecutionContext) => Promise<HandleResult<OUT>>),
  asserts: ((a:HandleErrorResponse, t:ExecutionContext, contract:ANY_CONTRACTS) => (void|Promise<void>))) =>
    (backend:AbstractBackend<any>, contract:ANY_CONTRACTS) => async (t:ExecutionContext) => {
      const result = await doAction(backend, contract, t)
      return isContractInError(result)
        ? asserts(result, t, contract)
        : t.fail('Expected success: ' + JSON.stringify(result, null, 2))
    }
type ALL_DATA ={a:string, b?:number}
type GET_INPUT = {id?:string | string[]} | undefined
type GET_OUTPUT = ALL_DATA[]
const implementation :Implementation = { type: 'key-value', backend: 'memory', prefix: 'test', allowGetAll: true }
export const baseDataSchema = { a: 'string', b: ['number', '?'] }
export const contractCollection = ():CONTRACT_COLLECTION<typeof implementation> => ({
  post: getContract<'POST', typeof implementation>({
    method: 'POST',
    implementation,
    arguments: baseDataSchema,
    returns: baseDataSchema
  }),
  get: getContract<'GET', typeof implementation, GET_INPUT, GET_OUTPUT>({
    method: 'GET',
    implementation,
    arguments: { id: ['string', '?', { $array: 'string' }] },
    returns: { $array: baseDataSchema }
  }),
  del: getContract({
    method: 'DELETE',
    implementation,
    arguments: {},
    returns: {}
  }),
  put: getContract({
    method: 'PUT',
    implementation,
    arguments: baseDataSchema,
    returns: {}
  }),
  patch: getContract({
    method: 'PATCH',
    implementation,
    arguments: { a: ['?', 'string'], b: ['number', '?'] },
    returns: {}
  })

})
