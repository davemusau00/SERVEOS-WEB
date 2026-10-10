import {ApiProblem} from './command-kernel.mjs';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const businessTypes=new Set(['BAR_CLUB','RESTAURANT_CAFE','HOTEL_RESORT','RETAIL_POS','MIXED_HOSPITALITY']);
const locationTypes=new Set(['STORE','FRIDGE','BAR','KITCHEN','OTHER']);
const paymentMethods=new Set(['CASH','MPESA','CARD','BANK']);
const fail=message=>{throw new ApiProblem(400,'VALIDATION_FAILED',message)};
const cleanText=(value,label,max)=>{
 if(typeof value!=='string'||value.trim().length>max)fail(`${label} must be a valid text value up to ${max} characters.`);
 return value.trim();
};
const requiredText=(value,label,max)=>{
 const result=cleanText(value,label,max);
 if(!result)fail(`${label} is required.`);
 return result;
};
const optionalText=(value,label,max)=>{
 const result=cleanText(value??'',label,max);
 return result||null;
};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

export function normalizeBusinessSetupConfiguration(input){
 if(!object(input))fail('Business setup configuration must be an object.');
 const businessType=input.businessType===null||input.businessType===''?null:input.businessType;
 if(businessType!==null&&!businessTypes.has(businessType))fail('Choose one of the supported business types.');
 const taxTreatment=input.taxTreatment===null||input.taxTreatment===''?null:input.taxTreatment;
 if(taxTreatment!==null&&!['ZERO_RATES','CUSTOM_RATES'].includes(taxTreatment))fail('Choose an explicit tax treatment.');
 const vatRateBasisPoints=input.vatRateBasisPoints??0,levyRateBasisPoints=input.levyRateBasisPoints??0;
 for(const rate of [vatRateBasisPoints,levyRateBasisPoints])if(!Number.isSafeInteger(rate)||rate<0||rate>10000)fail('Tax rates must be whole basis points between 0 and 10000.');
 if(taxTreatment==='ZERO_RATES'&&(vatRateBasisPoints!==0||levyRateBasisPoints!==0))fail('Zero-rate tax treatment must use zero VAT and levy rates.');
 const rawLocations=input.locations??[],rawOutlets=input.outlets??[],rawPayments=input.payments??[];
 if(!Array.isArray(rawLocations)||rawLocations.length>10||!Array.isArray(rawOutlets)||rawOutlets.length>10||!Array.isArray(rawPayments)||rawPayments.length>10)fail('Setup supports up to ten locations, outlets, and payment accounts.');
 const locations=rawLocations.map(item=>{
  if(!object(item)||!uuid(item.id))fail('A storage location has an invalid internal identifier.');
  const type=String(item.type||'STORE').toUpperCase();
  if(!locationTypes.has(type))fail('Choose a supported storage location type.');
  return {id:item.id,name:requiredText(item.name,'Storage location name',120),code:requiredText(item.code||item.id,'Storage location code',80).toUpperCase(),type};
 });
 const outlets=rawOutlets.map(item=>{
  if(!object(item)||!uuid(item.id)||!uuid(item.defaultStockLocationId))fail('An outlet needs a valid internal identifier and default storage location.');
  return {id:item.id,name:requiredText(item.name,'Outlet name',120),defaultStockLocationId:item.defaultStockLocationId};
 });
 const payments=rawPayments.map(item=>{
  if(!object(item)||!uuid(item.id)||!paymentMethods.has(item.method))fail('A payment account needs a valid identifier and tender method.');
  if(typeof item.referenceRequired!=='boolean')fail('Payment reference policy must be explicit.');
  const account={id:item.id,name:requiredText(item.name,'Payment account name',120),code:requiredText(item.code,'Payment account code',40).toUpperCase(),method:item.method,referenceRequired:item.referenceRequired};
  if(item.method==='CASH'&&item.referenceRequired)fail('Cash accounts cannot require external references.');
  if(item.method==='MPESA'){
   if(!['TILL','PAYBILL'].includes(item.mpesaMode))fail('Choose M-Pesa till or paybill.');
   const mpesaNumber=requiredText(item.mpesaNumber,'M-Pesa destination',10);
   if(!/^\d{5,10}$/.test(mpesaNumber))fail('Enter the M-Pesa till or paybill number provided by the business owner.');
   account.mpesaMode=item.mpesaMode;account.mpesaNumber=mpesaNumber;
   account.mpesaAccountReference=item.mpesaMode==='PAYBILL'?requiredText(item.mpesaAccountReference,'Paybill account reference',100):null;
  }
  return account;
 });
 const distinct=(values,label)=>{if(new Set(values).size!==values.length)fail(`${label} must be unique.`)};
 distinct(locations.map(item=>item.id),'Storage location identifiers');
 distinct(locations.map(item=>item.code.toLowerCase()),'Storage location codes');
 distinct(outlets.map(item=>item.id),'Outlet identifiers');
 distinct(payments.map(item=>item.id),'Payment account identifiers');
 distinct(payments.map(item=>item.code.toLowerCase()),'Payment account codes');
 const locationIds=new Set(locations.map(item=>item.id));
 if(outlets.some(item=>!locationIds.has(item.defaultStockLocationId)))fail('Every outlet must use a storage location in this setup plan.');
 const optional=input.optionalSteps??{};
 if(!object(optional))fail('Optional setup choices are malformed.');
 const choice=(value,label)=>{
  const resolved=value??'LATER';
  if(!['NOW','LATER'].includes(resolved))fail(`Choose whether to configure ${label} now or later.`);
  return resolved;
 };
 return {
  businessName:cleanText(input.businessName??'','Business name',160),
  category:cleanText(input.category??'','Business category',100),
  contact:optionalText(input.contact,'Contact telephone',160),
  address:optionalText(input.address,'Business address or location',500),
  receiptName:cleanText(input.receiptName??'','Receipt display name',160),
  taxPin:optionalText(input.taxPin,'Tax registration number',80),
  footer:optionalText(input.footer,'Receipt footer',500),
  taxTreatment,
  vatRateBasisPoints,
  levyRateBasisPoints,
  businessType,
  locations,
  outlets,
  payments,
  optionalSteps:{products:choice(optional.products,'products'),staff:choice(optional.staff,'staff'),rooms:choice(optional.rooms,'rooms')},
 };
}

