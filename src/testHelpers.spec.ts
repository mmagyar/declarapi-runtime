import test, { ExecutionContext } from 'ava'
import { ContractType, ManageableFields, AuthenticationDefinition, AuthInput, HttpMethods, Implementation, HandleResult, HandleResultSuccess, isContractInError, HandleErrorResponse, Implementations, AnyContract } from './globalTypes.js'
import { Validation, generate, validate } from 'yaschva'
import { AbstractBackend } from './backendAbstract.js'
import { getProvider } from './backendProviders.js'
import { createIndex } from './backendElasticsearch.js'
import crypto from 'crypto'

import { inspect } from 'util'
inspect.defaultOptions = { depth: 6 }

test('uses test contract generation', t => t.pass())
export type TestContractOut = { id: string, b: string }
export type TestContractIn = { id?: string, a: string }
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

export type TestFn = (backend: AbstractBackend<any>, postContract: CONTRACT_COLLECTION<any>) => (t: ExecutionContext) => Promise<void>
export const runTestArray = <A extends Implementation>(
  input: {contracts: CONTRACT_COLLECTION<A>, skip:string[]},
  tests: [string, TestFn][]) => {
  const { contracts, skip } = input

  if (!contracts.get) throw new Error(JSON.stringify(contracts, null, 2))
  for (const testE of tests) {
    if (skip.indexOf(testE[0]) !== -1) {
      continue
    }
    const implementation: Implementation = { ...contracts.get.implementation }
    const id = crypto.randomBytes(16).toString('hex').toLowerCase()
    const time = Math.round(Date.now() / 1000)
    const simpleName = testE[0].trim().toLowerCase().replace(' ', '_').replace(/[^a-z0-9]/gi, '')

    const alphanumericTestName = ('t_' + time + id + simpleName).substring(0, 255)
    let name = ''
    let testSetup:((inputS: (t:ExecutionContext)=> Promise<void>) =>(t:ExecutionContext) => Promise<void>)|undefined
    switch (implementation.type) {
      case 'key-value':
        implementation.prefix = alphanumericTestName
        name = `kv${JSON.stringify(implementation.backend)}${(implementation.allowGetAll && '-getAll') || ''}`
        break
      case 'elasticsearch':
        implementation.index = alphanumericTestName
        name = 'elastic'

        process.env.ELASTIC_UNAUTHENTICATED = 'true'
        process.env.ELASTIC_HOST = 'http://localhost:9200'
        testSetup = (inputs) => async (t:ExecutionContext) => {
          await createIndex(implementation.index)
          return inputs(t)
        }

        break
      case 'manual':
        throw new Error('manual implementation not supported with these tests')
      default: throw new Error('not supported ' + JSON.stringify(implementation))
    }

    const postContract: CONTRACT_COLLECTION<any> = {
      get: { ...contracts.get, implementation },
      post: { ...contracts.post, implementation },
      del: { ...contracts.del, implementation },
      patch: { ...contracts.patch, implementation },
      put: { ...contracts.put, implementation }

    }
    if (testSetup) {
      test(`${name} ${testE[0]}`, testSetup(testE[1](getProvider(implementation.type), postContract)))
    } else {
      test(`${name} ${testE[0]}`, testE[1](getProvider(implementation.type), postContract))
    }
  }
}

export const mockHandle = async <METHOD extends HttpMethods, IMPL extends Implementation, IN, OUT>(input: IN, _: AuthInput, contract: ContractType<METHOD, IMPL, IN, OUT>): Promise<HandleResult<OUT>> => {
  const valid = validate(contract.arguments, input)
  if (valid.result === 'fail') {
    return { errorType: 'validation error', errors: [], status: 400 }
  }
  return { result: generate(contract.returns) }
}

export const getContract = <T extends HttpMethods, IMPL extends Implementation = Implementations.manual, IN = TestContractIn, OUT = TestContractOut>(input: {
  manageFields?: ManageableFields,
  authentication?: AuthenticationDefinition,
  name?: string,
  handle?: (input: IN, auth: AuthInput, contract: TestContractType<T, IMPL, IN, OUT>, id?: string) => Promise<HandleResult<OUT>>,
  method?: T,
  implementation?: IMPL,
  arguments?: Validation
  returns?: Validation
} = { handle: mockHandle }
): TestContractType<T, IMPL, IN, OUT> => {
  return {
    authentication: input.authentication || false,
    arguments: input.arguments || { id: ['string', '?'], a: 'string', c: ['?', 'string'] },
    implementation: input.implementation || ({ type: 'manual' }) as any,
    returns: input.returns || { id: 'string', b: 'string', c: ['?', 'string'] },
    handle: input.handle,
    type: (input.method || 'GET') as T,
    name: input.name || 'test-contract',
    manageFields: input.manageFields || {}
  }
}

