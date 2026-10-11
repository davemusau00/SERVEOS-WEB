import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMigrationManifest} from '../src/migration-manifest.mjs';
test('readiness validates names and checksums while permitting later additive migrations',()=>{
 const expected=[{name:'001_initial.sql',sha256:'original'}];
 assert.equal(validateMigrationManifest(expected,expected).ready,true);
 assert.equal(validateMigrationManifest([{name:'002_other.sql',sha256:'original'}],expected).ready,false);
 assert.equal(validateMigrationManifest([{name:'001_initial.sql',sha256:'changed'}],expected).ready,false);
 assert.equal(validateMigrationManifest([{name:'001_initial.sql',sha256:null}],expected).ready,false);
 assert.equal(validateMigrationManifest([...expected,{name:'999_later.sql',sha256:'later'}],expected).ready,true);
});
