#!/usr/bin/env node
// Static matrix test only. DOES NOT replace Firebase Emulator tests.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const rules = JSON.parse(fs.readFileSync('docs/firebase/database.rules.test.candidate.phase1.json','utf8')).rules;
const roles=['ADMIN','TECNICO','REGANTE','PEON','CARGADOR'];
const isolated=['lasala-admin-audit-v1','lasala-config-infra-v1','lasala-qc-mediciones-v1','lasala-qc-fotos-sharepoint-v1'];
const auths=[null,...roles.map(role=>({uid:role,token:{appUser:'test-user',role}}))];
function evalCondition(expression, auth) {
  if(expression===false) return false;
  assert.equal(expression,'auth != null && auth.token.appUser != null','Unknown expression: '+expression);
  return auth!==null && auth.token.appUser!=null;
}
let checks=0;
for(const auth of auths){
  for(const node of isolated){
    for(const operation of ['.read','.write']){
      assert.equal(evalCondition(rules[node][operation],auth),false,`${node} ${operation}`);
      checks++;
    }
  }
}
for(const auth of auths){
  for(const operation of ['.read','.write']){
    assert.equal(evalCondition(rules['lasala-users-v1'][operation],auth),false);checks++;
    assert.equal(evalCondition(rules['lasala-roles-v1'][operation],auth),operation==='.read'&&auth!==null);checks++;
    assert.equal(evalCondition(rules['$other'][operation],auth),auth!==null);checks++;
  }
}
assert.deepEqual(Object.keys(rules).sort(),['lasala-users-v1','lasala-roles-v1',...isolated,'$other'].sort());
console.log(`PASS ${checks} checks; static matrix only — no Firebase emulator, REST, or live tokens used.`);
