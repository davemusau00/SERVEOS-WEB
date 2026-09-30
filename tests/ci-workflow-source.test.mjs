import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('CI names every active engine and uploads failure evidence',()=>{
  const workflow=readFileSync('.github/workflows/ci.yml','utf8');
  for(const job of ['frontend:','native-domain:','cloud-protocol-base:','cloud-protocol-v2:','desktop-shell:'])assert.match(workflow,new RegExp(`\\n  ${job}`));
  for(const command of ['npm run test:cloud:base','npm run test:cloud:v2','cargo test --locked --manifest-path native-tests/Cargo.toml','npm run check:desktop','npm run test:desktop','npm run test:browser:production'])assert.match(workflow,new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.ok((workflow.match(/name: Upload [^\n]+ evidence/g)||[]).length>=5);
  assert.ok((workflow.match(/if: always\(\)/g)||[]).length>=5);
});
