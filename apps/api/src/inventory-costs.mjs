import {ApiProblem} from './command-kernel.mjs';

const SCALE=1_000_000_000_000n;
const scaled=(value,places)=>BigInt(value.toFixed(places).replace('.',''));

export function costRate(value){
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>Number.MAX_SAFE_INTEGER)throw new ApiProblem(400,'VALIDATION_FAILED','Unit cost must be a non-negative finite rate.');
 return Number(value.toFixed(12));
}

/** Final posted money rounds once, after six-decimal quantity × rate. */
export function lineCostMinor(quantity,unitCostMinor){
 costRate(unitCostMinor);
 if(typeof quantity!=='number'||!Number.isFinite(quantity)||quantity<0||quantity>Number.MAX_SAFE_INTEGER)throw new ApiProblem(400,'VALIDATION_FAILED','Valuation quantity is invalid.');
 const quantityScaled=scaled(quantity,6),rateScaled=scaled(unitCostMinor,12),denominator=1_000_000n*SCALE;
 const value=(quantityScaled*rateScaled+denominator/2n)/denominator;
 if(value>BigInt(Number.MAX_SAFE_INTEGER))throw new ApiProblem(400,'VALIDATION_FAILED','Inventory line value exceeds supported posted money.');
 return Number(value);
}

/** Quantities use six decimals; unit valuation uses twelve. Posted money stays integer. */
export function weightedCostRate(existingQuantity,existingRate,receivedQuantity,totalCostMinor){
 costRate(existingRate);
 if(!Number.isFinite(existingQuantity)||existingQuantity<0||existingQuantity>Number.MAX_SAFE_INTEGER||!Number.isFinite(receivedQuantity)||receivedQuantity<=0||receivedQuantity>Number.MAX_SAFE_INTEGER||!Number.isSafeInteger(totalCostMinor)||totalCostMinor<0)throw new ApiProblem(400,'VALIDATION_FAILED','Inventory valuation inputs are invalid.');
 const oldQty=scaled(existingQuantity,6),newQty=scaled(receivedQuantity,6),denominator=oldQty+newQty;
 if(newQty<=0n)throw new ApiProblem(400,'VALIDATION_FAILED','Receipt quantity is below stock precision.');
 const numerator=oldQty*scaled(existingRate,12)+BigInt(totalCostMinor)*1_000_000n*SCALE;
 const result=(numerator+denominator/2n)/denominator;
 return costRate(Number(`${result/SCALE}.${(result%SCALE).toString().padStart(12,'0')}`));
}
