import { ContractType, AnyContract } from './globalTypes.js'
import { generate, validate } from 'yaschva'
import { getContract, TestFn, runTestArray, ExpectGood, TestContractOut, ExpectBad } from './testHelpers.spec.js'

type PC = ContractType<'POST', any, any, TestContractOut>
const backendTests = ():[string, TestFn<PC>][] => {
  const testsToRun:[string, TestFn<PC>][] = []
  const push = (key:string, fn:TestFn<PC>) => testsToRun.push([key, fn])

  push('can post generated data', ExpectGood(
    (b, c:PC) => b.post(c, {}, 'uuid1', generate(c.arguments)),
    (r, t, c) => { t.is(validate(c.returns, r.result).result, 'pass') }))

  push('can not override posted record', ExpectBad(
    async (b, c:PC) => {
      if ((await b.post(c, {}, 'uuid1', generate(c.arguments))).errors) throw new Error('Fist post failed')
      return b.post(c, {}, 'uuid1', generate(c.arguments))
    }, (result, t, c) => {
      t.is(result.status, 409)
      t.is(validate(c.returns, result.result).result, 'fail')
    }))

  {
    const withCreated = (c:PC): AnyContract =>
      ({
        ...c,
        returns: { ...(c.arguments as any), createdBy: 'string' },
        manageFields: { createdBy: true }
      })

    push('manageFields createdBy: saved and added to result', ExpectGood(
      (b, c:PC) => b.post(withCreated(c), { sub: 'userId' }, undefined, generate(withCreated(c).arguments)),
      (result, t, c) => { t.is(validate(withCreated(c).returns, result.result).result, 'pass') }))
  }

  {
    const withId = (c:PC): AnyContract =>
      ({
        ...c,
        returns: { ...(c.arguments as any), id: 'string' },
        manageFields: { id: true }
      })

    push('manageFields id: id is generated and saved and added to result', ExpectGood(
      (b, c:PC) => b.post(withId(c), { sub: 'userId' }, undefined, generate(withId(c).arguments)),
      (result, t, c) => {
        t.is(typeof result.result?.id, 'string')
        t.is(validate(withId(c).returns, result.result).result, 'pass')
      }))

    push('manageFields id: id is saved and added to result', ExpectGood(
      (b, c:PC) => b.post(withId(c), { sub: 'userId' }, 'itemId', generate(withId(c).arguments)),
      (result, t) => { t.is(result.result?.id, 'itemId') }))
  }

  return testsToRun
}

const contract = getContract({
  method: 'POST',
  implementation: { type: 'key-value', backend: 'memory', prefix: 'test' },
  arguments: { a: 'string', b: 'number' },
  returns: { a: 'string', b: 'number' }
})

runTestArray(contract, backendTests())
