'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createAuditCronRouter}=require('./prototype-admin-audit-cron-router.cjs');
const SECRET='test-secret-valid-123456789';
function fixture(overrides={}){
  const calls={audit:0,service:0,prune:0,sa:0,logs:[]};
  const options={
    auditHandler:async(req,res)=>{
      calls.audit++;
      // Simulates existing ADMIN-only auth; the prototype does NOT replace it.
      return req.headers?.authorization==='Bearer VALID_ADMIN_TOKEN'?
        res.status(200).json({events:[{id:'historic-test'}]}):
        res.status(401).json({error:'UNAUTHORIZED'});
    },
    pruneExpiredAudit:async()=>{calls.prune++;return {deleted:2,candidates:3,remaining:1}},
    serviceAccount:()=>{calls.sa++;return {project_id:'fake-only'}},
    serviceAccessToken:async()=>{calls.service++;return 'fake-service-token'},
    getCronSecret:()=>SECRET,
    logger:{info:(...args)=>calls.logs.push(['info',...args]),error:(...args)=>calls.logs.push(['error',...args])},
    ...overrides
  };
  const handler=createAuditCronRouter(options);
  return {calls,handler};
}
function req({method='GET',job,auth,query,headers}={}){
  return {method,query:query??(job===undefined?{}:{job}),headers:headers??(auth?{authorization:auth}:{})};
}
function res(){
  return {headers:{},statusCode:null,body:null,
    setHeader(k,v){this.headers[k]=v;return this},
    status(v){this.statusCode=v;return this},
    json(v){this.body=v;return this}
  };
}
async function call(h,input){const output=res();await h(req(input),output);return output}
test('normal ADMIN GET is delegated exactly to existing audit handler',async()=>{
  const {calls,handler}=fixture();
  const out=await call(handler,{auth:'Bearer VALID_ADMIN_TOKEN'});
  assert.equal(out.statusCode,200);assert.equal(out.body.events[0].id,'historic-test');
  assert.deepEqual([calls.audit,calls.prune,calls.service],[1,0,0]);
});
test('missing ADMIN credentials on normal route cannot invoke prune',async()=>{
  const {calls,handler}=fixture();
  const out=await call(handler);
  assert.equal(out.statusCode,401);
  assert.deepEqual([calls.audit,calls.prune],[1,0]);
});
test('cron secret is never a valid admin read token',async()=>{
  const {calls,handler}=fixture();
  const out=await call(handler,{auth:'Bearer '+SECRET});
  assert.equal(out.statusCode,401);assert.deepEqual([calls.audit,calls.prune],[1,0]);
});
test('valid cron request prunes exactly once using a service token',async()=>{
  const {calls,handler}=fixture();
  const out=await call(handler,{job:'prune',auth:'Bearer '+SECRET});
  assert.equal(out.statusCode,200);
  assert.deepEqual(out.body,{ok:true,deleted:2,candidates:3,remaining:1,retention:'1 calendar year'});
  assert.deepEqual([calls.audit,calls.service,calls.sa,calls.prune],[0,1,1,1]);
});
test('ADMIN token cannot invoke cron and may not fall through to admin handler',async()=>{
  const {calls,handler}=fixture();
  const out=await call(handler,{job:'prune',auth:'Bearer VALID_ADMIN_TOKEN'});
  assert.equal(out.statusCode,401);
  assert.deepEqual([calls.audit,calls.service,calls.prune],[0,0,0]);
});
test('anonymous cron is denied without accessing service or database',async()=>{
  const {calls,handler}=fixture();
  const out=await call(handler,{job:'prune'});
  assert.equal(out.statusCode,401);
  assert.deepEqual([calls.audit,calls.service,calls.prune],[0,0,0]);
});
test('wrong cron secret is denied without side effects',async()=>{
  const {calls,handler}=fixture();
  const out=await call(handler,{job:'prune',auth:'Bearer wrong'});
  assert.equal(out.statusCode,401);
  assert.deepEqual([calls.audit,calls.service,calls.prune],[0,0,0]);
});
test('missing or too short cron secret fails closed',async()=>{
  for(const secret of [undefined,'', '1234567890']){
    const {calls,handler}=fixture({getCronSecret:()=>secret});
    const out=await call(handler,{job:'prune',auth:'Bearer '+(secret||'')});
    assert.equal(out.statusCode,503);
    assert.equal(out.body.error,'CRON_NOT_CONFIGURED');
    assert.equal(calls.prune,0);
  }
});
test('POST to audit or cron returns 405 before any auth',async()=>{
  for(const q of [{}, {job:'prune'}]){
    const {calls,handler}=fixture();
    const out=await call(handler,{method:'POST',query:q,auth:'Bearer '+SECRET});
    assert.equal(out.statusCode,405);assert.equal(out.headers.Allow,'GET');
    assert.deepEqual([calls.audit,calls.prune],[0,0]);
  }
});
test('unknown job cannot turn into a normal audit read',async()=>{
  const {calls,handler}=fixture();
  const out=await call(handler,{job:'unknown',auth:'Bearer VALID_ADMIN_TOKEN'});
  assert.equal(out.statusCode,400);
  assert.deepEqual([calls.audit,calls.prune],[0,0]);
});
test('array-valued job rejected, even if it contains prune',async()=>{
  const {calls,handler}=fixture();
  const out=await call(handler,{query:{job:['prune','prune']},auth:'Bearer '+SECRET});
  assert.equal(out.statusCode,400);
  assert.equal(calls.prune,0);
});
test('unexpected query parameters rejected on cron',async()=>{
  const {calls,handler}=fixture();
  const out=await call(handler,{query:{job:'prune',uid:'ADMIN'},auth:'Bearer '+SECRET});
  assert.equal(out.statusCode,400);assert.equal(calls.prune,0);
});
test('blank job parameter never delegates to admin',async()=>{
  const {calls,handler}=fixture();
  const out=await call(handler,{query:{job:''},auth:'Bearer VALID_ADMIN_TOKEN'});
  assert.equal(out.statusCode,400);assert.equal(calls.audit,0);
});
test('bad query shape fails closed',async()=>{
  const {calls,handler}=fixture();
  const out=await call(handler,{query:['prune'],auth:'Bearer '+SECRET});
  assert.equal(out.statusCode,400);assert.equal(calls.prune,0);
});
test('service account/token exception yields 503 without leaking details',async()=>{
  const {calls,handler}=fixture({serviceAccessToken:async()=>{throw Error('sensitive fake token')}});
  const out=await call(handler,{job:'prune',auth:'Bearer '+SECRET});
  assert.equal(out.statusCode,503);assert.deepEqual(out.body,{error:'PRUNE_FAILED'});
  assert.equal(calls.prune,0);
  assert.equal(JSON.stringify(calls.logs).includes('sensitive fake token'),false);
});
test('prune exception yields 503 and does not expose database details',async()=>{
  const {calls,handler}=fixture({pruneExpiredAudit:async()=>{calls.prune++;throw Error('sensitive Firebase document')}});
  const out=await call(handler,{job:'prune',auth:'Bearer '+SECRET});
  assert.equal(out.statusCode,503);assert.deepEqual(out.body,{error:'PRUNE_FAILED'});
  assert.equal(calls.prune,1);
  assert.equal(JSON.stringify(calls.logs).includes('sensitive Firebase document'),false);
});
test('missing required injected functions is rejected before handling requests',()=>{
  assert.throws(()=>createAuditCronRouter({auditHandler:()=>{}}),/MISSING_DEPENDENCY/);
});
test('read and cron responses carry no-store and nosniff headers',async()=>{
  const {handler}=fixture();
  for(const input of [{auth:'Bearer VALID_ADMIN_TOKEN'}, {job:'prune',auth:'Bearer '+SECRET}]){
    const out=await call(handler,input);
    assert.equal(out.headers['Cache-Control'],'no-store');
    assert.equal(out.headers['X-Content-Type-Options'],'nosniff');
  }
});
test('daily 04:00 UTC schedule retained in current vercel config',()=>{
  const cfg=JSON.parse(fs.readFileSync('vercel.json','utf8'));
  assert.deepEqual(cfg.crons,[{path:'/api/admin-audit-prune',schedule:'0 4 * * *'}]);
});
test('current administrative handler and prune wrapper remain unmodified source',()=>{
  const main=fs.readFileSync('api/admin-audit.js','utf8');
  const prune=fs.readFileSync('api/admin-audit-prune.js','utf8');
  assert.match(main,/module\.exports\.pruneExpiredAudit=pruneExpiredAudit/);
  assert.match(main,/async function handler\(req,res\)/);
  assert.match(prune,/crypto\.timingSafeEqual/);
  assert.match(prune,/require\('\.\/admin-audit'\)/);
});
