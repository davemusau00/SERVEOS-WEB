import {createHash, randomUUID} from 'node:crypto';
import {ApiProblem, commandHash, executeCommand} from './command-kernel.mjs';

export const API_IMPORT_TEMPLATES = Object.freeze([
  {key:'products',label:'Products',permission:'catalog.manage',headers:['external_id','name','code','price','category','barcode','stock_item_external_id','outlet_external_ids'],required:['external_id','name','code','price']},
  {key:'stockItems',label:'Stock items',permission:'catalog.manage',headers:['external_id','name','code','base_unit','reorder_level','barcode'],required:['external_id','name','code','base_unit']},
  {key:'stockLocations',label:'Stock locations',permission:'catalog.manage',permissions:['catalog.manage','inventory.adjust'],headers:['external_id','name','code','type'],required:['external_id','name']},
  {key:'outlets',label:'Outlets',permission:'business.configure',headers:['external_id','name','default_stock_location_external_id'],required:['external_id','name','default_stock_location_external_id']},
  {key:'suppliers',label:'Suppliers',permission:'procurement.manage',permissions:['procurement.manage','suppliers.manage'],headers:['external_id','name','code','contact_name','phone','email','address','tax_pin','payment_terms_days','notes'],required:['external_id','name','code']},
  {key:'customers',label:'Guests and customers',permission:'customers.manage',headers:['external_id','name','phone','email','notes'],required:['external_id','name']},
  {key:'roomTypes',label:'Room types',permission:'roomTypes.manage',headers:['external_id','name','code','max_guests'],required:['external_id','name']},
  {key:'rooms',label:'Rooms',permission:'rooms.manage',headers:['external_id','room_number','room_type_external_id','capacity','turnaround_minutes','floor','amenities','notes'],required:['external_id','room_number','room_type_external_id','capacity']},
  {key:'ratePlans',label:'Nightly rate plans',permission:'rooms.manage',headers:['external_id','name','room_type_external_id','nightly_rate','currency','tax_basis_points','notes'],required:['external_id','name','room_type_external_id','nightly_rate']},
  {key:'hotelServices',label:'Hotel services',permission:'business.configure',headers:['external_id','code','name','unit_price','tax_basis_points'],required:['external_id','code','name','unit_price']},
  {key:'assetCategories',label:'Asset categories',permission:'assets.manage',headers:['external_id','name','code','notes'],required:['external_id','name']},
  {key:'assets',label:'Assets',permission:'assets.manage',headers:['external_id','name','asset_tag','category_external_id','room_external_id','stock_location_external_id','serial_number','acquisition_date','acquisition_cost','notes'],required:['external_id','name','asset_tag','category_external_id','acquisition_cost']},
]);

const MAX_CSV_BYTES=2*1024*1024,MAX_ROWS=20_000,PREVIEW_LIMIT=500;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hashText=value=>createHash('sha256').update(value,'utf8').digest('hex');
const templateFor=key=>API_IMPORT_TEMPLATES.find(template=>template.key===key);
const allowed=actor=>actor.permissions?.includes('*')||actor.permissions?.includes('data.import.stage')||actor.permissions?.includes('data.import.view')||actor.permissions?.includes('data.import.execute');
const requirePermission=(actor,permission)=>{if(!actor.permissions?.includes('*')&&!actor.permissions?.includes(permission))throw new ApiProblem(403,'PERMISSION_DENIED',`The ${permission} permission is required.`)};
const ownPermission=(actor,definition)=>actor.permissions?.includes('*')||(definition?.permissionAny??[definition?.permission]).some(permission=>permission&&actor.permissions?.includes(permission));
const iso=value=>value instanceof Date?value.toISOString():value;
const problem=(status,code,message)=>{throw new ApiProblem(status,code,message)};
const normalizedHeader=value=>String(value??'').trim().toLowerCase();
const uniqueColumns={products:['code','barcode'],stockItems:['code','barcode'],stockLocations:['code'],outlets:[],suppliers:['code'],roomTypes:['code'],rooms:['room_number'],ratePlans:[],hotelServices:['code'],assetCategories:['code'],assets:['asset_tag'],customers:[]};

export function parseCsv(csvText){
  if(typeof csvText!=='string')problem(400,'VALIDATION_FAILED','CSV content must be text.');
  if(Buffer.byteLength(csvText,'utf8')>MAX_CSV_BYTES)problem(413,'PAYLOAD_TOO_LARGE','CSV files may not exceed 2 MB.');
  const source=csvText.replace(/^\uFEFF/u,'');
  const rows=[];let row=[],field='',quoted=false,closedQuote=false;
  for(let index=0;index<source.length;index++){
    const character=source[index];
    if(quoted){
      if(character==='"'){if(source[index+1]==='"'){field+='"';index++}else{quoted=false;closedQuote=true}}
      else field+=character;
      continue;
    }
    if(closedQuote&&character!==','&&character!=='\r'&&character!=='\n')problem(400,'CSV_MALFORMED','Unexpected text follows a quoted CSV field.');
    if(character==='"'){if(field.length)problem(400,'CSV_MALFORMED','A quoted field must start at the beginning of a CSV field.');quoted=true;closedQuote=false;continue}
    if(character===','){row.push(field);field='';closedQuote=false;continue}
    if(character==='\r'||character==='\n'){
      if(character==='\r'&&source[index+1]==='\n')index++;
      row.push(field);field='';closedQuote=false;
      if(row.some(value=>value.trim()!==''))rows.push(row);
      row=[];continue;
    }
    field+=character;
  }
  if(quoted)problem(400,'CSV_MALFORMED','A quoted CSV field is not closed.');
  if(field.length||row.length){row.push(field);if(row.some(value=>value.trim()!==''))rows.push(row)}
  if(!rows.length)problem(400,'CSV_EMPTY','The CSV file has no header row.');
  if(rows.length<2)problem(400,'CSV_EMPTY','The CSV file has no data rows.');
  if(rows.length-1>MAX_ROWS)problem(413,'TOO_MANY_ROWS','CSV files may contain at most 20,000 data rows.');
  return rows;
}

