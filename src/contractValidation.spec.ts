import test from 'ava'
import { wrapHandleWithValidation } from './contractValidation.js'
import { getContract } from './testHelpers.spec.js'
import { isContractInError } from './globalTypes.js'

test('returns error on invalid input', async (t) => {
  const contract = getContract()
  const result = wrapHandleWithValidation(contract)
  t.deepEqual(await result({ id: 'something' }), {
    data: { id: 'something' },
    errorType: 'Input validation failed',
    status: 400,
    errors: {
      result: 'fail',
      output: {
        a: {
          error: 'Value is not a string',
          value: undefined
        },
        c: null,
        id: null
      }
    }
  } as any)
})

test('returns error on output that does not confirm to type', async (t) => {
  const contract = getContract({ handle: async () => { return { result: { x: 'some', id: 'thing' } as any } } })
  const result = wrapHandleWithValidation(contract)
  t.deepEqual(await result({ id: 'something', a: 'valid' }), {
    data: { id: 'thing', x: 'some' },
    errorType: 'Unexpected result from function',
    status: 500,
    errors: {
      result: 'fail',
      output: {
        b: {
          error: 'Value is not a string',
          value: undefined
        },
        c: null,
        id: null,
        x: {
          error: 'Key does not exist on validator',
          value: 'some'
        }
      }
    }
  } as any)
})
test('returns error if handler is undefined', async (t) => {
  const contract = getContract({ handle: undefined })
  const result = wrapHandleWithValidation(contract)
  t.deepEqual(await result({ id: 'something', a: 'valid' }), {
    errorType: 'Not implemented',
    data: 'test-contract',
    status: 501,
    errors: ['Handler for test-contract was not defined']
  } as any)
})

test('returns result if all validations pass', async (t) => {
  const contract = getContract()
  const result = wrapHandleWithValidation(contract)
  const res = await result({ id: 'something', a: 'valid', c: 'im optional' })
  if (isContractInError(res)) return t.fail('validation should have passed')
  t.is(typeof res.result.b, 'string')
  t.is(typeof res.result.id, 'string')
})
