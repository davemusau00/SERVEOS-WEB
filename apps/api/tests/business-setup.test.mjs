import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {normalizeBusinessSetupConfiguration} from '../src/business-setup.mjs';

const base=()=>{
 const locationId=randomUUID();
 return {
  businessName:'Kijani Cafe',category:'FOOD_AND_BEVERAGE',contact:'0712345678',address:'Nairobi',receiptName:'Kijani Cafe',taxPin:'',footer:'',
  taxTreatment:'ZERO_RATES',vatRateBasisPoints:0,levyRateBasisPoints:0,businessType:'RESTAURANT_CAFE',
  locations:[{id:locationId,name:'Main Store',code:'MAIN_STORE',type:'STORE'}],
  outlets:[{id:randomUUID(),name:'Main Restaurant',defaultStockLocationId:locationId}],
  payments:[{id:randomUUID(),name:'Cash',code:'CASH',method:'CASH',referenceRequired:false}],
  optionalSteps:{products:'LATER',staff:'LATER',rooms:'LATER'},
 };
};

test('business setup accepts explicit zero tax rates and stable default identities',()=>{
 const input=base();
 const normalized=normalizeBusinessSetupConfiguration(input);
 assert.equal(normalized.businessType,'RESTAURANT_CAFE');
 assert.equal(normalized.taxTreatment,'ZERO_RATES');
 assert.equal(normalized.vatRateBasisPoints,0);
 assert.equal(normalized.outlets[0].defaultStockLocationId,normalized.locations[0].id);
 assert.equal(normalized.payments[0].method,'CASH');
});

test('business setup rejects incomplete owner-provided M-Pesa destinations',()=>{
 const input=base();
 input.payments.push({id:randomUUID(),name:'M-Pesa Till',code:'MPESA_TILL',method:'MPESA',referenceRequired:true,mpesaMode:'TILL',mpesaNumber:''});
 assert.throws(()=>normalizeBusinessSetupConfiguration(input),/M-Pesa destination/);
});

test('business setup rejects outlets that point outside the persisted setup plan',()=>{
 const input=base();
 input.outlets[0].defaultStockLocationId=randomUUID();
 assert.throws(()=>normalizeBusinessSetupConfiguration(input),/storage location in this setup plan/);
});

test('business setup keeps an unfinished tax choice explicit and rejects duplicate payment codes',()=>{
 const missingChoice=base();missingChoice.taxTreatment=null;
 assert.equal(normalizeBusinessSetupConfiguration(missingChoice).taxTreatment,null);
 const duplicate=base();duplicate.payments.push({...duplicate.payments[0],id:randomUUID(),name:'Second cash',code:'cash'});
 assert.throws(()=>normalizeBusinessSetupConfiguration(duplicate),/Payment account codes must be unique/);
});