const text=(value)=>String(value??'').trim();
function minorUnits(value,label){
  const raw=text(value);if(!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/u.test(raw))throw new Error(`${label} must be a non-negative amount with at most two decimal places.`);
  const [whole,fraction='']=raw.split('.');const result=Number(whole)*100+Number((fraction+'00').slice(0,2));
  if(!Number.isSafeInteger(result))throw new Error(`${label} exceeds the supported amount.`);return result;
}
function decimal(value,label,{fallback=0,min=0,max=1_000_000_000}={}){
  const raw=text(value);if(!raw&&fallback!==undefined)return fallback;
  if(!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/u.test(raw))throw new Error(`${label} must be a non-negative number with at most six decimal places.`);
  const result=Number(raw);if(!Number.isFinite(result)||result<min||result>max)throw new Error(`${label} is outside the supported range.`);return result;
}
function whole(value,label,{fallback,min=0,max=100_000}={}){
  const raw=text(value);if(!raw&&fallback!==undefined)return fallback;
  if(!/^\d+$/u.test(raw))throw new Error(`${label} must be a whole number.`);const result=Number(raw);
  if(!Number.isSafeInteger(result)||result<min||result>max)throw new Error(`${label} is outside the supported range.`);return result;
}
function date(value,label){const raw=text(value);if(!raw)return null;if(!/^\d{4}-\d{2}-\d{2}$/u.test(raw))throw new Error(`${label} must use YYYY-MM-DD.`);const parsed=new Date(`${raw}T00:00:00.000Z`);if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==raw)throw new Error(`${label} must use YYYY-MM-DD.`);return raw}
function email(value,label){const raw=text(value);if(raw&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(raw)||raw.length>254))throw new Error(`${label} must be a valid email address.`);return raw}
function plain(value,label,max=500){const raw=text(value);if(raw.length>max||/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(raw))throw new Error(`${label} is too long or contains unsupported control characters.`);return raw}
const optionalData=(value,key,build)=>text(value)?{[key]:build(value)}:{};
const optionalPlain=(value,key,label,max)=>optionalData(value,key,item=>plain(item,label,max));

