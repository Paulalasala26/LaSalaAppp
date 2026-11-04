'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {projectLegacy,dryRunMigration}=require('./prototype-migration-dryrun-v3.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
const fixture=()=>({
 index:JSON.stringify(['INV_1','INV_2']),
 shards:{
  INV_1:JSON.stringify({'2026-11-04':{
   '1':{texto:'30 MIN',revisadoPorVigueras:true},'2':'?'}}),
  INV_2:JSON.stringify({'2026-11-04':{'3':'AGUA', '4':{texto:'45 MIN'}}})
 },
 proposals:JSON.stringify([
  {id:'prop_1',invId:'INV_1',estado:'pendiente',propuestoPor:'FRAN',
   textoActual:'?',textoPropuesto:'30 PREVICUR',calles:[2]},
  {id:'prop_2',invId:'INV_2',estado:'aceptada',propuestoPor:'DENNIS',
   textoActual:'?',textoPropuesto:'45 MIN'}]),
 alerts:JSON.stringify({
  VIGUERAS:[{id:'aviso_1',titulo:'Propuesta',mensaje:'Ejemplo sintético',leido:false}],
  FRAN:[{id:'aviso_2',titulo:'Respuesta',mensaje:'Ejemplo sintético',leido:true}]
 }),
 etags:{index:'"index-1"',proposals:'"p-1"',alerts:'"a-1"',
   shards:{INV_1:'"inv-1"',INV_2:'"inv-2"'}}
});
const report=(s,c=projectLegacy(s).projected,opts={})=>
 dryRunMigration({snapshot:s,candidate:c,...opts});
