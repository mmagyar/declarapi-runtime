import { addValidationToContract, isContractInError } from './contractValidation.js'
import { ContractType } from './globalTypes.js'
describe('contractProcessor', () => {
  const auth = { authentication: false }
  const input: ()=> ContractType<{a:string}, {b:string}> = () => ({
    arguments: { a: 'string' },
    manageFields: {},
    name: 'test',
    returns: { b: 'string' },
    handle: async (obj) => ({ b: obj.a }),
    type: 'GET',
    authentication: false

  })

  it('can add validation to a single contract', () => {
    const result = addValidationToContract(input())
    expect(result.contract.name).toEqual('test')
    expect(result.contract.type).toEqual('GET')
    expect(result.contract.authentication).toEqual(false)
    expect(result.handle).not.toEqual(input().handle)
    expect(typeof result.handle).toBe('function')
  })

  it('runs the defined handler - happy path', async () => {
    const contracts = input()
    expect(await addValidationToContract(contracts).handle({ a: 'foo' }, auth, contracts))
      .toStrictEqual({ result: { b: 'foo' } })
  })

  it('runs the defined handler - input validation error', async () => {
    const testData = input()
    const ogHandle = testData.handle = jest.fn(testData.handle)
    const handle = jest.fn(addValidationToContract(testData).handle)
    expect(await handle({ x: 'foo' }, auth, testData))
      .toStrictEqual({
        status: 400,
        data: { x: 'foo' },
        errorType: 'Input validation failed',
        errors: {
          output: {
            a: { error: 'Value is not a string', value: undefined },
            x: { error: 'Key does not exist on validator', value: 'foo' }
          },
          result: 'fail'
        }
      })
    expect(handle).toBeCalled()
    expect(ogHandle).not.toBeCalled()
  })

  it('runs the defined handler - output validation error', async () => {
    const modifiedHandler = input()
    const ogHandle = modifiedHandler.handle = jest.fn((args:any):any => ({ z: args.a }))
    expect(await addValidationToContract(modifiedHandler).handle({ a: 'foo' }, auth, modifiedHandler))
      .toStrictEqual({
        status: 500,
        data: { z: 'foo' },
        errorType: 'Unexpected result from function',
        errors: {
          output: {
            b: { error: 'Value is not a string', value: undefined },
            z: { error: 'Key does not exist on validator', value: 'foo' }
          },
          result: 'fail'
        }
      })
    expect(ogHandle).toBeCalled()
  })

  it('runs the defined handler - output validation can be turned off', async () => {
    const modifiedHandler = input()
    const ogHandle = modifiedHandler.handle = jest.fn((args:any):any => ({ z: args.a }))
    expect(await addValidationToContract(modifiedHandler, false).handle({ a: 'foo' }, auth, modifiedHandler))
      .toStrictEqual({ result: { z: 'foo' } })
    expect(ogHandle).toBeCalled()
  })

  it('runs a fully formed error when the handler is undefined', async () => {
    const modifiedHandler = input()
    modifiedHandler.handle = undefined
    expect(await addValidationToContract(modifiedHandler).handle({ a: 'foo' }, auth, modifiedHandler))
      .toStrictEqual({
        status: 501,
        data: 'test',
        errorType: 'Not implemented',
        errors: ['Handler for test was not defined']
      })
  })

  it('can identify if contract returned an error', async () => {
    const modifiedHandler = input()
    modifiedHandler.handle = undefined
    const result = await addValidationToContract(modifiedHandler).handle({ a: 'foo' }, auth, modifiedHandler)
    if (isContractInError(result)) {
      expect(result.status).toBe(501)
    } else { throw new Error('Test failed') }
  })
})
