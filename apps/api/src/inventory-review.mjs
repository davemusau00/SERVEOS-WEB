import {ApiProblem} from './command-kernel.mjs';
const expectedVersion=(command,type,id)=>{const value=command.expectedVersions[`${type}:${id}`];if(!Number.isSafeInteger(value)||value<0)throw new ApiProblem(400,'VALIDATION_FAILED',`Expected version for ${type}:${id} is required.`);return value;};
// Quantity equality cannot detect an A -> B -> A balance change.
export const reviewedBalance=async(tx,command,actor,stockItemId,locationId)=>{
 expectedVersion(command,'stockItems',stockItemId);expectedVersion(command,'stockLocations',locationId);
 const expected=command.payload.expectedBalanceVersions?.[`${stockItemId}:${locationId}`];
 if(!Number.isSafeInteger(expected)||expected<0)throw new ApiProblem(400,'BALANCE_VERSION_REQUIRED','The reviewed stock-location balance version is required.');
 const balance=await tx.stockBalance(actor.businessId,stockItemId,locationId);
 if(balance.version!==expected)throw new ApiProblem(409,'VERSION_CONFLICT','Stock moved after this balance was reviewed. Refresh and recount affected items.');
 return balance;
};
