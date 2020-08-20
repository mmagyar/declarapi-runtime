import { validate, ValidationResult } from 'yaschva'
import { ContractType, AuthInput, HandlerAuth } from './globalTypes.js'

export type ErrorResponse ={
  errorType: string; data: any; status: number; errors: ValidationResult| string[];}

export const errorStructure = (status:number, errorType:string, errors:ValidationResult| string[] | string, data:any):{status:number, response: ErrorResponse} => ({
  status,
  response: {
    status, errorType, data, errors: typeof errors === 'string' ? [errors] : errors
  }
})

export type ContractResultSuccess = {result: any}
export type ContractResult = ErrorResponse | ContractResultSuccess;

export const isContractInError = (tbd: any): tbd is ErrorResponse =>
  Boolean(tbd.errors)

export type ContractWithValidatedHandler<IN, OUT> = {
    handle: (input: any, auth: HandlerAuth, contract: ContractType<IN, OUT>) => Promise<ContractResult>;
    contract: ContractType<IN, OUT>
}

export const addValidationToContract = <IN, OUT>(
  contract:ContractType<IN, OUT>,
  validateOutput:boolean = true
): ContractWithValidatedHandler<IN, OUT> => {
  return {
    contract: contract,
    handle: async (input: any, auth?:AuthInput): Promise<ContractResult> => {
      const validationResult = validate(contract.arguments, input)
      if (validationResult.result === 'fail') {
        return {
          errorType: 'Input validation failed',
          data: input,
          status: 400,
          errors: validationResult
        }
      }

      if (contract.handle) {
        const result = await contract.handle(input,
          { ...auth, authentication: contract.authentication }, contract)
        if (validateOutput) {
          const outputValidation = validate(contract.returns, result)
          if (outputValidation.result === 'fail') {
            return {
              errorType: 'Unexpected result from function',
              data: result,
              status: 500,
              errors: outputValidation
            }
          }
        }
        return { result }
      }
      return {
        errorType: 'Not implemented',
        data: contract.name,
        status: 501,
        errors: [`Handler for ${contract.name} was not defined`]
      }
    }
  }
}

export default addValidationToContract
