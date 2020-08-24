import { ContractResult, isContractInError, ContractWithValidatedHandler, errorStructure } from './contractValidation.js'
import { HttpMethods, AuthInput, ContractType } from './globalTypes.js'
import { map } from 'microtil'

function isPrimitive (test:any):boolean {
  return (test !== Object(test))
};

export type BodyType = { [key: string]: any} & {id?:string|string[]}

export type HandleResponse = {status:number, response:any}
export type HandleType = (body: { [key: string]: any} & {id?:string|string[]}, id?: string, user?: AuthInput) => Promise<HandleResponse>
export type HttpWrapped<METHOD extends HttpMethods, IN, OUT> = {
  route: string;
  method: METHOD;
  handle: HandleType,
  contract: ContractType<METHOD, any, IN, OUT>
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
        await x.handle(body, { ...user }, x.contract)
    if (isContractInError(result)) { return { status: result.status, response: result } }

    const statusCode = x.contract.type === 'POST' ? 201 : 200
    if (id && Array.isArray(result.result)) {
      // TODO maybe remove this, it violates the type signature and does not add a lot really
      if (result.result.length > 1) {
        return errorStructure(500,
          'handleError',
          'Response for a single id request contained multiple responses',
          result.result)
      }

      return { status: statusCode, response: result.result[0] }
    }
    return { status: statusCode, response: result.result }
  } catch (e) {
    const data = (isPrimitive(e) || !e) ? e : map(e, y => y)
    const code = (typeof e?.status === 'number' ? e.status : undefined) ||
      (typeof e?.statusCode === 'number' ? e.statusCode : undefined) ||
      (typeof e?.code === 'number' ? e.code : undefined) || 500
    return errorStructure(code >= 400 && code < 600 ? code : 500, e?.name || 'exception', e?.message || e?.toString() || 'unknown', data)
  }
}
export const registerRestMethods = <IN, OUT>(x:ContractWithValidatedHandler<IN, OUT>):HttpWrapped<IN, OUT> => {
  return {
    route: `/api/${x.contract.name}`,
    method: x.contract.type,
    contract: x.contract,
    handle: processHandle(x)
  }
}

export default registerRestMethods
