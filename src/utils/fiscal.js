const DECIMAL=/^(\d+)(?:\.(\d{1,2}))?$/;

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