function parseRows(template,csvText){
  const matrix=parseCsv(csvText),headers=matrix[0].map(value=>value.trim());
  if(!headers.length||headers.some(value=>!value))problem(400,'CSV_HEADERS_INVALID','Every CSV column must have a name.');
  const keys=headers.map(normalizedHeader);if(new Set(keys).size!==keys.length)problem(400,'CSV_DUPLICATE_HEADERS','CSV column names must be unique, ignoring case.');
  const sensitive=/password|secret|token|credential|(?:^|[_\s-])pin(?:$|[_\s-])/iu;
  if(keys.some(key=>sensitive.test(key)&&!['tax_pin','kra_pin'].includes(key)))problem(400,'CSV_SENSITIVE_COLUMN','CSV files cannot contain staff credentials, PINs, passwords, secrets, or tokens.');
  const unknown=keys.filter(key=>!template.headers.includes(key));if(unknown.length)problem(400,'CSV_UNSUPPORTED_COLUMNS',`Unsupported columns: ${unknown.join(', ')}.`);
  const missing=template.required.filter(key=>!keys.includes(key));if(missing.length)problem(400,'CSV_REQUIRED_COLUMNS',`Required columns are missing: ${missing.join(', ')}.`);
  const externalColumn=keys.indexOf('external_id'),externalIds=new Set(),uniqueValues=new Map((uniqueColumns[template.key]||[]).map(key=>[key,new Map()]));
  const rows=matrix.slice(1).map((values,index)=>{
    const errors=[];
    if(values.length!==headers.length)errors.push(`Expected ${headers.length} columns but found ${values.length}.`);
    const normalized=Object.fromEntries(headers.map((header,column)=>[keys[column],values[column]??'']));
    const externalId=text(values[externalColumn]);
    if(!externalId)errors.push('external_id is required.');else if(externalId.length>200)errors.push('external_id may not exceed 200 characters.');
    const key=externalId.toLocaleLowerCase('en-US');if(key&&externalIds.has(key))errors.push('external_id is duplicated within this file.');externalIds.add(key);
    for(const [column,seen] of uniqueValues){const value=text(normalized[column]).toLocaleLowerCase('en-US');if(!value)continue;if(seen.has(value))errors.push(`${column} duplicates row ${seen.get(value)} within this file.`);else seen.set(value,index+2)}
    for(const name of template.required)if(!text(normalized[name]))errors.push(`${name} is required.`);
    if(normalized.barcode&&normalized.barcode!==normalized.barcode.trim())errors.push('Barcode whitespace is not allowed; leading zeroes are preserved.');
    if(normalized.email){try{email(normalized.email,'Email')}catch(error){errors.push(error.message)}}
    if(normalized.price!==undefined&&text(normalized.price)){try{minorUnits(normalized.price,'Price')}catch(error){errors.push(error.message)}}
    if(normalized.nightly_rate!==undefined&&text(normalized.nightly_rate)){try{minorUnits(normalized.nightly_rate,'Nightly rate')}catch(error){errors.push(error.message)}}
    if(normalized.unit_price!==undefined&&text(normalized.unit_price)){try{minorUnits(normalized.unit_price,'Unit price')}catch(error){errors.push(error.message)}}
    for(const [key,label,max] of [['max_guests','Maximum guests',1000],['capacity','Capacity',1000],['turnaround_minutes','Turnaround minutes',10080],['payment_terms_days','Payment terms',365],['tax_basis_points','Tax basis points',10000]])if(normalized[key]!==undefined&&text(normalized[key])){try{whole(normalized[key],label,{max})}catch(error){errors.push(error.message)}}
    if(normalized.reorder_level!==undefined&&text(normalized.reorder_level)){try{decimal(normalized.reorder_level,'Reorder level')}catch(error){errors.push(error.message)}}
    if(normalized.type&& !['STORE','FRIDGE','BAR','KITCHEN','OTHER'].includes(text(normalized.type).toUpperCase()))errors.push('type must be STORE, FRIDGE, BAR, KITCHEN, or OTHER.');
    if(normalized.currency&&text(normalized.currency).toUpperCase()!=='KES')errors.push('Only KES is supported by this API importer.');
    if(normalized.acquisition_date){try{date(normalized.acquisition_date,'Acquisition date')}catch(error){errors.push(error.message)}}
    if(normalized.acquisition_cost!==undefined&&text(normalized.acquisition_cost)){try{minorUnits(normalized.acquisition_cost,'Acquisition cost')}catch(error){errors.push(error.message)}}
    if(template.key==='assets'&&Boolean(text(normalized.room_external_id))===Boolean(text(normalized.stock_location_external_id)))errors.push('Provide exactly one of room_external_id or stock_location_external_id.');
    for(const [key,max] of Object.entries({name:160,code:80,category:80,phone:80,email:254,address:2000,notes:2000,contact_name:160,asset_tag:80,room_number:40,base_unit:40,external_id:200}))if(normalized[key]!==undefined&&text(normalized[key]).length>max)errors.push(`${key} exceeds ${max} characters.`);
    return {rowNumber:index+2,externalId:externalId||null,values:normalized,errors:[...new Set(errors)],status:errors.length?'INVALID':'VALID'};
  });
  return {headers,rows};
}

export function validateImportCsv(templateKey,csvText){const template=templateFor(templateKey);if(!template)problem(400,'IMPORT_TEMPLATE_UNSUPPORTED','Choose a template supported by the ServOS API.');return parseRows(template,csvText)}

const summary=row=>({id:row.id,templateKey:row.template_key,fileName:row.file_name,status:row.status,createdBy:row.created_by,createdAt:iso(row.created_at),updatedAt:iso(row.updated_at),rowCount:Number(row.row_count),validCount:Number(row.valid_count),invalidCount:Number(row.invalid_count),sourceHash:row.source_hash,headers:row.headers,notes:row.notes});
const batchRows=rows=>typeof rows==='string'?JSON.parse(rows):rows;
function detail(row){const parsed=batchRows(row.rows);return {...summary(row),rows:parsed.slice(0,PREVIEW_LIMIT).map(item=>({rowNumber:item.rowNumber,status:item.status,externalId:item.externalId,normalized:item.values,errors:item.errors,warnings:[]})),rowsTruncated:parsed.length>PREVIEW_LIMIT}}
function safePlan(row){const steps=typeof row.steps==='string'?JSON.parse(row.steps):row.steps;return {id:row.id,batchId:row.batch_id,status:row.status,createdBy:row.created_by,createdAt:iso(row.created_at),updatedAt:iso(row.updated_at),sourceHash:row.source_hash,summary:{total:steps.length,create:steps.filter(step=>step.action==='CREATE').length,noChange:0,blocked:steps.filter(step=>step.status==='BLOCKED').length,conflict:steps.filter(step=>step.status==='CONFLICT').length,applied:steps.filter(step=>step.status==='APPLIED').length,failed:steps.filter(step=>step.status==='FAILED').length},steps:steps.slice(0,PREVIEW_LIMIT).map(({rowNumber,action,status,operation,targetCollection,targetId,reason,error})=>({rowNumber,action,status,operation,targetCollection,targetId,reason,error})),stepsTruncated:steps.length>PREVIEW_LIMIT}}

