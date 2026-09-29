import type { IntakeBusinessIdentity } from '../types/runtime';

const parseTable=(input:string):string[][]=>{
  const text=input.replace(/^\uFEFF/,'');const rows:string[][]=[];let row:string[]=[];let cell='';let quoted=false;
  for(let i=0;i<text.length;i+=1){const ch=text[i];if(quoted){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i+=1}else quoted=false}else cell+=ch;continue}
    if(ch==='"')quoted=true;else if(ch===','){row.push(cell);cell=''}else if(ch==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell=''}else cell+=ch}
  if(quoted)throw new Error('CSV has an unterminated quoted field.');
  if(cell.length||row.length){row.push(cell.replace(/\r$/,''));rows.push(row)}
  return rows.filter(r=>r.some(v=>v.trim()));
};
const canon=(v:string)=>v.trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
export const parseBusinessIntakeCsv=(text:string):IntakeBusinessIdentity=>{
  const table=parseTable(text);if(table.length!==2)throw new Error('business.csv must contain one header row and exactly one business row.');
  const headers=table[0].map(canon);const values=table[1];const at=(key:string)=>{const i=headers.indexOf(key);return i<0?'':String(values[i]||'').trim()};
  if(!at('trading_name'))throw new Error('business.csv requires trading_name.');
  return {tradingName:at('trading_name'),legalName:at('legal_name'),registrationNumber:at('registration_number'),kraPin:at('kra_pin').toUpperCase(),phone:at('phone'),email:at('email').toLowerCase(),address:at('address')};
};