export const ExpectGood = <OUT = unknown>(
  doAction: (
    backend: AbstractBackend<any>,
    contract: ANY_CONTRACTS,
    t: ExecutionContext
  ) => Promise<HandleResult<OUT>>,
  asserts: (
    a: HandleResultSuccess<OUT>,
    t: ExecutionContext,
    contract: ANY_CONTRACTS
  ) => void | Promise<void>) =>
    (backend: AbstractBackend<any>, contract: ANY_CONTRACTS) =>
      async (t: ExecutionContext) => {
        const result = await doAction(backend, contract, t)
        return isContractInError(result)
          ? t.fail('Expected success: ' + JSON.stringify(result, null, 2))
          : asserts(result, t, contract)
      }

export const ExpectBad = <OUT = unknown>(
  doAction: (
    backend: AbstractBackend<any>,
    contract: ANY_CONTRACTS,
    t: ExecutionContext
  ) => Promise<HandleResult<OUT>>,
  asserts: (
    a: HandleErrorResponse,
    t: ExecutionContext,
    contract: ANY_CONTRACTS
  ) => void | Promise<void>) =>
    (backend: AbstractBackend<any>, contract: ANY_CONTRACTS) =>
      async (t: ExecutionContext) => {
        const result = await doAction(backend, contract, t)
        return isContractInError(result)
          ? asserts(result, t, contract)
          : t.fail('Expected error, received success: ' + JSON.stringify(result, null, 2))
      }
type ALL_DATA = { a: string, b?: number }
type GET_INPUT = { id?: string | string[] } | undefined
type GET_OUTPUT = ALL_DATA[]

const implementations: {implementation: Implementation, skip: string[]}[] = [
  /** Test should run, but the automated testing pipeline
   * does not have elasticsearch installed yet   */
  /*  {
    implementation: {
      type: 'elasticsearch',
      index: 'testIndex'
    },
    skip: []
  }, */
  {
    implementation: {
      type: 'key-value',
      backend: 'memory',
      prefix: 'test',
      allowGetAll: true
    },
    skip: []
  },
  {
    implementation: {
      type: 'key-value',
      backend: 'memory',
      prefix: 'test'
    },
    /** These tests are skipped since they relay on getting all records */
    skip: [
      'get id and input is optional',
      'get posted id and input is optional, all is returned',
      'get with permissions: posted id and input is optional, unauthorized gets nothing back',
      'get with permissions: posted id and input is optional, all is returned for authorized user by permission',
      'get with permissions: posted id and input is optional, all is returned for authorized user by userId',
      'get with permissions: posted id and input is optional, all is returned for authorized user by userId (with records from multiple users)'
    ]
  }
]

export const baseDataSchema = { a: 'string', b: ['number', '?'] }

export const contractCollection = (): {contracts: CONTRACT_COLLECTION<Implementation>,
  skip:string[]}[] => implementations.map(impls => {
  const implementation = impls.implementation
  return ({
    skip: impls.skip,
    contracts: {
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
    }
  })
})

export const postSome = async <A extends unknown>(db: AbstractBackend<any>,
  contract: ContractType<'POST', any, any, A>,
  authInput: AuthInput = {},
  num: number = 20): Promise<HandleResult<A>[]> => {
  const id = (i: number) => `my_id_${authInput?.sub || ''}${i}`
  return (await Promise.all(Array.from(Array(num))
    .map((_, i) => db.post(contract, authInput, id(i), generate(contract.arguments)))))
    .map((x, i) => {
      if (x.errors) throw new Error(`Failed to post with id ${id(i)}: ${JSON.stringify(x, null, 2)}`)
      return x
    })
}

export const withAuth = <T extends AnyContract>(c: T): T => ({
  ...c,
  authentication: ['admin', { createdBy: true }],
  manageFields: { createdBy: true },
  returns: { $array: { ...((c.returns as any).$array), createdBy: 'string' } }
})

export const throwOnError = <A =unknown>(input:HandleResult<A>): input is HandleResultSuccess<A> => {
  if (isContractInError(input)) throw new Error('error during test setup' + JSON.stringify(input, null, 2))
  return true
}
