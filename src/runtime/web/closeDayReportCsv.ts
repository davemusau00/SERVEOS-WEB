export interface CloseDayReportCsvDocument {
  id: string;
  type: string;
  documentNumber: string;
  hash: string;
  issuedAt: string;
  snapshot: Record<string, unknown>;
}

const canonical=(value:unknown):string=>value===null||typeof value!=='object'?(JSON.stringify(value)??'null'):Array.isArray(value)?`[${value.map(canonical).join(',')}]`:`{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(',')}}`;
const cell=(value:string):string=>{
  const safe=/^[\t\r\n ]*[=+\-@]/u.test(value)?`'${value}`:value;
  return `"${safe.replace(/"/gu,'""')}"`;
};
const pathPart=(value:string|number)=>String(value).replace(/~/gu,'~0').replace(/\//gu,'~1');

/**
 * Export the issued close-day snapshot without querying or recalculating any
 * financial values. Snapshot paths use JSON Pointer escaping so nested detail
 * and array entries remain identifiable in a spreadsheet or downstream tool.
 */
export async function buildVerifiedCloseDayReportCsv(document:CloseDayReportCsvDocument):Promise<string>{
  if(document.type!=='CLOSE_DAY_REPORT'||!document.snapshot||typeof document.snapshot!=='object'||Array.isArray(document.snapshot))throw new Error('Only an issued close-day report can be exported.');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(document.snapshot)));
  const hash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  if(hash!==document.hash)throw new Error('The close-day snapshot hash does not match. Synchronize the issued report before exporting.');

  const lines=[['document_number','document_id','issued_at','snapshot_path','value','value_type'].map(cell).join(',')];
  const add=(path:string,value:unknown)=>{
    let serialized:string,type:string;
    if(value===null){serialized='';type='null';}
    else if(typeof value==='string'){serialized=value;type='string';}
    else if(typeof value==='number'&&Number.isFinite(value)){serialized=String(value);type='number';}
    else if(typeof value==='boolean'){serialized=String(value);type='boolean';}
    else if(typeof value==='object'&&value!==null&&(Array.isArray(value)||Object.keys(value).length===0)){serialized=JSON.stringify(value);type=Array.isArray(value)?'array':'object';}
    else throw new Error('The close-day snapshot contains a value that cannot be represented safely in CSV.');
    lines.push([document.documentNumber,document.id,document.issuedAt,path,serialized,type].map(cell).join(','));
  };
  const visit=(value:unknown,path:string):void=>{
    if(Array.isArray(value)){
      if(value.length===0){add(path,value);return;}
      value.forEach((entry,index)=>visit(entry,`${path}/${index}`));
      return;
    }
    if(value!==null&&typeof value==='object'){
      const entries=Object.entries(value as Record<string,unknown>);
      if(entries.length===0){add(path,value);return;}
      for(const [key,entry] of entries)visit(entry,`${path}/${pathPart(key)}`);
      return;
    }
    add(path,value);
  };
  visit(document.snapshot,'');
  return `${lines.join('\r\n')}\r\n`;
}