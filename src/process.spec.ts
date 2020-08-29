import test, { ExecutionContext } from 'ava'
import { processHandle, isContractInError } from './process.js'
import { getContract, defaultHandler } from './testHelpers.spec.js'
import { ErrorResponse } from './contractValidation.js'
import { RequestHandlingError } from './RequestHandlingError.js'
/* eslint-disable no-throw-literal */

const expectError = (t:ExecutionContext, result:any, cb:(response:ErrorResponse)=>void, status?:number) => {
  if (isContractInError(result?.response)) {
    if (typeof status !== 'undefined') {
      t.is(result?.status, status)
      t.is(result?.response.status, status)
    }
    t.truthy(result?.response)
    cb(result.response)
  } else t.fail(JSON.stringify(result, null, 2))
}

test('when there is no error, it returns the result as an object', async (t) => {
  t.deepEqual(await processHandle(getContract())({ id: 'abc', a: 'in', c: 'abc' }),
   { status: 200, response: { b: 'in', c: 'abc', id: 'abc' } } as any)

  t.deepEqual(await processHandle(getContract({ method: 'POST', handle: defaultHandler }))({ id: 'abc', a: 'in', c: 'abc' }),
   { status: 201, response: { b: 'in', c: 'abc', id: 'abc' } } as any)
})

test('Handle still gets ids in the body -- TODO revise this', async (t) => {
  const result = await processHandle(getContract())({ a: 'in', c: 'abc' }, 'abc')

  t.deepEqual(result, { status: 200, response: { b: 'in', c: 'abc', id: 'abc' } } as any)
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

test('id in the body and in the arguments must match', async (t) => {
  expectError(t,
    await processHandle(getContract())({ id: 'otherId' }, 'someId'),
    x => t.is(x.errorType, 'id mismatch'),
    400)
})

test('authentication', async (t) => {
  const handler = processHandle(getContract({ handle: defaultHandler, authentication: true }))
  const result = await handler({ id: 'a', a: 'abc' })

  expectError(t, result, x => {
    t.is(x.errorType, 'unauthorized')
  }, 401)
})
