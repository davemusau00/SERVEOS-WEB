/** Canonical integer money arithmetic used by API and local cashier snapshots. */
export function inclusiveTax(grossMinor,snapshot){
 if(!Number.isSafeInteger(grossMinor)||grossMinor<0||!snapshot||![snapshot.vatRateBasisPoints,snapshot.levyRateBasisPoints].every(rate=>Number.isInteger(rate)&&rate>=0&&rate<=10000))throw new Error('Tax snapshot is invalid.');
 const vat=BigInt(snapshot.vatRateBasisPoints),levy=BigInt(snapshot.levyRateBasisPoints),denominator=10000n+vat+levy,gross=BigInt(grossMinor);
 const vatMinor=Number((gross*vat+denominator/2n)/denominator),levyMinor=Number((gross*levy+denominator/2n)/denominator),netMinor=grossMinor-vatMinor-levyMinor;
 if(netMinor<0)throw new Error('Tax rounding did not conserve the line total.');return {netMinor,vatMinor,levyMinor};
}
export function calculateLine(quantity,unitPriceMinor,basisPoints,comped,taxSnapshot){
 if(!Number.isFinite(quantity)||quantity<=0||quantity>1_000_000||Math.abs(quantity*1_000_000-Math.round(quantity*1_000_000))>0.0001||!Number.isSafeInteger(unitPriceMinor)||unitPriceMinor<0||!Number.isInteger(basisPoints)||basisPoints<0||basisPoints>10000||typeof comped!=='boolean')throw new Error('Line quantity, price or discount is invalid.');
 const scaled=BigInt(quantity.toFixed(6).replace('.','')),gross=(scaled*BigInt(unitPriceMinor)+500000n)/1000000n,discount=comped?gross:(gross*BigInt(basisPoints)+5000n)/10000n;
 const grossMinor=Number(gross),discountMinor=Number(discount),lineTotalMinor=Number(gross-discount);
 if(!Number.isSafeInteger(grossMinor))throw new Error('Line price exceeds the supported amount.');
 return {grossMinor,discountMinor,lineTotalMinor,...inclusiveTax(lineTotalMinor,taxSnapshot)};
}
