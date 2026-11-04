'use strict';
// §0.234 — static migration assumption guard; no network, no database, no writes.
// Fail closed if an operational source changes and migration design needs review.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const plan=fs.readFileSync(path.join(__dirname,'FASE2_PLAN_MIGRACION_SEGURA_RIEGO_PROPUESTAS_AVISOS_2026-11-04.md'),'utf8');
const rules=JSON.parse(fs.readFileSync(path.join(__dirname,'database.rules.test.candidate.phase2-avisos-push.json'),'utf8')).rules;
const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'avisos-event-catalog-v2.json'),'utf8'));
const migration=fs.readFileSync(path.join(__dirname,'prototype-avisos-push-migration-v2.cjs'),'utf8');
test('irrigation v2 is a distinct per-greenhouse JSON-string shard with ETag protection',()=>{
 assert.ok(html.includes("const RIEGO_V2_PREFIX = 'lasala-riego-v2-'"));
 assert.ok(html.includes('function riegoV2Key(invId)'));
 assert.ok(html.includes('data:JSON.parse(val)'));
 assert.ok(html.includes('const cloud = existe ? JSON.parse(val) : {};'));
 assert.ok(html.includes('body:JSON.stringify(JSON.stringify(cloud))'));
 assert.ok(html.includes("headers:{'Content-Type':'application/json','if-match':etag}"));
});
test('irrigation index is distinct and may not be assumed complete or authoritative',()=>{
 assert.ok(html.includes("const RIEGO_V2_INDEX_KEY = 'lasala-riego-v2-index'"));
 assert.ok(html.includes('async function actualizarRiegoV2IndexConInv('));
 assert.ok(html.includes('if(!nodo.exists && ids.includes(invId))'));
});
test('offline queue still lives in browser localStorage and needs a cutover gate',()=>{
 assert.ok(html.includes("const RIEGO_OFFLINE_KEY = 'lasala-riego-offline-v1'"));
 assert.ok(html.includes('localStorage.getItem(RIEGO_OFFLINE_KEY)'));
 assert.ok(html.includes('localStorage.setItem(RIEGO_OFFLINE_KEY'));
});
test('proposals and irrigation write independently',()=>{
 assert.ok(html.includes("const PROPUESTAS_RIEGO_KEY = 'lasala-propuestas-riego-v1'"));
 assert.ok(html.includes('async function persistPropuestasRiegoData('));
 assert.ok(html.includes('const okRiego = await aplicarPropuestaRiego(p, p.textoPropuesto)'));
 assert.ok(html.includes('const okPersist = await persistPropuestasRiegoData()'));
});
test('legacy alert retention and push-after-write remain known migration risks',()=>{
 assert.ok(html.includes("const AVISOS_USUARIO_KEY = 'lasala-avisos-usuario-v1'"));
 assert.ok(html.includes('cloud[target]=lista.slice(-30)'));
 assert.ok(html.includes('}catch(e){}\n  enviarPushA(target,tituloFinal,mensaje);'));
});
test('phase 2 candidate roots deny all direct client access',()=>{
 for(const key of ['lasala-avisos-v2','lasala-push-outbox-v2',
  'lasala-alert-event-sources-v2','lasala-invernaderos-catalog-v2',
  'lasala-event-permissions-v2','lasala-alert-event-ledger-v2',
  'lasala-riego-event-aggregate-demo-v2']){
  assert.deepEqual(rules[key],{'.read':false,'.write':false},key);
 }
 assert.equal(typeof rules.$other,'.'==='ignore'?'ignore':'object');
});
test('nine event families are still only provisional and require separate business gates',()=>{
 assert.equal(catalog.events.length,9);
 assert.equal(catalog.status,'PROVISIONAL_DESIGN_ONLY');
 assert.ok(catalog.events.every(e=>e.status==='PROVISIONAL'));
});
test('legacy migration implementation covers only alerts and push, default dry-run',()=>{
 assert.ok(migration.includes("alerts:'lasala-avisos-usuario-v1'"));
 assert.ok(migration.includes("push:'lasala-push-subs-v1'"));
 assert.ok(migration.includes('dryRun=true'));
 assert.ok(migration.includes('requiresCutoverReconciliation:true'));
 assert.ok(!migration.includes("lasala-riego-v2-"));
});
test('plan explicitly requires no parallel authoritative writers and gated rollback',()=>{
 for(const phrase of ['sin migración ni acceso a datos reales',
   'dos escritores autoritativos', 'reglas privadas', 'ETag',
   'después de recibir escrituras v3', 'NO', 'solo lectura',
   'Conciliación', 'no reenviar Push']){
  assert.ok(plan.toLowerCase().includes(phrase.toLowerCase()),phrase);
 }
});
