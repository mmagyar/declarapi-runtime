import { processContract } from './process'
import { ContractType } from './globalTypes'

describe('Process a contract to provide a safe, callable request', () => {
  const input: ()=> ContractType<{a:string}, {b:string}> = () => ({
    arguments: { a: 'string' },
    manageFields: {},
    name: 'test',
    returns: { b: 'string' },
    handle: async (obj) => ({ b: obj.a }),
    type: 'GET',
    authentication: false

  })
  it('Return status code along with the response', async () => {
    const result = processContract(input())
    expect(await result.handle({ a: 'abc' }))
      .toEqual({ status: 200, response: { b: 'abc' } })
  })

  it('it catches exceptions, and returns a 500 status', async () => {
    const data = input()
    data.handle = () => { throw new Error('OH NO IT DIED') }
    const result = processContract(data)
    expect(await result.handle({ a: 'abc' }))
      .toEqual({
        status: 500,
        response: {
          status: 500,
          data: { },
          errorType: 'Error',
          errors: ['OH NO IT DIED']
        }
      })
  })
  it('handle is not called when input is not valid', async () => {
    const data = input()
    let called = false
    data.handle = () => { called = true; return 'what ever' as any }
    const result = processContract(data)
    expect(await result.handle({ x: 'abc' })).toHaveProperty('status', 400)
    expect(called).toBeFalsy()
  })

  it('does not allow invalid input, return 400 error', async () => {
    const result = processContract(input())
    expect(await result.handle({ x: 'abc' }))
      .toEqual({
        status: 400,
        response: {
          status: 400,
          data: { x: 'abc' },
          errorType: 'Input validation failed',
          errors: {
            output: {
              a: {
                error: 'Value is not a string',
                value: undefined
              },
              x: {
                error: 'Key does not exist on validator',
                value: 'abc'
              }
            },
            result: 'fail'
          }
        }
      })
  })
})
