import registerRestMethods from './registerRestMethods.js'
import { ContractResult, ErrorResponse, ContractResultSuccess, ContractWithValidatedHandler } from './contractValidation.js'
describe('registerRestMethods', () => {
  const input = ():ContractWithValidatedHandler<any, any> => ({
    contract: { name: 'test', authentication: false, manageFields: {}, arguments: {}, returns: {}, type: 'GET' },
    handle: async (data: { a: string }): Promise<ContractResult> =>
      ({ result: { ...data } })
  })
  it('transforms correctly', () => {
    const result = registerRestMethods(input())
    expect(result.route).toBe('/api/test/:id?')
    expect(result.method).toBe('GET')
    expect(typeof result.handle).toBe('function')
  })

  it('params and query is optional', async () => {
    const result = await registerRestMethods(input()).handle({ a: 'sadf' })
    expect(result).toHaveProperty('status', 200)
  })

  describe('authentication handling', () => {
    it('happy path - no authentication', async () => {
      const result = await registerRestMethods(input())
        .handle({ a: 'sadf' })
      expect(result).toHaveProperty('status', 200)
      expect(result).toHaveProperty('response', { a: 'sadf' })
    })

    it('happy path - with simple authentication', async () => {
      const data = input()
      data.contract.authentication = true
      const result = await registerRestMethods(data).handle({ a: 'sadf' }, undefined, { permissions: [], sub: 'abc' })
      expect(result).toHaveProperty('status', 200)
      expect(result).toHaveProperty('response', { a: 'sadf' })
    })

    it('permissions can be undefined, equals empty array', async () => {
      const data = input()
      data.contract.authentication = ['admin']
      const result = await registerRestMethods(data).handle({ a: 'sadf' }, undefined, { sub: 'user' })
      expect(result).toHaveProperty('status', 403)
    })

    it('happy path - with role authentication', async () => {
      const data = input()
      data.contract.authentication = ['admin']
      const result = await registerRestMethods(data).handle({ a: 'sadf' }, undefined, { permissions: ['admin'], sub: 'abc' })
      expect(result).toHaveProperty('status', 200)
      expect(result).toHaveProperty('response', { a: 'sadf' })
    })

    it('happy path - with createdBy', async () => {
      const data = input()
      data.contract.manageFields = { createdBy: true }
      data.contract.authentication = [{ createdBy: true }]
      const result = await registerRestMethods(data).handle({ a: 'sadf' }, undefined, { permissions: [], sub: 'abc' })
      expect(result).toHaveProperty('status', 200)
      expect(result).toHaveProperty('response', { a: 'sadf' })
    })

    it('auth failure - with simple authentication', async () => {
      const data = input()
      data.contract.authentication = true
      const result = await registerRestMethods(data).handle({ a: 'sadf' })
      expect(result).toHaveProperty('status', 401)
      expect(result).toHaveProperty('response', {
        status: 401,
        data: { id: undefined },
        errorType: 'unauthorized',
        errors: ['Only logged in users can do this']
      })
    })

    it('auth failure - unauthenticated user with role authentication', async () => {
      const data = input()
      data.contract.authentication = ['admin']
      const result = await registerRestMethods(data).handle({ a: 'sadf' }, undefined, { permissions: ['user', ' moderator'], sub: 'abc' })
      expect(result).toHaveProperty('status', 403)
      expect(result).toHaveProperty('response', {
        status: 403,
        data: { id: undefined },
        errorType: 'forbidden',
        errors: ['You don\'t have permission to do this']
      })
    })

    it('auth failure - user without admin role with role authentication', async () => {
      const data = input()
      data.contract.authentication = ['admin']
      const result = await registerRestMethods(data).handle({ a: 'sadf' })

      expect(result).toHaveProperty('status', 401)
      expect(result).toHaveProperty('response', {
        status: 401,
        data: { id: undefined },
        errorType: 'unauthorized',
        errors: ['Only logged in users can do this']
      })
    })
  })

  it('can get element by id from path', async () => {
    const result = await registerRestMethods(input())
      .handle({ a: 'sadf' }, '3')
    expect(result).toHaveProperty('status', 200)
    expect(result).toHaveProperty('response', { a: 'sadf', id: '3' })
  })

  it('can get element by id from query', async () => {
    const result = await registerRestMethods(input())
      .handle({ a: 'sadf', id: '3' })
    expect(result).toHaveProperty('status', 200)
    expect(result).toHaveProperty('response', { a: 'sadf', id: '3' })
  })

  it('can get element by id but if both query and path they must match', async () => {
    const result = await registerRestMethods(input())
      .handle({ a: 'sadf', id: '3' }, '3')
    expect(result).toHaveProperty('status', 200)
    expect(result).toHaveProperty('response', { a: 'sadf', id: '3' })

    const res2 = await registerRestMethods(input())
      .handle({ a: 'sadf', id: '3' }, '4')
    expect(res2).toHaveProperty('status', 400)
    expect(res2).toHaveProperty('response', {
      status: 400,
      data: { id: '4', query: { a: 'sadf', id: '3' } },
      errorType: 'id mismatch',
      errors: ['Mismatch between the object Id in the body and the URL']
    })
  })

  it('handles when the handle function returns a contract error', async () => {
    const data = input()
    data.handle = async (): Promise<ErrorResponse> =>
      ({ errorType: 'contractError', data: {}, status: 500, errors: ['Testing errors'] })

    const result = await registerRestMethods(data).handle({ a: 'sadf' })
    expect(result).toHaveProperty('status', 500)
    expect(result).toHaveProperty('response', { status: 500, data: {}, errorType: 'contractError', errors: ['Testing errors'] })
  })

  describe('only returns one element if id is given in params', () => {
    const originalWarn = console.warn
    let consoleWarnMock = jest.fn()
    beforeEach(() => { consoleWarnMock = console.warn = jest.fn() })
    afterEach(() => { console.warn = originalWarn })

    it('extracts the first element if an array is returned', async () => {
      const data = input()
      data.handle = async (): Promise<ContractResultSuccess> =>
        ({ result: [{ a: 'el1' }] })

      const result = await registerRestMethods(data).handle({ a: 'sadf' }, '3')
      expect(result).toHaveProperty('status', 200)
      expect(result).toHaveProperty('response', { a: 'el1' })
      expect(consoleWarnMock).not.toBeCalled()
    })

    it('returns error if an array with many elements is returned for a direct id request', async () => {
      const data = input()
      data.handle = async (): Promise<ContractResultSuccess> =>
        ({ result: [{ a: 'el1' }, { a: 'el2' }] })

      const result = await registerRestMethods(data).handle({ a: 'sadf' }, '3')
      expect(result).toHaveProperty('response', {
        status: 500,
        errorType: 'handleError',
        errors: ['Response for a single id request contained multiple responses'],
        data: [{ a: 'el1' }, { a: 'el2' }]
      })
    })
  })

  describe('handles thrown exceptions', () => {
    it('handles simple error', async () => {
      const data = input()
      data.handle = async (): Promise<any> => { throw new Error('Err') }

      const result = await registerRestMethods(data).handle({ a: 'sadf' })
      expect(result).toHaveProperty('status', 500)
      expect(result).toHaveProperty('response', { status: 500, data: {}, errorType: 'Error', errors: ['Err'] })
    })

    it('handles error status on error object as status status', async () => {
      const data = input()

      data.handle = async (): Promise<any> => {
        const err:any = new Error('err')
        err.status = 503
        throw err
      }

      const result = await registerRestMethods(data).handle({ a: 'sadf' })
      expect(result).toHaveProperty('status', 503)
      expect(result).toHaveProperty('response', { status: 503, data: { status: 503 }, errorType: 'Error', errors: ['err'] })
    })

    it('correct out of range status status to 500', async () => {
      const data = input()

      data.handle = async (): Promise<any> => {
        const err:any = new Error('err')
        err.status = 703
        throw err
      }

      const result = await registerRestMethods(data).handle({ a: 'sadf' })
      expect(result).toHaveProperty('status', 500)
      expect(result).toHaveProperty('response', { status: 500, data: { status: 703 }, errorType: 'Error', errors: ['err'] })
    })

    it('handles thrown primitives', async () => {
      const data = input()
      data.handle = async (): Promise<any> => { throw '' } // eslint-disable-line no-throw-literal
      const result = await registerRestMethods(data).handle({ a: 'sadf' })
      expect(result).toHaveProperty('status', 500)
      expect(result).toHaveProperty('response', { status: 500, data: '', errorType: 'exception', errors: ['unknown'] })

      data.handle = async (): Promise<any> => { throw 3 } // eslint-disable-line no-throw-literal
      const result2 = await registerRestMethods(data).handle({ a: 'sadf' })
      expect(result2).toHaveProperty('response', { status: 500, data: 3, errorType: 'exception', errors: ['3'] })

      data.handle = async (): Promise<any> => { throw null } // eslint-disable-line no-throw-literal
      const result3 = await registerRestMethods(data).handle({ a: 'sadf' })
      expect(result3).toHaveProperty('response', { status: 500, data: null, errorType: 'exception', errors: ['unknown'] })
    })
  })
})
