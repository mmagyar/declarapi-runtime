import test, { ExecutionContext } from 'ava'
import { ContractType } from './globalTypes.js'
import { getProvider } from './backendProviders.js'
import { generate, validate } from 'yaschva'
import { getContract } from './testHelpers.spec.js'
import { AbstractBackend } from './backendAbstract.js'

type TestFn = (backend:AbstractBackend<any>, postContract:PC)=>(t:ExecutionContext)=> Promise<void>
type PC = ContractType<'POST', any, any, any>
const backendTests = ():[string, TestFn][] => {
  const testsToRun:[string, TestFn][] = []
  const push = (key:string, fn:TestFn) => testsToRun.push([key, fn])

  push('can post generated data', (backend, postContract) => async (t) => {
    const result = await backend.post(postContract, {}, 'uuid1', generate(postContract.arguments))
    t.falsy(result.error)
    const valid = validate(postContract.returns, result.result)
    t.is(valid.result, 'pass')
  })

  push('Unauthorized users can not post', (backend, postContract) => async (t) => {
    const c2 = { ...postContract, authentication: ['admin'] }
    t.is((await backend.post(c2, { sub: 'userId', permissions: ['regular'] }, 'uuid1', generate(c2.arguments))).error, 'forbidden')
    const success = await backend.post(c2, { sub: 'userId', permissions: ['admin'] }, 'uuid1', generate(c2.arguments))
    t.falsy(success.error)
    t.is((await backend.post(c2, { }, 'uuid1', generate(c2.arguments))).error, 'forbidden')
  })

  push('can not override posted record', (backend, postContract) => async (t) => {
    const result = await backend.post(postContract, {}, 'uuid1', generate(postContract.arguments))
    t.falsy(result.error)
    const valid = validate(postContract.returns, result.result)
    t.is(valid.result, 'pass')

    const errResult = await backend.post(postContract, {}, 'uuid1', generate(postContract.arguments))
    t.is(errResult.error, 'conflict')
  })

  push('manageFields createdBy: saved and added to result', (backend, postContract) => async (t) => {
    const c2 = {
      ...postContract,
      returns: { ...(postContract.arguments as any), createdBy: 'string' },
      manageFields: { createdBy: true }
    }
    const result = await backend.post(c2, { sub: 'userId' }, undefined, generate(c2.arguments))
    t.falsy(result.error)
    t.is(result.result?.createdBy, 'userId')
    const valid = validate(c2.returns, result.result)
    t.is(valid.result, 'pass')
  })

  push('manageFields id: id is saved and added to result', (backend, postContract) => async (t) => {
    const c2 = {
      ...postContract,
      returns: { ...(postContract.arguments as any), id: 'string' },
      manageFields: { id: true }
    }
    const result = await backend.post(c2, {}, undefined, generate(c2.arguments))
    t.falsy(result.error)
    const valid = validate(c2.returns, result.result)
    t.is(typeof result.result?.id, 'string')
    t.is(valid.result, 'pass')
    t.is((await backend.post(c2, {}, 'itemId', generate(c2.arguments))).result?.id, 'itemId')
  })

  return testsToRun
}

const contract = getContract({
  method: 'POST',
  implementation: { type: 'key-value', backend: 'memory', prefix: 'test' },
  arguments: { a: 'string', b: 'number' },
  returns: { a: 'string', b: 'number' }
})

const tests = backendTests()

for (const testE of tests) {
  const postContract = {
    ...contract,
    implementation: { ...contract.implementation, prefix: testE[0] }
  }
  test(testE[0], testE[1](getProvider(postContract.implementation.type), postContract))
}
