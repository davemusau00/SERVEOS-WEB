import {ApiProblem} from './command-kernel.mjs';
import {consumptionSnapshot as snapshot,consumePhysical as consume,InventoryProblem} from '../../../contracts/pos-inventory.mjs';
const convert=error=>{if(error instanceof InventoryProblem)throw new ApiProblem(error.status,error.code,error.message);throw error;};
export async function consumptionSnapshot(...args){try{return await snapshot(...args)}catch(error){convert(error);}}
export function consumePhysical(...args){try{return consume(...args)}catch(error){convert(error);}}
