const DECIMAL=/^(\d+)(?:\.(\d{1,2}))?$/;
const QUANTITY_DECIMAL=/^(\d+)(?:\.(\d+))?$/;

export function parseMoneyToMinor(value){
  const match=String(value??'').trim().match(DECIMAL);
  if(!match)throw new Error('Enter a non-negative amount with at most two decimal places.');
  const minor=Number(match[1])*100+Number((match[2]||'').padEnd(2,'0'));
  if(!Number.isSafeInteger(minor))throw new Error('Amount is too large.');
  return minor;
}

export function parsePercentToBasisPoints(value){
  const match=String(value??'').trim().match(DECIMAL);
  if(!match)throw new Error('Enter a percentage with at most two decimal places.');
  const whole=Number(match[1]);
  const hundredths=Number((match[2]||'').padEnd(2,'0'));
  if(whole>100||(whole===100&&hundredths>0))throw new Error('Percentage must be between 0% and 100%.');
  return whole*100+hundredths;
}

export function parseQuantity(value,{min=0,max=Number.MAX_SAFE_INTEGER,maxDecimals=3,integer=false}={}){
  const raw=String(value??'').trim();
  const match=raw.match(QUANTITY_DECIMAL);
  if(!match)throw new Error('Enter a finite, non-negative quantity.');
  const decimals=match[2]||'';
  if(decimals.length>maxDecimals)throw new Error(`Quantity allows at most ${maxDecimals} decimal places.`);
  if(integer&&decimals.replace(/0/g,'').length>0)throw new Error('Quantity must be a whole number.');
  const whole=Number(match[1]);
  const quantity=Number(raw);
  if(!Number.isFinite(quantity)||!Number.isSafeInteger(whole)||whole>max||(whole===max&&decimals.replace(/0/g,'').length>0)||quantity<min||quantity>max)throw new Error('Quantity is outside the allowed range.');
  return quantity;
}