export async function importTemplates(actor){requirePermission(actor,'data.import.stage');return {templates:API_IMPORT_TEMPLATES.map(({key,label,headers,required,permission,permissions})=>({key,label,headers,required,permission,permissions:permissions||[permission],importable:Boolean(actor.permissions?.includes('*')||(permissions||[permission]).some(value=>actor.permissions?.includes(value)))})),limits:{maxBytes:MAX_CSV_BYTES,maxRows:MAX_ROWS,previewRows:PREVIEW_LIMIT},excluded:[{key:'employees',reason:'Staff accounts require individual API credentials and permissions; CSV cannot create or assign credentials.'},{key:'inventory',reason:'Opening balances require a reviewed inventory command and reconciliation. They are not part of master-data import.'},{key:'business',reason:'Business identity is configured through the API settings workflow.'}]}}

export async function listImportBatches(pool,actor){if(!allowed(actor))throw new ApiProblem(403,'PERMISSION_DENIED','Import access is required.');const {rows}=await pool.query('SELECT * FROM api_import_batches WHERE business_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100',[actor.businessId]);return {batches:rows.map(summary)}}

export async function getImportBatch(pool,actor,batchId){if(!allowed(actor))throw new ApiProblem(403,'PERMISSION_DENIED','Import access is required.');if(!UUID.test(batchId))problem(400,'VALIDATION_FAILED','Batch ID must be a UUID.');const {rows}=await pool.query('SELECT * FROM api_import_batches WHERE business_id=$1 AND id=$2',[actor.businessId,batchId]);if(!rows[0])problem(404,'IMPORT_BATCH_NOT_FOUND','Import batch was not found.');const plan=await pool.query('SELECT * FROM api_import_plans WHERE business_id=$1 AND batch_id=$2 ORDER BY created_at DESC LIMIT 1',[actor.businessId,batchId]);return {batch:detail(rows[0]),...(plan.rows[0]?{plan:safePlan(plan.rows[0])}:{})}}

export async function stageImport(pool,actor,input){requirePermission(actor,'data.import.stage');if(!input||typeof input!=='object'||!UUID.test(input.id||''))problem(400,'VALIDATION_FAILED','Import batch ID must be a UUID.');const template=templateFor(input.templateKey);if(!template)problem(400,'IMPORT_TEMPLATE_UNSUPPORTED','Choose a template supported by the ServOS API.');
  const fileName=typeof input.fileName==='string'?input.fileName.trim().replace(/[\\/]/gu,'_').slice(0,200):'';if(!fileName||!fileName.toLowerCase().endsWith('.csv'))problem(400,'VALIDATION_FAILED','Choose a CSV filename.');
  if(typeof input.csvText!=='string'||Buffer.byteLength(input.csvText,'utf8')>MAX_CSV_BYTES)problem(413,'PAYLOAD_TOO_LARGE','CSV files may not exceed 2 MB.');
  const sourceHash=hashText(input.csvText);const existing=await pool.query('SELECT * FROM api_import_batches WHERE business_id=$1 AND id=$2',[actor.businessId,input.id]);if(existing.rows[0]){const saved=existing.rows[0];if(saved.created_by!==actor.staffId||saved.source_hash!==sourceHash||saved.template_key!==template.key)problem(409,'IMPORT_BATCH_ID_REUSED','This batch ID already identifies a different import.');return {batch:detail(saved)}}
  const parsed=parseRows(template,input.csvText),validCount=parsed.rows.filter(row=>row.status==='VALID').length,invalidCount=parsed.rows.length-validCount,at=new Date();
  const {rows}=await pool.query(`INSERT INTO api_import_batches(business_id,id,template_key,file_name,status,created_by,created_at,updated_at,source_hash,source_text,headers,rows,row_count,valid_count,invalid_count,notes) VALUES($1,$2,$3,$4,'STAGED',$5,$6,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,'Create-only import. Review every row before application.') RETURNING *`,[actor.businessId,input.id,template.key,fileName,actor.staffId,at,sourceHash,input.csvText,JSON.stringify(parsed.headers),JSON.stringify(parsed.rows),parsed.rows.length,validCount,invalidCount]);
  await pool.query('INSERT INTO api_import_events(business_id,id,batch_id,event_type,staff_id,device_id,event_data,occurred_at) VALUES($1,$2,$3,\'STAGED\',$4,$5,$6::jsonb,$7)',[actor.businessId,randomUUID(),input.id,actor.staffId,actor.deviceId,JSON.stringify({templateKey:template.key,rowCount:parsed.rows.length,sourceHash}),at]);
  return {batch:detail(rows[0])};
}

async function importedId(tx,businessId,templateKey,externalId){
  const key=text(externalId).toLocaleLowerCase('en-US');if(!key)throw new ApiProblem(409,'IMPORT_REFERENCE_MISSING',`A ${templateKey} external ID is required.`);
  const {rows}=await tx.client.query('SELECT record_collection AS collection,record_id AS id FROM api_import_external_ids WHERE business_id=$1 AND template_key=$2 AND external_id_key=$3',[businessId,templateKey,key]);
  if(!rows[0])throw new ApiProblem(409,'IMPORT_REFERENCE_MISSING',`Referenced ${templateKey} external ID "${text(externalId)}" has not been imported. Import dependencies first.`);return rows[0];
}
async function version(tx,businessId,collection,id){const {rows}=await tx.client.query('SELECT version FROM business_entity_versions WHERE business_id=$1 AND entity_type=$2 AND entity_id=$3',[businessId,collection,id]);return Number(rows[0]?.version??0)}
const expected=(collection,id,value)=>({[`${collection}:${id}`]:value});
const relationVersion=async(tx,businessId,map,collection)=>expected(map.collection,map.id,await version(tx,businessId,map.collection,map.id));

