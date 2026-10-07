import {ApiProblem} from './command-kernel.mjs';
import {splitInclusiveTax} from './business-tax.mjs';

export function priceLine(quantity,unitPriceMinor,basisPoints,comped,taxSnapshot){
 if(!Number.isFinite(quantity)||quantity<=0||quantity>1_000_000||Math.abs(quantity*1_000_000-Math.round(quantity*1_000_000))>0.0001||!Number.isSafeInteger(unitPriceMinor)||unitPriceMinor<0||!Number.isInteger(basisPoints)||basisPoints<0||basisPoints>10000||typeof comped!=='boolean')throw new ApiProblem(400,'VALIDATION_FAILED','Line quantity, price or discount is invalid.');
 const scaled=BigInt(quantity.toFixed(6).replace('.',''));
 const gross=(scaled*BigInt(unitPriceMinor)+500000n)/1000000n;
 const discount=comped?gross:(gross*BigInt(basisPoints)+5000n)/10000n;
 const grossMinor=Number(gross),discountMinor=Number(discount),lineTotalMinor=Number(gross-discount);
 if(!Number.isSafeInteger(grossMinor))throw new ApiProblem(400,'VALIDATION_FAILED','Line price exceeds the supported amount.');
 return {grossMinor,discountMinor,lineTotalMinor,...splitInclusiveTax(lineTotalMinor,taxSnapshot)};
}
