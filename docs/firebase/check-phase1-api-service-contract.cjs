'use strict';
// Static service-auth regression contract. Does not call Firebase or APIs.
const fs=require('node:fs'),assert=require('node:assert/strict');
const checks=[
 ['api/admin-audit.js','lasala-admin-audit-v1'],
 ['api/admin-catalog.js','lasala-config-infra-v1'],
 ['api/admin-qc-mediciones.js','lasala-qc-mediciones-v1'],
 ['api/qc-fotos-sharepoint.js','lasala-qc-fotos-sharepoint-v1']
];
let passed=0;
for(const [path,key] of checks){
 const source=fs.readFileSync(path,'utf8');
 assert.ok(source.includes(key),path+': missing protected key');passed++;
 assert.match(source,/serviceAccessToken\s*\(\s*serviceAccount\s*\(\s*\)\s*\)/,path+': service token acquisition missing');passed++;
 assert.match(source,/verifyFirebaseIdToken\s*\(/,path+': caller auth verification missing');passed++;
}
const users=fs.readFileSync('api/admin-users.js','utf8');
assert.match(users,/https:\/\/www\.googleapis\.com\/auth\/firebase\.database/);passed++;
assert.match(users,/https:\/\/oauth2\.googleapis\.com\/token/);passed++;
const rules=JSON.parse(fs.readFileSync('docs/firebase/database.rules.test.candidate.phase1.json','utf8')).rules;
for(const [,key] of checks){assert.equal(rules[key]['.read'],false);assert.equal(rules[key]['.write'],false);passed+=2}
console.log('PASS '+passed+' static assertions; no runtime/API/Firebase requests made.');
