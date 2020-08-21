import { ContractType } from '.'
import registerRestMethods, { HttpWrapped } from './registerRestMethods'
import addValidationToContract from './contractValidation'

/**
 * This function will wrap the generated
 * or manually implemented handle of the generated API.
 *
 * It's required, to support manual implementation
 * or overriding of the request handlers.
 *
 * It makes sure that the data provided to the handle method
 * is true to the type signature
 * and it checks the output for the same reason.
 * **/
export const processContract = <IN, OUT>(contract: ContractType<IN, OUT>): HttpWrapped<IN, OUT> =>
  registerRestMethods(addValidationToContract(contract))