async function commandForRow(tx,actor,template,row){
  const v=row.values,id=randomUUID(),externalId=row.externalId;let name,payload,expectedVersions=expected(template.key,id,0),targetCollection=template.key;
  const requireExternal=async(namespace,externalId,collection)=>{const found=await importedId(tx,actor.businessId,namespace,externalId);if(collection&&found.collection!==collection)throw new ApiProblem(409,'IMPORT_REFERENCE_TYPE','The referenced external ID belongs to another record type.');Object.assign(expectedVersions,await relationVersion(tx,actor.businessId,found));return found.id};
  const requireMap=(key,namespace,collection)=>requireExternal(namespace,v[key],collection);
  switch(template.key){
    case 'products':{
      name='product.save';
      const stockItemId=text(v.stock_item_external_id)?await requireMap('stock_item_external_id','stockItems','stockItems'):null;
      const outletIds=text(v.outlet_external_ids)?await Promise.all(text(v.outlet_external_ids).split(/[;|]/u).map(item=>requireExternal('outlets',item,'outlets'))):null;
      payload={id,data:{
        name:plain(v.name,'Product name',160),
        code:plain(v.code,'Product code',80),
        priceMinor:minorUnits(v.price,'Price'),
        ...(stockItemId?{stockItemId}:{}),
        ...(outletIds?{outletIds}:{}),
        ...optionalPlain(v.category,'category','Category',80),
        ...optionalPlain(v.barcode,'barcode','Barcode',120),
      }};
      break;
    }
    case 'stockItems':name='stockItem.save';payload={id,data:{
      name:plain(v.name,'Stock item name',160),
      code:plain(v.code,'Stock item code',80),
      baseUnit:plain(v.base_unit,'Base unit',40),
      ...optionalPlain(v.barcode,'barcode','Barcode',120),
      ...optionalData(v.reorder_level,'reorderLevel',value=>decimal(value,'Reorder level')),
    }};break;
    case 'stockLocations':name='stockLocation.save';payload={id,data:{
      name:plain(v.name,'Location name',120),
      ...optionalPlain(v.code,'code','Location code',80),
      ...optionalData(v.type,'type',value=>plain(value,'Location type',20).toUpperCase()),
    }};break;
    case 'outlets':{name='outlet.save';const defaultStockLocationId=await requireMap('default_stock_location_external_id','stockLocations','stockLocations');payload={id,reason:'Created from reviewed controlled CSV import',data:{name:plain(v.name,'Outlet name',120),defaultStockLocationId,archived:false}};break;}
    case 'suppliers':name='supplier.save';payload={id,reason:'Created from reviewed controlled CSV import',data:{
      code:plain(v.code,'Supplier code',80),name:plain(v.name,'Supplier name',160),
      ...optionalPlain(v.contact_name,'contactName','Contact name',160),
      ...optionalPlain(v.phone,'phone','Phone',80),
      ...optionalData(v.email,'email',value=>email(value,'Email')),
      ...optionalPlain(v.address,'address','Address',2000),
      ...optionalPlain(v.tax_pin,'taxPin','Tax PIN',80),
      ...optionalData(v.payment_terms_days,'paymentTermsDays',value=>whole(value,'Payment terms',{max:365})),
      ...optionalPlain(v.notes,'notes','Notes',2000),
    }};break;
    case 'customers':name='customer.save';payload={id,reason:'Created from reviewed controlled CSV import',data:{
      name:plain(v.name,'Customer name',160),
      ...optionalPlain(v.phone,'phone','Phone',40),
      ...optionalData(v.email,'email',value=>email(value,'Email')),
      ...optionalPlain(v.notes,'notes','Notes',1000),
    }};break;
    case 'roomTypes':name='roomType.save';payload={id,data:{
      name:plain(v.name,'Room type name',100),
      ...optionalPlain(v.code,'code','Room type code',40),
      ...optionalData(v.max_guests,'maxGuests',value=>whole(value,'Maximum guests',{min:1,max:1000})),
    }};break;
    case 'rooms':{const roomTypeId=await requireMap('room_type_external_id','roomTypes','roomTypes');name='room.save';payload={id,data:{
      number:plain(v.room_number,'Room number',40),roomTypeId,capacity:whole(v.capacity,'Capacity',{min:1,max:1000}),
      ...optionalData(v.turnaround_minutes,'turnaroundMinutes',value=>whole(value,'Turnaround minutes',{max:10080})),
      ...optionalPlain(v.floor,'floor','Floor',80),
      ...optionalData(v.amenities,'amenities',value=>text(value).split(';').map(item=>plain(item,'Amenity',80)).filter(Boolean)),
      ...optionalPlain(v.notes,'notes','Notes',1000),
    }};break;}
    case 'ratePlans':{const roomTypeId=await requireMap('room_type_external_id','roomTypes','roomTypes');name='ratePlan.save';payload={id,data:{
      name:plain(v.name,'Rate name',100),roomTypeId,priceMinor:minorUnits(v.nightly_rate,'Nightly rate'),
      ...optionalData(v.tax_basis_points,'taxBasisPoints',value=>whole(value,'Tax basis points',{max:10000})),
      ...optionalPlain(v.notes,'notes','Notes',1000),
    }};break;}
    case 'hotelServices':name='hotelService.save';payload={id,data:{
      code:plain(v.code,'Service code',40),name:plain(v.name,'Service name',120),priceMinor:minorUnits(v.unit_price,'Unit price'),
      ...optionalData(v.tax_basis_points,'taxBasisPoints',value=>whole(value,'Tax basis points',{max:10000})),
    }};break;
    case 'assetCategories':name='assetCategory.save';payload={id,data:{
      name:plain(v.name,'Category name',120),
      ...optionalPlain(v.code,'code','Category code',40),
      ...optionalPlain(v.notes,'notes','Notes',1000),
    }};break;
    case 'assets':{
      name='asset.save';
      const categoryId=await requireMap('category_external_id','assetCategories','assetCategories');
      const roomId=text(v.room_external_id)?await requireMap('room_external_id','rooms','rooms'):null;
      const locationId=text(v.stock_location_external_id)?await requireMap('stock_location_external_id','stockLocations','stockLocations'):null;
      payload={id,data:{
        assetTag:plain(v.asset_tag,'Asset tag',80),name:plain(v.name,'Asset name',160),categoryId,
        acquisitionCostMinor:minorUnits(v.acquisition_cost,'Acquisition cost'),
        ...(roomId?{roomId}:{}),...(locationId?{locationId}:{}),
        ...optionalPlain(v.serial_number,'serialNumber','Serial number',120),
        ...optionalData(v.acquisition_date,'acquiredAt',value=>date(value,'Acquisition date')),
        ...optionalPlain(v.notes,'notes','Notes',2000),
        reason:'Created from reviewed controlled CSV import',
      }};break;
    }
    default:throw new ApiProblem(400,'IMPORT_TEMPLATE_UNSUPPORTED','This template is not supported by the ServOS API importer.');
  }
  if(!name)throw new ApiProblem(400,'IMPORT_TEMPLATE_UNSUPPORTED','This template is not supported by the ServOS API importer.');
  for(const key of Object.keys(expectedVersions))if(key!==`${template.key}:${id}`){}
  return {command:{commandId:randomUUID(),name,payload,expectedVersions},externalId,rowNumber:row.rowNumber,targetCollection,targetId:id};
}