const projection=row=>({
 collection:'businessSetup',id:row.businessId,version:Number(row.version),archived:false,
 data:{status:row.status,currentStep:Number(row.currentStep),configuration:row.configuration,updatedBy:row.updatedBy,updatedAt:row.updatedAt.toISOString(),completedAt:row.completedAt?.toISOString()??null},
});

export async function businessSetupProjections(db,businessId){
 const {rows}=await db.query('SELECT business_id AS "businessId",status,current_step AS "currentStep",configuration,version,updated_by AS "updatedBy",updated_at AS "updatedAt",completed_at AS "completedAt" FROM business_setup WHERE business_id=$1',[businessId]);
 return rows.map(projection);
}

const configure=async({tx,command,actor,at})=>{
 const {configuration,currentStep}=command.payload;
 if(!Number.isSafeInteger(currentStep)||currentStep<0||currentStep>3)fail('Business setup step is invalid.');
 const normalized=normalizeBusinessSetupConfiguration(configuration);
 const baseline=command.expectedVersions[`businessSetup:${actor.businessId}`];
 if(!Number.isSafeInteger(baseline)||baseline<1)fail('Review the current business setup version before saving.');
 const current=await tx.client.query('SELECT status FROM business_setup WHERE business_id=$1 FOR UPDATE',[actor.businessId]);
 if(!current.rows.length)throw new ApiProblem(409,'SETUP_NOT_AVAILABLE','This business does not have a first-run setup record.');
 if(current.rows[0].status==='COMPLETED')throw new ApiProblem(409,'SETUP_ALREADY_COMPLETED','First-run setup is already complete.');
 const version=await tx.bumpEntityVersion(actor.businessId,'businessSetup',actor.businessId,baseline);
 if(normalized.businessName)await tx.client.query("UPDATE businesses SET name=$2,time_zone='Africa/Nairobi' WHERE id=$1",[actor.businessId,normalized.businessName]);
 await tx.client.query('UPDATE business_setup SET current_step=$2,configuration=$3::jsonb,version=$4,updated_by=$5,updated_at=$6 WHERE business_id=$1',[actor.businessId,currentStep,JSON.stringify(normalized),version,actor.staffId,at]);
 const value=(await businessSetupProjections(tx.client,actor.businessId))[0];
 return {value,records:[value]};
};