const code=(r,c)=>r.issues.some(x=>x.code===c);
test('perfect synthetic parity includes exact counts and never allows cutover',()=>{
 const s=fixture(),r=report(s);
 assert.equal(r.parity,'MATCH');
 assert.equal(r.differences,0);
 assert.equal(r.sourceCounts.indexInv,2);
 assert.equal(r.sourceCounts.validShards,2);
 assert.equal(r.sourceCounts.cells,4);
 assert.equal(r.sourceCounts.proposals,2);
 assert.equal(r.sourceCounts.recipients,2);
 assert.equal(r.sourceCounts.alerts,2);
 assert.equal(r.eligibleForCutover,false);
 assert.equal(r.dryRun,true);
 assert.equal(r.writes,0);assert.equal(r.pushSent,0);
});
test('output manifests contain only hashes/counts, never raw message, text or push endpoint',()=>{
 const s=fixture(),r=report(s);
 const printed=JSON.stringify(r);
 for(const secret of ['Ejemplo sintético','30 PREVICUR','45 MIN','FRAN','DENNIS',
  'VIGUERAS','prop_1','aviso_1'])assert.ok(!printed.includes(secret),secret);
});
test('canonical hash is stable under object insertion order differences',()=>{
 const s=fixture(),c=projectLegacy(s).projected;
 const reversed=JSON.parse(JSON.stringify({
  alertsByUser:Object.fromEntries(Object.entries(c.alertsByUser).reverse()),
  irrigationByInv:Object.fromEntries(Object.entries(c.irrigationByInv).reverse()),
  proposalsById:Object.fromEntries(Object.entries(c.proposalsById).reverse())
 }));
 const r=report(s,reversed);
 assert.equal(r.parity,'MATCH');
 assert.deepEqual(r.sourceDigests,r.candidateDigests);
});
test('repeated dry-run is deterministic and does not modify the fixture',()=>{
 const s=fixture(),c=projectLegacy(s).projected;
 const before=JSON.stringify({s,c});
 const first=report(s,c),second=report(s,c);
 assert.deepEqual(first,second);
 assert.equal(JSON.stringify({s,c}),before);
});
test('rechecked ETags matching synthetic snapshot still require production gating',()=>{
 const s=fixture(),r=report(s,projectLegacy(s).projected,{recheckEtags:clone(s.etags)});
 assert.equal(r.parity,'MATCH');
 assert.equal(r.requiresFreshSourceEtagCheck,true);
 assert.equal(r.eligibleForCutover,false);
});
test('modified snapshot ETags are detected as a blocking race',()=>{
 const s=fixture(),later=clone(s.etags);
 later.shards.INV_1='"new-etag"';
 const r=report(s,projectLegacy(s).projected,{recheckEtags:later});
 assert.equal(r.parity,'BLOCKED');assert.ok(code(r,'SOURCE_CHANGED_SINCE_SNAPSHOT'));
});
test('invalid source ETag metadata blocks even when candidate has equal payload',()=>{
 const s=fixture();delete s.etags.shards.INV_2;
 const r=report(s);
 assert.ok(code(r,'SOURCE_ETAG_MISSING'));
});
test('unindexed shard is flagged, not silently adopted as authorized',()=>{
 const s=fixture();s.index=JSON.stringify(['INV_1']);
 const r=report(s);
 assert.ok(code(r,'ORPHAN_SHARD'));
});
test('index entry lacking a corresponding shard blocks dry-run',()=>{
 const s=fixture();delete s.shards.INV_2;
 assert.ok(code(report(s),'MISSING_SHARD'));
});
test('index entry with null shard is not treated as empty grid',()=>{
 const s=fixture();s.shards.INV_2=null;
 assert.ok(code(report(s),'MISSING_SHARD'));
});
test('duplicate index INV IDs are blocked',()=>{
 const s=fixture();s.index=JSON.stringify(['INV_1','INV_1','INV_2']);
 assert.ok(code(report(s),'DUPLICATE_INV_ID'));
});
test('invalid invernadero ID is never used as a target object key',()=>{
 const s=fixture();s.index=JSON.stringify(['__proto__','INV_1','INV_2']);
 assert.ok(code(report(s),'INVALID_INV_ID'));
});
test('malformed JSON string in irrigation shard fails closed',()=>{
 const s=fixture();s.shards.INV_2='{"bad":';
 assert.ok(code(report(s),'SOURCE_MALFORMED_JSON'));
});
test('non-string Firebase shard is rejected rather than interpreted as v3 data',()=>{
 const s=fixture();s.shards.INV_2={'2026-11-04':{'2':'AGUA'}};
 assert.ok(code(report(s),'SOURCE_NOT_JSON_STRING'));
});
test('wrong shape of irrigation shard is blocked',()=>{
 const s=fixture();s.shards.INV_2=JSON.stringify([{date:'2026-11-04'}]);
 assert.ok(code(report(s),'SOURCE_INVALID_SHAPE'));
});
test('invalid day shape and lane key are reported',()=>{
 const s=fixture();s.shards.INV_1=JSON.stringify({'invalid-day':{'1':'AGUA'}});
 assert.ok(code(report(s),'INVALID_RIEGO_DAY'));
 const another=fixture();another.shards.INV_2=JSON.stringify({'2026-11-04':{'__proto__':'X','-bad key-':'X'}});
 assert.ok(code(report(another),'INVALID_RIEGO_LANE'));
});
test('source proposal ID reused is blocked',()=>{
 const s=fixture(),items=JSON.parse(s.proposals);
 items.push({...items[0]});
 s.proposals=JSON.stringify(items);
 assert.ok(code(report(s),'DUPLICATE_PROPOSAL_ID'));
});
test('invalid proposal status and missing author are detected',()=>{
 const s=fixture(),items=JSON.parse(s.proposals);
 items[0].estado='en-proceso';items[1].propuestoPor='';
 s.proposals=JSON.stringify(items);
 const r=report(s);assert.ok(code(r,'INVALID_PROPOSAL'));
});
test('proposal referring to unknown INV is blocked',()=>{
 const s=fixture(),items=JSON.parse(s.proposals);
 items[0].invId='INV_300';
 s.proposals=JSON.stringify(items);
 assert.ok(code(report(s),'PROPOSAL_INV_NOT_INDEXED'));
});
test('duplicate notices per recipient are reported without recreating history',()=>{
 const s=fixture(),x=JSON.parse(s.alerts);
 x.FRAN.push({...x.FRAN[0]});
 s.alerts=JSON.stringify(x);
 assert.ok(code(report(s),'DUPLICATE_ALERT_ID'));
});
test('more than 30 saved notices in a bucket is anomalous, not assumed a complete archive',()=>{
 const s=fixture(),x=JSON.parse(s.alerts);
 x.FRAN=Array.from({length:31},(_,i)=>({id:'alert_'+i}));
 s.alerts=JSON.stringify(x);
 assert.ok(code(report(s),'LEGACY_ALERT_LIMIT_EXCEEDED'));
});
test('invalid alert or recipient bucket fails closed',()=>{
 const s=fixture(),x=JSON.parse(s.alerts);
 x.FRAN=[{noId:true}];x.BAD='not-an-array';
 s.alerts=JSON.stringify(x);
 const r=report(s);
 assert.ok(code(r,'INVALID_ALERT'));assert.ok(code(r,'INVALID_ALERT_BUCKET'));
});
test('missing target riego INV is reported by hash',()=>{
 const s=fixture(),c=projectLegacy(s).projected;
 delete c.irrigationByInv.INV_2;
 const r=report(s,c);
 assert.ok(code(r,'TARGET_ITEM_MISSING'));
 assert.ok(!JSON.stringify(r).includes('INV_2'));
});
test('unexpected target riego INV is reported',()=>{
 const s=fixture(),c=projectLegacy(s).projected;
 c.irrigationByInv.INV_99={'2026-11-04':{'1':'EXTRA'}};
 assert.ok(code(report(s,c),'TARGET_ITEM_EXTRA'));
});
test('changed cell, proposal content and read flag each report a separate mismatch',()=>{
 const s=fixture(),c=projectLegacy(s).projected;
 c.irrigationByInv.INV_1['2026-11-04']['1'].texto='OTHER';
 c.proposalsById.prop_1.textoPropuesto='OTHER';
 c.alertsByUser.FRAN[0].leido=false;
 const r=report(s,c);
 assert.equal(r.issues.filter(x=>x.code==='TARGET_VALUE_MISMATCH').length,3);
});
test('missing proposal and an unexpected alert recipient are blocked',()=>{
 const s=fixture(),c=projectLegacy(s).projected;
 delete c.proposalsById.prop_2;
 c.alertsByUser.UNKNOWN=[{id:'not_imported'}];
 const r=report(s,c);
 assert.ok(code(r,'TARGET_ITEM_MISSING'));assert.ok(code(r,'TARGET_ITEM_EXTRA'));
});
test('candidate domain with wrong type cannot be declared matching',()=>{
 const s=fixture(),c=projectLegacy(s).projected;
 c.proposalsById=[];
 assert.ok(code(report(s,c),'TARGET_DOMAIN_INVALID'));
});
test('malformed source proposals and notices are individually detected',()=>{
 const s=fixture();s.proposals='{invalid';s.alerts=JSON.stringify([]);
 const r=report(s);assert.ok(code(r,'SOURCE_MALFORMED_JSON'));
 assert.ok(code(r,'SOURCE_INVALID_SHAPE'));
});
test('no synthetic approval can turn a dry-run report into migration authorization',()=>{
 const s=fixture(),c=projectLegacy(s).projected;
 const r=dryRunMigration({snapshot:s,candidate:c,approved:true,execute:true,
   recheckEtags:s.etags});
 assert.equal(r.eligibleForCutover,false);assert.equal(r.writes,0);
 assert.equal(r.pushSent,0);assert.equal(r.requiresBackofficeApproval,true);
});