export async function planImport({store,registry,actor,batchId}){
  requirePermission(actor,'data.import.stage');if(!UUID.test(batchId))problem(400,'VALIDATION_FAILED','Batch ID must be a UUID.');
  return store.transaction(async tx=>{
    const {rows}=await tx.client.query('SELECT * FROM api_import_batches WHERE business_id=$1 AND id=$2 FOR UPDATE',[actor.businessId,batchId]);const batch=rows[0];if(!batch)problem(404,'IMPORT_BATCH_NOT_FOUND','Import batch was not found.');
    if(batch.status==='CANCELLED'||batch.status==='APPLIED'||batch.status==='PARTIAL'||batch.status==='APPLYING')problem(409,'IMPORT_BATCH_CLOSED','This import batch cannot be reviewed in its current state.');
    const existing=await tx.client.query("SELECT * FROM api_import_plans WHERE business_id=$1 AND batch_id=$2 AND status IN ('READY','BLOCKED','APPLYING','PARTIAL') ORDER BY created_at DESC LIMIT 1",[actor.businessId,batchId]);if(existing.rows[0])return {plan:safePlan(existing.rows[0])};
    const rowsData=batchRows(batch.rows),template=templateFor(batch.template_key);if(!template)problem(409,'IMPORT_TEMPLATE_UNSUPPORTED','This batch template is no longer supported.');const steps=[];
    for(const row of rowsData){
      const step={rowNumber:row.rowNumber,externalId:row.externalId,action:'CREATE',status:'BLOCKED',operation:null,targetCollection:template.key,targetId:null,reason:'',error:null,command:null};
      if(row.status!=='VALID'){step.reason='Fix the CSV row validation errors before import.';step.error=row.errors.join(' ');steps.push(step);continue}
      try{
        const built=await commandForRow(tx,actor,template,row);const definition=registry.get(built.command.name);if(!definition)throw new ApiProblem(409,'IMPORT_COMMAND_UNAVAILABLE',`API command ${built.command.name} is unavailable.`);
        step.operation=built.command.name;step.targetCollection=built.targetCollection;step.targetId=built.targetId;step.command=built.command;
        if(!ownPermission(actor,definition))throw new ApiProblem(403,'IMPORT_DOMAIN_PERMISSION',`The ${definition.permissionAny?.join(' or ')||definition.permission} permission is required for this row.`);
        await tx.client.query('SAVEPOINT api_import_dry_run');await tx.assertExpectedVersions(actor.businessId,built.command.expectedVersions);await definition.handler({tx,command:built.command,actor,at:new Date()});await tx.client.query('ROLLBACK TO SAVEPOINT api_import_dry_run');await tx.client.query('RELEASE SAVEPOINT api_import_dry_run');
        step.status='PLANNED';step.reason='Create validated by the current API domain rules.';
      }catch(error){
        await tx.client.query('ROLLBACK TO SAVEPOINT api_import_dry_run').catch(()=>undefined);await tx.client.query('RELEASE SAVEPOINT api_import_dry_run').catch(()=>undefined);
        if(!Number.isInteger(error.status)||error.status>=500)throw error;step.status=error.status===409?'CONFLICT':'BLOCKED';step.reason=error.message||'This row could not be validated.';step.error=error.code||null;
      }
      steps.push(step);
    }
    const status=steps.every(step=>step.status==='PLANNED')?'READY':'BLOCKED',at=new Date(),planId=randomUUID();
    await tx.client.query('INSERT INTO api_import_plans(business_id,id,batch_id,status,created_by,created_at,updated_at,source_hash,steps) VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8::jsonb)',[actor.businessId,planId,batchId,status,actor.staffId,at,batch.source_hash,JSON.stringify(steps)]);
    await tx.client.query('UPDATE api_import_batches SET status=$3,updated_at=$4 WHERE business_id=$1 AND id=$2',[actor.businessId,batchId,status==='READY'?'DRY_RUN_READY':'DRY_RUN_BLOCKED',at]);
    await tx.client.query('INSERT INTO api_import_events(business_id,id,batch_id,plan_id,event_type,staff_id,device_id,event_data,occurred_at) VALUES($1,$2,$3,$4,\'PLANNED\',$5,$6,$7::jsonb,$8)',[actor.businessId,randomUUID(),batchId,planId,actor.staffId,actor.deviceId,JSON.stringify({status,summary:{total:steps.length,blocked:steps.filter(step=>step.status==='BLOCKED').length,conflict:steps.filter(step=>step.status==='CONFLICT').length}}),at]);
    const planRow={id:planId,batch_id:batchId,status,created_by:actor.staffId,created_at:at,updated_at:at,source_hash:batch.source_hash,steps};return {plan:safePlan(planRow)};
  });
}

