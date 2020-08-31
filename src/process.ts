import { wrapHandleWithValidation } from './contractValidation.js'
import { HttpMethods, AuthInput, ContractType, Implementation, HandleErrorResponse, HandleResult, isContractInError } from './globalTypes.js'
import { map } from 'microtil'

function isPrimitive (test:any):boolean {
  return (test !== Object(test))
};
export const errorStructure = (status:number, errorType:string, errors: string, data:any):
  {status:number, response: HandleErrorResponse} => ({
  status,
  response: {
    status, errorType, data, errors: [errors]
  }
})

export type HandleResponse<OUT> = {status:number, response:OUT | HandleErrorResponse }
export type HandleType <OUT> =(body?: any, id?: string, user?: AuthInput) => Promise<HandleResponse<OUT>>

export const processHandle = <METHOD extends HttpMethods, IMPL extends Implementation, IN, OUT> (contract: ContractType<METHOD, IMPL, IN, OUT>):
  HandleType<OUT> =>
    async (body?:any, id?:string, user?:AuthInput):
      Promise<HandleResponse<OUT>> => {
      const { authentication, manageFields } = contract

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

      try {
        const result: HandleResult<OUT> = await wrapHandleWithValidation(contract)(body, { ...user }, id)
        if (isContractInError(result)) { return { status: result.status, response: result } }

        const statusCode = contract.type === 'POST' ? 201 : 200
        return { status: statusCode, response: result.result }
      } catch (e) {
        const normalizeErrorCode = (input:number) => input >= 400 && input < 600 ? input : 500
        const getIfNumber = (input:any) :number | false => typeof input === 'number' && normalizeErrorCode(input)
        const data = (isPrimitive(e) || !e) ? e : map(e, y => y)
        const code = getIfNumber(e?.status) || getIfNumber(e?.statusCode) || getIfNumber(e?.code) || 500
        return errorStructure(code, e?.name || 'exception', e?.message || e?.toString() || 'unknown', data)
      }
    }
