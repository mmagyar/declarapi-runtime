import { ContractResult, isContractInError, ContractWithValidatedHandler, errorStructure } from './contractValidation.js'
import { HttpMethods, AuthInput, ContractType } from './globalTypes.js'
import { map } from 'microtil'

export type BodyType = { [key: string]: any} & {id?:string|string[]}

export type HandleResponse = {status:number, response:any}
export type HandleType = (body: { [key: string]: any} & {id?:string|string[]}, id?: string, user?: AuthInput) => Promise<HandleResponse>
export type HttpWrapped<IN, OUT> = {
  route: string;
  method: HttpMethods;
  handle: HandleType,
  contract: ContractType<IN, OUT>
}

const processHandle = (x: ContractWithValidatedHandler<any, any>) => async (body:BodyType, id?:string, user?:AuthInput) => {
  const { authentication, manageFields } = x.contract

  if (authentication) {
    if (!user?.sub) {
      return errorStructure(401, 'unauthorized', 'Only logged in users can do this', { id })
    }

    if (Array.isArray(authentication)) {
      const perm: string[] = user.permissions || []

      const hasPerm = perm.some(y => authentication.some(z => z === y))
      const canUserAccess = manageFields.createdBy
      if (!hasPerm && !canUserAccess) {
        return errorStructure(403, 'forbidden', "You don't have permission to do this", { id })
      }
    }
  }

  if (id !== undefined) {
    if (body && body.id !== undefined) {
      if (id !== body.id) {
        return errorStructure(400, 'id mismatch', 'Mismatch between the object Id in the body and the URL', { query: body, id })
      }
    } else {
      body.id = id
    }
  }

  try {
    const result: ContractResult =
        await x.handle(body, { ...user, authentication }, x.contract)
    if (isContractInError(result)) { return { status: result.status, response: result } }

    const statusCode = x.contract.type === 'POST' ? 201 : 200
    if (id && Array.isArray(result.result)) {
      if (result.result.length > 1) { console.warn('Results contained more than one entry for single return by id') }

      return { status: statusCode, response: result.result[0] }
    }
    return { status: statusCode, response: result.result }
  } catch (e) {
    const data = e && map(e, y => y)
    const code = e?.code || e?.statusCode || 500
    return errorStructure(code >= 400 && code < 600 ? code : 500, e.name || 'exception', e?.message, data)
  }
}
export const registerRestMethods = <IN, OUT>(x:ContractWithValidatedHandler<IN, OUT>):HttpWrapped<IN, OUT> => {
  return {
    route: `/api/${x.contract.name}/:id?`,
    method: x.contract.type,
    contract: x.contract,
    handle: processHandle(x)
  }
}

export default registerRestMethods
