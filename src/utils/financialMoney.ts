/** Format recorded integer cents without dividing large amounts as floating point. */
export function minorMoneyDecimal(amount:number|null):string|null {
 if(amount===null||!Number.isSafeInteger(amount))return null;
 const minor=BigInt(amount),absolute=minor<0n?-minor:minor;
 return `${minor<0n?'-':''}${absolute/100n}.${String(absolute%100n).padStart(2,'0')}`;
}

export function formatFinancialMoney(amount:number|null):string {
 if(amount===null||!Number.isSafeInteger(amount))return 'Unavailable';
 const minor=BigInt(amount),absolute=minor<0n?-minor:minor;
 return `${minor<0n?'-':''}KES ${(absolute/100n).toLocaleString('en-KE')}.${String(absolute%100n).padStart(2,'0')}`;
}
