import test, { ExecutionContext } from 'ava'
import { processHandle } from './process.js'
import { getContract, mockHandle, TestContractOut, TestContractIn } from './testHelpers.spec.js'
import { RequestHandlingError } from './RequestHandlingError.js'
import { HandleErrorResponse, isContractInError } from './globalTypes.js'
/* eslint-disable no-throw-literal */

const expectError = (t:ExecutionContext, result:any, cb:(response:HandleErrorResponse)=>void, status?:number) => {
  if (isContractInError(result)) {
    if (typeof status !== 'undefined') {
      t.is(result?.status, status)
      t.is(result?.status, status)
    }
    t.truthy(result)
    cb(result)
  } else t.fail(JSON.stringify(result, null, 2))
}

test('when there is no error, it returns the result as an object', async (t) => {
  const getResult = await processHandle(getContract())({ id: 'abc', a: 'in' })
  t.is(getResult.status, 200)
  if (isContractInError(getResult)) return t.fail('Could not get')
  t.is(typeof getResult.result.b, 'string')
  t.is(typeof getResult.result.id, 'string')

  const postResult = await processHandle(getContract({ method: 'POST', handle: mockHandle }))({ id: 'abc', a: 'in' })
  t.is(postResult.status, 201)
  if (isContractInError(postResult)) return t.fail('Could not get')
  t.is(typeof postResult.result.b, 'string')
  t.is(typeof postResult.result.id, 'string')
})

test('Handle receives the id passed to process output', async (t) => {
  const result = await processHandle(getContract({
    handle: async (input:TestContractIn, _:any, __:any, id?:string) => {
      const out :TestContractOut = { b: input.a, id: id || '' }
      return { result: out }
    }
  }))({ a: 'in', c: 'abc' }, 'abc2')

  t.deepEqual(result, { status: 200, result: { b: 'in', id: 'abc2' } } as any)
})

test('empty input will fail validation', async (t) => {
  expectError(t, await processHandle(getContract())({}),
    x => t.is(x.errorType, 'Input validation failed'), 400)

  expectError(t, await processHandle(getContract())(undefined, 'abc'),
    x => t.is(x.errorType, 'Input validation failed'), 400)
})

const assertCatch = (t:ExecutionContext, result:any, type:string, firstError:string, data?:any, status:number = 500) => {
  expectError(t, result, x => {
    t.is(x.errorType, type)
    t.assert(Array.isArray(x.errors))
    // @ts-ignore
    t.is(x.errors[0], firstError)
    t.deepEqual(x.data, data)
  }, status)
}

test('error exceptions thrown in the handler are converted to error output object', async (t) => {
  const result = await processHandle(getContract({ handle: () => { throw new Error('oh no') } }))({ id: 'a', a: 'b' })
  assertCatch(t, result, 'Error', 'oh no', {})
})

test('error exceptions thrown in the handler are converted to error output object, status is used from the error object', async (t) => {
  assertCatch(t, await processHandle(getContract({
    handle: () => {
      const error:any = new Error('oh no')
      error.code = 509
      throw error
    }
  }))({ id: 'a', a: 'b' }), 'Error', 'oh no', { code: 509 }, 509)

  assertCatch(t, await processHandle(getContract({
    handle: () => {
      const error:any = new Error('oh Yes')
      error.status = 511
      throw error
    }
  }))({ id: 'a', a: 'b' }), 'Error', 'oh Yes', { status: 511 }, 511)

  assertCatch(t, await processHandle(getContract({
    handle: () => {
      const error:any = new Error('oh What')
      error.statusCode = 512
      throw error
    }
  }))({ id: 'a', a: 'b' }), 'Error', 'oh What', { statusCode: 512 }, 512)
})
test('error exceptions thrown in the handler are converted to error output object, out of bound error codes are normalized to 500', async (t) => {
  assertCatch(t, await processHandle(getContract({
    handle: () => {
      const error:any = new Error('oh no')
      error.code = 612
      throw error
    }
  }))({ id: 'a', a: 'b' }), 'Error', 'oh no', { code: 612 }, 500)

  assertCatch(t, await processHandle(getContract({
    handle: () => {
      const error:any = new Error('oh Yes')
      error.status = 102
      throw error
    }
  }))({ id: 'a', a: 'b' }), 'Error', 'oh Yes', { status: 102 }, 500)
})
test('custom error exceptions thrown in the handler are converted to error output object, class name is used as error type', async (t) => {
  assertCatch(t, await processHandle(getContract({
    handle: () => { throw new RequestHandlingError('oh err', 503) }
  }))({ id: 'a', a: 'b' }),
  'RequestHandlingError',
  'oh err',
  { name: 'RequestHandlingError', status: 503 }, 503)
})

test('error exceptions with custom field thrown in the handler are converted to error output object, properties of the error are returned', async (t) => {
  assertCatch(t, await processHandle(getContract({
    handle: () => {
      const err: any = new Error('oh custom props')
      err.myCate = 'isGreat'
      throw err
    }
  }))({ id: 'a', a: 'b' }),
  'Error',
  'oh custom props',
  { myCate: 'isGreat' }, 500)
})

test('primitive exceptions thrown in the handler are converted to error output object', async (t) => {
  assertCatch(t, await processHandle(getContract(
    { handle: () => { throw 'my err' } }))({ id: 'a', a: 'b' })
  , 'exception', 'my err', 'my err')

  assertCatch(t, await processHandle(getContract(
    { handle: () => { throw 1 } }))({ id: 'a', a: 'b' })
  , 'exception', '1', 1)

  assertCatch(t, await processHandle(getContract(
    { handle: () => { throw null } }))({ id: 'a', a: 'b' })
  , 'exception', 'unknown', null)

  assertCatch(t, await processHandle(getContract(
    { handle: () => { throw undefined } }))({ id: 'a', a: 'b' })
  , 'exception', 'unknown', undefined)

  assertCatch(t, await processHandle(getContract(
    { handle: () => { throw true } }))({ id: 'a', a: 'b' })
  , 'exception', 'true', true)
})

test('authentication true: a user id is set, run handler', async (t) => {
  const handler = processHandle(getContract({ handle: mockHandle, authentication: true }))

  const result = await handler({ id: 'a', a: 'abc' }, undefined, { sub: 'userId' })
  t.is(result.status, 200)
  // @ts-ignore
  if (isContractInError(result)) return t.fails('Error with running get')
  t.is(typeof result.result.id, 'string')
  t.is(typeof result.result.b, 'string')
})

test('authentication true: without a user id set, immediately return with 401', async (t) => {
  const handler = processHandle(getContract({ handle: mockHandle, authentication: true }))

  expectError(t, await handler({ id: 'a', a: 'abc' }), x => t.is(x.errorType, 'unauthorized'), 401)
})

test('authentication roles: without a user id set, immediately return with 401', async (t) => {
  const handler = processHandle(getContract({ handle: mockHandle, authentication: ['admin', 'editor'] }))

  expectError(t, await handler({ id: 'a', a: 'abc' }), x => t.is(x.errorType, 'unauthorized'), 401)
})

test('authentication roles: without proper permissions, immediately return with 403', async (t) => {
  const handler = processHandle(getContract({ handle: mockHandle, authentication: ['admin', 'editor'] }))

  expectError(t, await handler({ id: 'a', a: 'abc' }, undefined, { sub: 'userId' }), x => t.is(x.errorType, 'forbidden'), 403)
  expectError(t, await handler({ id: 'a', a: 'abc' }, undefined, { sub: 'userId' }), x => t.is(x.errorType, 'forbidden'), 403)
})
