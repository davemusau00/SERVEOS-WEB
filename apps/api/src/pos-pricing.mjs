import {ApiProblem} from './command-kernel.mjs';
import {calculateLine} from '../../../contracts/pos-math.mjs';
export function priceLine(...args){try{return calculateLine(...args)}catch(error){throw new ApiProblem(400,'VALIDATION_FAILED',error.message);}}