export async function getImportPlan(pool,actor,planId){if(!allowed(actor))throw new ApiProblem(403,'PERMISSION_DENIED','Import access is required.');if(!UUID.test(planId))problem(400,'VALIDATION_FAILED','Plan ID must be a UUID.');const {rows}=await pool.query('SELECT * FROM api_import_plans WHERE business_id=$1 AND id=$2',[actor.businessId,planId]);if(!rows[0])problem(404,'IMPORT_PLAN_NOT_FOUND','Import plan was not found.');return {plan:safePlan(rows[0])}}

export async function applyImport({store,registry,actor,planId}){
  requirePermission(actor,'data.import.execute');if(!UUID.test(planId))problem(400,'VALIDATION_FAILED','Plan ID must be a UUID.');const lock=await store.pool.connect();let locked=false;
  try{
    await lock.query('SELECT pg_advisory_lock(hashtextextended($1,0))',[`csv-import-apply:${actor.businessId}:${planId}`]);locked=true;
    const loaded=await store.pool.query(`SELECT p.*,b.template_key AS "templateKey",b.source_hash AS "batchHash",b.source_text AS "sourceText",b.status AS "batchStatus",b.id AS "batchId" FROM api_import_plans p JOIN api_import_batches b ON b.business_id=p.business_id AND b.id=p.batch_id WHERE p.business_id=$1 AND p.id=$2`,[actor.businessId,planId]);const plan=loaded.rows[0];if(!plan)problem(404,'IMPORT_PLAN_NOT_FOUND','Import plan was not found.');
    if(plan.status==='BLOCKED'||plan.status==='CANCELLED'||plan.status==='APPLIED')problem(409,'IMPORT_PLAN_CLOSED','This import plan is not ready to apply.');
    if(plan.source_hash!==plan.batchHash||!plan.sourceText||hashText(plan.sourceText)!==plan.batchHash)problem(409,'IMPORT_SOURCE_CHANGED','The staged CSV source no longer matches the reviewed plan. Stage a new batch.');
    const steps=typeof plan.steps==='string'?JSON.parse(plan.steps):plan.steps;if(steps.some(step=>step.status==='BLOCKED'||step.status==='CONFLICT'))problem(409,'IMPORT_PLAN_BLOCKED','Resolve every blocked row by correcting the source CSV and staging it again.');
    const at=new Date();await store.pool.query("UPDATE api_import_plans SET status='APPLYING',updated_at=$3 WHERE business_id=$1 AND id=$2",[actor.businessId,planId,at]);await store.pool.query("UPDATE api_import_batches SET status='APPLYING',updated_at=$3 WHERE business_id=$1 AND id=$2",[actor.businessId,plan.batchId,at]);
    const template=templateFor(plan.templateKey);let failed=false;
    for(const step of steps){if(step.status==='APPLIED')continue;if(step.status==='FAILED'){failed=true;continue}if(!step.command){step.status='FAILED';step.error='IMPORT_COMMAND_MISSING';step.reason='The reviewed command is unavailable. Stage a new batch.';failed=true;continue}
      const command=step.command,definition=registry.get(command.name);
      try{
        if(!definition)throw new ApiProblem(409,'IMPORT_COMMAND_UNAVAILABLE','The reviewed domain command is no longer available.');
        const outcome=await executeCommand({db:store,registry,actor,command});
        if(outcome.kind!=='CONFIRMED'){step.status='FAILED';step.reason=outcome.error?.message||`Domain command ended as ${outcome.kind}.`;step.error=outcome.error?.code||outcome.kind;failed=true;}
        else{
          const mapped=await store.pool.query(`INSERT INTO api_import_external_ids(business_id,template_key,external_id,external_id_key,record_collection,record_id,batch_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(business_id,template_key,external_id_key) DO NOTHING RETURNING record_id`,[actor.businessId,template.key,step.externalId,step.externalId.toLocaleLowerCase('en-US'),step.targetCollection,step.targetId,plan.batchId,new Date()]);
          if(!mapped.rows.length){const prior=await store.pool.query('SELECT record_id FROM api_import_external_ids WHERE business_id=$1 AND template_key=$2 AND external_id_key=$3',[actor.businessId,template.key,step.externalId.toLocaleLowerCase('en-US')]);if(prior.rows[0]?.record_id!==step.targetId)throw new ApiProblem(409,'IMPORT_EXTERNAL_ID_CONFLICT','This external ID is already mapped to a different record.');}
          step.status='APPLIED';step.reason='Created through the API domain command.';step.error=null;delete step.command;
        }
      }catch(error){if(!Number.isInteger(error.status)||error.status>=500)throw error;step.status='FAILED';step.reason=error.message||'This row could not be applied.';step.error=error.code||null;delete step.command;failed=true;}
      await store.pool.query('UPDATE api_import_plans SET steps=$3::jsonb,updated_at=$4 WHERE business_id=$1 AND id=$2',[actor.businessId,planId,JSON.stringify(steps),new Date()]);
    }
    const status=failed?'PARTIAL':'APPLIED',finishedAt=new Date();
    await store.transaction(async tx=>{
      await tx.client.query('UPDATE api_import_plans SET status=$3,steps=$4::jsonb,updated_at=$5 WHERE business_id=$1 AND id=$2',[actor.businessId,planId,status,JSON.stringify(steps),finishedAt]);
      await tx.client.query('UPDATE api_import_batches SET status=$3,source_text=NULL,rows=\'[]\'::jsonb,updated_at=$4 WHERE business_id=$1 AND id=$2',[actor.businessId,plan.batchId,status,finishedAt]);
      await tx.client.query('INSERT INTO api_import_events(business_id,id,batch_id,plan_id,event_type,staff_id,device_id,event_data,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)',[actor.businessId,randomUUID(),plan.batchId,planId,status,actor.staffId,actor.deviceId,JSON.stringify({applied:steps.filter(step=>step.status==='APPLIED').length,failed:steps.filter(step=>step.status==='FAILED').length}),finishedAt]);
    });
    const saved=await store.pool.query('SELECT * FROM api_import_plans WHERE business_id=$1 AND id=$2',[actor.businessId,planId]);return {plan:safePlan(saved.rows[0])};
  }finally{if(locked)await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[`csv-import-apply:${actor.businessId}:${planId}`]).catch(()=>undefined);lock.release()}
}