const complete=async({tx,command,actor,at})=>{
 const baseline=command.expectedVersions[`businessSetup:${actor.businessId}`];
 if(!Number.isSafeInteger(baseline)||baseline<1)fail('Review the current business setup version before finishing.');
 const {rows}=await tx.client.query('SELECT status,current_step AS "currentStep",configuration,version FROM business_setup WHERE business_id=$1 FOR UPDATE',[actor.businessId]);
 if(!rows.length)throw new ApiProblem(409,'SETUP_NOT_AVAILABLE','This business does not have a first-run setup record.');
 const current=rows[0],config=normalizeBusinessSetupConfiguration(current.configuration);
 if(current.status==='COMPLETED'){
  const value=(await businessSetupProjections(tx.client,actor.businessId))[0];
  return {value,records:[value]};
 }
 if(Number(current.version)!==baseline)throw new ApiProblem(409,'VERSION_CONFLICT','Business setup changed. Review it again before finishing.');
 if(Number(current.currentStep)<3||!config.businessName||!config.category||!config.receiptName||!config.businessType||!config.taxTreatment)fail('Complete the business identity, type, outlet, storage, and payment steps first.');
 if(!config.locations.length||!config.outlets.length||!config.payments.some(item=>item.method==='CASH'))fail('Add at least one storage location, one outlet, and the Cash payment option.');
 const settings=await tx.client.query('SELECT business_name AS "businessName",vat_rate_basis_points AS "vatRateBasisPoints",levy_rate_basis_points AS "levyRateBasisPoints" FROM business_receipt_settings WHERE business_id=$1 FOR SHARE',[actor.businessId]);
 if(!settings.rows.length||settings.rows[0].businessName!==config.receiptName||Number(settings.rows[0].vatRateBasisPoints)!==config.vatRateBasisPoints||Number(settings.rows[0].levyRateBasisPoints)!==config.levyRateBasisPoints)fail('Save the receipt name and explicit tax treatment before finishing.');
 const locationIds=config.locations.map(item=>item.id);
 const locationRows=await tx.client.query('SELECT id FROM stock_locations WHERE business_id=$1 AND id=ANY($2::uuid[]) AND archived_at IS NULL',[actor.businessId,locationIds]);
 if(locationRows.rowCount!==locationIds.length)fail('Create every planned storage location before finishing.');
 const outletRows=await tx.client.query('SELECT id,default_stock_location_id AS "defaultStockLocationId" FROM business_outlets WHERE business_id=$1 AND id=ANY($2::uuid[]) AND archived_at IS NULL',[actor.businessId,config.outlets.map(item=>item.id)]);
 if(outletRows.rowCount!==config.outlets.length||config.outlets.some(outlet=>!outletRows.rows.some(row=>row.id===outlet.id&&row.defaultStockLocationId===outlet.defaultStockLocationId)))fail('Create every planned outlet and link it to its selected storage location before finishing.');
 const accountIds=config.payments.map(item=>item.id);
 const accountRows=await tx.client.query('SELECT id,method FROM payment_accounts WHERE business_id=$1 AND id=ANY($2::uuid[]) AND archived_at IS NULL',[actor.businessId,accountIds]);
 if(accountRows.rowCount!==accountIds.length||config.payments.some(account=>!accountRows.rows.some(row=>row.id===account.id&&row.method===account.method)))fail('Create every selected payment option before finishing.');
 const version=await tx.bumpEntityVersion(actor.businessId,'businessSetup',actor.businessId,baseline);
 await tx.client.query("UPDATE business_setup SET status='COMPLETED',current_step=3,version=$2,updated_by=$3,updated_at=$4,completed_at=$4 WHERE business_id=$1",[actor.businessId,version,actor.staffId,at]);
 const value=(await businessSetupProjections(tx.client,actor.businessId))[0];
 return {value,records:[value]};
};

export const businessSetupCommandRegistry=new Map([
 ['business.setup.configure',{permission:'business.configure',offlinePolicy:'ONLINE_ONLY',handler:configure}],
 ['business.setup.complete',{permission:'business.configure',offlinePolicy:'ONLINE_ONLY',handler:complete}],
]);
