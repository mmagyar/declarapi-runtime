import { validate, ValidationResult } from 'yaschva'
import { ContractType, AuthInput, HttpMethods, Implementation, HandleResult, isContractInError } from './globalTypes.js'

const inputValidationFailed = (errors:ValidationResult, data:any) => ({
  errorType: 'Input validation failed',
  data,
  status: 400,
  errors
})

const notImplemented = (contractName:string) => ({
  errorType: 'Not implemented',
  data: contractName,
  status: 501,
  errors: [`Handler for ${contractName} was not defined`]
})

const unexpectedResult = (errors: ValidationResult, data:any) => ({
  errorType: 'Unexpected result from function',
  data,
  status: 500,
  errors
})

export const wrapHandleWithValidation = <METHOD extends HttpMethods, IMPL extends Implementation, IN, OUT>(
  contract: ContractType<METHOD, IMPL, IN, OUT>,
  validateOutput:boolean = true
): ((input: any, auth?: AuthInput, id?:string) => Promise<HandleResult<OUT>>) => {
  return async (input: any, auth:AuthInput = {}, id?:string): Promise<HandleResult<OUT>> => {
    const validationResult = validate(contract.arguments, input)
    if (validationResult.result === 'fail') {
      return inputValidationFailed(validationResult, input)
    }
    if (contract.handle) {
      const result = await contract.handle(input, { ...auth }, contract, id)
      if (validateOutput && !isContractInError(result)) {
        const outputValidation = validate(contract.returns, result.result)
        if (outputValidation.result === 'fail') return unexpectedResult(outputValidation, result.result)
      }
      return result
    }
    return notImplemented(contract.name)
  }
}
