import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const expected=[
  'business.csv','outlets.csv','stock_locations.csv','suppliers.csv','customers.csv','employees.csv',
  'products.csv','inventory.csv','room_types.csv','rooms.csv','rate_plans.csv','hotel_services.csv',
  'asset_categories.csv','assets.csv'
];
test('canonical import templates exist and contain no credential columns',()=>{
  for(const file of expected){
    const path=`import-templates/${file}`;
    assert.equal(existsSync(path),true,`${path} missing`);
    const first=readFileSync(path,'utf8').replace(/^\uFEFF/,'').split(/\r?\n/,1)[0].split(',').map(x=>x.trim().toLowerCase());
    assert.equal(new Set(first).size,first.length,`${file} has duplicate headers`);
    assert.ok(first.includes('external_id'),`${file} requires external_id`);
    for(const forbidden of ['pin','password','password_confirm','device_token','device_secret','access_token','publishable_key','cloud_key']){
      assert.equal(first.includes(forbidden),false,`${file} must not contain ${forbidden}`);
    }
  }
});
test('employee template keeps credentials out of migration data',()=>{
  const header=readFileSync('import-templates/employees.csv','utf8').split(/\r?\n/,1)[0];
  assert.match(header,/external_id,full_name,job_title,role/);
  assert.doesNotMatch(header,/(^|,)(pin|password)(,|$)/i);
});
