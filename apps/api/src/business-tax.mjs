import {ApiProblem} from './command-kernel.mjs';
const columns=`business_name AS "businessName",address,contact,tax_pin AS "taxPin",footer,vat_rate_basis_points AS "vatRateBasisPoints",levy_rate_basis_points AS "levyRateBasisPoints",logo_png_data_url AS "logoPngDataUrl",payment_qr_png_data_url AS "paymentQrPngDataUrl",payment_qr_enabled AS "paymentQrEnabled",version,updated_by AS "updatedBy",updated_at AS "updatedAt"`;
const invalid=message=>{throw new ApiProblem(400,'VALIDATION_FAILED',message)};
const text=(value,label,max,required=false)=>{if(typeof value!=='string'||value.trim().length>max||required&&!value.trim())invalid(`${label} is missing or too long.`);return value.trim();};
const image=(value,label)=>{if(value===null||value==='')return null;if(typeof value!=='string'||value.length>240000||!/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value))invalid(`${label} must be a normalized PNG smaller than 180 KB.`);return value;};
export async function receiptSettings(db,businessId){const {rows}=await db.query(`SELECT ${columns} FROM business_receipt_settings WHERE business_id=$1 FOR SHARE`,[businessId]);const row=rows[0];return row?{...row,version:Number(row.version),updatedAt:row.updatedAt.toISOString()}:null;}
export async function receiptSettingsProjections(db,businessId){
 // Bootstrap runs in a read-only transaction, so it does not take row locks.
 const {rows}=await db.query(`SELECT ${columns} FROM business_receipt_settings WHERE business_id=$1`,[businessId]);
 return rows.map(row=>({collection:'businessSettings',id:businessId,version:Number(row.version),archived:false,data:{...row,version:Number(row.version),updatedAt:row.updatedAt.toISOString()}}));
}
export function splitInclusiveTax(grossMinor,snapshot){
 if(!Number.isSafeInteger(grossMinor)||grossMinor<0||!snapshot||!Number.isInteger(snapshot.vatRateBasisPoints)||!Number.isInteger(snapshot.levyRateBasisPoints)||snapshot.vatRateBasisPoints<0||snapshot.vatRateBasisPoints>10000||snapshot.levyRateBasisPoints<0||snapshot.levyRateBasisPoints>10000)invalid('Tax snapshot is invalid.');
 const vat=BigInt(snapshot.vatRateBasisPoints),levy=BigInt(snapshot.levyRateBasisPoints),denominator=10000n+vat+levy,gross=BigInt(grossMinor);
 const vatMinor=Number((gross*vat+denominator/2n)/denominator),levyMinor=Number((gross*levy+denominator/2n)/denominator),netMinor=grossMinor-vatMinor-levyMinor;
 if(netMinor<0)invalid('Tax rounding did not conserve the line total.');return {netMinor,vatMinor,levyMinor};
}
export function productTaxSnapshot(settings,taxClassId){
 if(!['A_16','B_0','C_EXEMPT'].includes(taxClassId))throw new ApiProblem(409,'TAX_CLASS_REQUIRED','Choose a supported product tax class before selling.');
 return {settingsVersion:settings.version,taxClassId,priceMode:'INCLUSIVE',vatRateBasisPoints:['B_0','C_EXEMPT'].includes(taxClassId)?0:settings.vatRateBasisPoints,levyRateBasisPoints:settings.levyRateBasisPoints};
}
const save=async({tx,command,actor,at})=>{
 if(!actor.permissions.includes('*')&&!actor.permissions.includes('business.tax.configure'))throw new ApiProblem(403,'PERMISSION_DENIED','Business tax configuration permission is required.');
 const p=command.payload,d=p.data;if(!d||typeof d!=='object'||Array.isArray(d))invalid('Business settings are malformed.');
 text(p.reason,'Configuration reason',500,true);
 const businessName=text(d.businessName,'Business name',160,true),address=text(d.address,'Address',500),contact=text(d.contact,'Contact',160),taxPin=text(d.taxPin,'Tax PIN',80),footer=text(d.footer,'Footer',500);
 if(d.paymentQrEnabled!==undefined&&typeof d.paymentQrEnabled!=='boolean')invalid('Payment QR enabled setting must be a boolean.');
 const incomingLogo=Object.hasOwn(d,'logoPngDataUrl')?image(d.logoPngDataUrl,'Business logo'):undefined;
 const incomingQr=Object.hasOwn(d,'paymentQrPngDataUrl')?image(d.paymentQrPngDataUrl,'Payment QR'):undefined;
 for(const key of ['vatRateBasisPoints','levyRateBasisPoints'])if(!Number.isInteger(d[key])||d[key]<0||d[key]>10000)invalid('Explicit tax rates must be integer basis points between 0 and 10000.');
 const baseline=command.expectedVersions[`businessSettings:${actor.businessId}`];if(!Number.isSafeInteger(baseline)||baseline<0)invalid('Reviewed business settings version is required.');
 const {rows:existingRows}=await tx.client.query('SELECT logo_png_data_url,payment_qr_png_data_url,payment_qr_enabled FROM business_receipt_settings WHERE business_id=$1 FOR UPDATE',[actor.businessId]);
 const existing=existingRows[0];
 const logoPngDataUrl=incomingLogo===undefined?(existing?.logo_png_data_url??null):incomingLogo;
 const paymentQrPngDataUrl=incomingQr===undefined?(existing?.payment_qr_png_data_url??null):incomingQr;
 const paymentQrEnabled=d.paymentQrEnabled===undefined?(existing?.payment_qr_enabled??false):d.paymentQrEnabled;
 if(paymentQrEnabled&&!paymentQrPngDataUrl)invalid('Upload a payment QR image before enabling it.');
 const version=await tx.bumpEntityVersion(actor.businessId,'businessSettings',actor.businessId,baseline);
 await tx.client.query(`INSERT INTO business_receipt_settings(business_id,business_name,address,contact,tax_pin,footer,vat_rate_basis_points,levy_rate_basis_points,logo_png_data_url,payment_qr_png_data_url,payment_qr_enabled,version,updated_by,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(business_id) DO UPDATE SET business_name=EXCLUDED.business_name,address=EXCLUDED.address,contact=EXCLUDED.contact,tax_pin=EXCLUDED.tax_pin,footer=EXCLUDED.footer,vat_rate_basis_points=EXCLUDED.vat_rate_basis_points,levy_rate_basis_points=EXCLUDED.levy_rate_basis_points,logo_png_data_url=EXCLUDED.logo_png_data_url,payment_qr_png_data_url=EXCLUDED.payment_qr_png_data_url,payment_qr_enabled=EXCLUDED.payment_qr_enabled,version=EXCLUDED.version,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at`,[actor.businessId,businessName,address,contact,taxPin,footer,d.vatRateBasisPoints,d.levyRateBasisPoints,logoPngDataUrl,paymentQrPngDataUrl,paymentQrEnabled,version,actor.staffId,at]);
 const value=(await receiptSettingsProjections(tx.client,actor.businessId))[0];return {value,records:[value]};
};
export const businessTaxCommandRegistry=new Map([['business.settings.save',{permission:'business.configure',offlinePolicy:'ONLINE_ONLY',handler:save}]]);