export async function cancelImport(pool,actor,batchId,reason){requirePermission(actor,'data.import.stage');if(!UUID.test(batchId))problem(400,'VALIDATION_FAILED','Batch ID must be a UUID.');const clean=plain(reason,'Cancellation reason',500);if(clean.length<3)problem(400,'VALIDATION_FAILED','Explain why this import is being cancelled.');return withBatchLock(pool,actor.businessId,batchId,async client=>{
  const {rows}=await client.query('SELECT status FROM api_import_batches WHERE business_id=$1 AND id=$2 FOR UPDATE',[actor.businessId,batchId]);if(!rows[0])problem(404,'IMPORT_BATCH_NOT_FOUND','Import batch was not found.');if(!['STAGED','DRY_RUN_READY','DRY_RUN_BLOCKED'].includes(rows[0].status))problem(409,'IMPORT_BATCH_CLOSED','An applying, applied or partially applied batch cannot be cancelled.');const at=new Date();await client.query("UPDATE api_import_batches SET status='CANCELLED',source_text=NULL,rows='[]'::jsonb,updated_at=$3 WHERE business_id=$1 AND id=$2",[actor.businessId,batchId,at]);await client.query("UPDATE api_import_plans SET status='CANCELLED',steps='[]'::jsonb,updated_at=$3 WHERE business_id=$1 AND batch_id=$2 AND status IN ('READY','BLOCKED')",[actor.businessId,batchId,at]);await client.query('INSERT INTO api_import_events(business_id,id,batch_id,event_type,staff_id,device_id,reason,event_data,occurred_at) VALUES($1,$2,$3,\'CANCELLED\',$4,$5,$6,$7::jsonb,$8)',[actor.businessId,randomUUID(),batchId,actor.staffId,actor.deviceId,clean,JSON.stringify({sourcePurged:true}),at]);return {cancelled:true,batchId,status:'CANCELLED'};
})}

async function withBatchLock(pool,businessId,batchId,work){const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`csv-import:${businessId}:${batchId}`]);const result=await work(client);await client.query('COMMIT');return result}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}
