'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {uidForName}=require('./prototype-avisos-push-v2.cjs');
const {ROOT,SCHEMA,prepareEnvelope,createDemoAtomicEventLedger}=
 require('./prototype-atomic-event-ledger-v2.cjs');
const NOW=new Date('2026-11-04T14:00:00Z');
const ACTOR=uidForName('FRAN'),SUPERVISOR=uidForName('VIGUERAS'),DENNIS=uidForName('DENNIS');
const copy=x=>JSON.parse(JSON.stringify(x));
function fixture(kind='riego_propuesta_creada'){
 const source={id:'prop_1',kind,revision:1,actorUid:ACTOR,
   serverVerified:true,sourceAuthority:'server-committed-v1',
   persisted:true,transitionCommitted:true,committedAtUtc:'2026-11-04T13:45:00Z',
   businessProofDigest:'a'.repeat(64)};
 const plan={outboxRequired:true,actorUid:ACTOR,recipientUids:[SUPERVISOR],
   idempotencyKey:kind+':prop_1:1'};
 return {source,plan};
}
function mock({failWrite=false}={}){
 const data=new Map();let writes=0,reads=0;
 const transport={
  async insertIfMissing(path,doc){
   writes++;
   if(failWrite)throw Object.assign(new Error('WRITE_FAILED'),{code:'WRITE_FAILED'});
   await Promise.resolve();
   const key=path.join('/');
   if(data.has(key))return false;
   data.set(key,copy(doc));return true;
  },
  async retrieve(path){
   reads++;
   return {value:data.has(path.join('/'))?copy(data.get(path.join('/'))):null};
  }
 };
 return {data,transport,get writes(){return writes},get reads(){return reads}};
}
const service=transport=>createDemoAtomicEventLedger({transport,now:()=>NOW});
test('one CAS insert persists source and complete outbox together',async()=>{
 const db=mock(),ledger=service(db.transport),f=fixture();
 const out=await ledger.stage(f.plan,f.source),doc=await ledger.get(out.eventId);
 assert.equal(out.result,'staged');
 assert.equal(doc.schema,SCHEMA);
 assert.equal(doc.version,1);
 assert.equal(doc.source.businessProofDigest,'a'.repeat(64));
 assert.equal(doc.source.actorUid,ACTOR);
 assert.equal(doc.outbox.status,'pending');
 assert.deepEqual(Object.keys(doc.outbox.deliveries),[SUPERVISOR]);
 assert.equal(doc.outbox.deliveries[SUPERVISOR].attempts,0);
 assert.equal(db.data.size,1);
 assert.equal(db.writes,1);
});
test('retry returns already_staged without second delivery',async()=>{
 const db=mock(),ledger=service(db.transport),f=fixture();
 const first=await ledger.stage(f.plan,f.source);
 const second=await ledger.stage(f.plan,f.source);
 assert.deepEqual(second,{...first,result:'already_staged'});
 assert.equal(db.data.size,1);
 assert.equal(Object.keys((await ledger.get(first.eventId)).outbox.deliveries).length,1);
});
test('two concurrent callers create exactly one event and one outbox',async()=>{
 const db=mock(),ledger=service(db.transport),f=fixture();
 const outcomes=await Promise.all(Array.from({length:12},()=>ledger.stage(f.plan,f.source)));
 assert.equal(outcomes.filter(x=>x.result==='staged').length,1);
 assert.equal(outcomes.filter(x=>x.result==='already_staged').length,11);
 assert.equal(db.data.size,1);
});
test('conflicting payload at identical event revision is rejected',async()=>{
 const db=mock(),ledger=service(db.transport),f=fixture();
 await ledger.stage(f.plan,f.source);
 const changed={...f.source,businessProofDigest:'b'.repeat(64)};
 await assert.rejects(ledger.stage(f.plan,changed),{code:'EVENT_KEY_CONFLICT'});
 assert.equal(db.data.size,1);
});
test('conflicting recipient at same key is rejected',async()=>{
 const db=mock(),ledger=service(db.transport),f=fixture();
 await ledger.stage(f.plan,f.source);
 await assert.rejects(ledger.stage({...f.plan,recipientUids:[DENNIS]},f.source),{code:'EVENT_KEY_CONFLICT'});
});
test('new source revision yields a distinct event identity',async()=>{
 const db=mock(),ledger=service(db.transport),f=fixture();
 const first=await ledger.stage(f.plan,f.source);
 f.source.revision=2;f.plan.idempotencyKey='riego_propuesta_creada:prop_1:2';
 const second=await ledger.stage(f.plan,f.source);
 assert.notEqual(first.eventId,second.eventId);
 assert.equal(db.data.size,2);
});
test('two recipients are staged in one atomic envelope',async()=>{
 const db=mock(),ledger=service(db.transport),f=fixture('riego_hojas_corregidas');
 f.plan.recipientUids=[DENNIS,SUPERVISOR];
 const x=await ledger.stage(f.plan,f.source);
 const doc=await ledger.get(x.eventId);
 assert.equal(Object.keys(doc.outbox.deliveries).length,2);
 assert.equal(doc.outbox.status,'pending');
});
test('storage failure propagates: no alert, no push, no partial document',async()=>{
 const db=mock({failWrite:true}),ledger=service(db.transport),f=fixture();
 await assert.rejects(ledger.stage(f.plan,f.source),{code:'WRITE_FAILED'});
 assert.equal(db.data.size,0);assert.equal(db.writes,1);
});
test('do not accept caller-supplied target, title or content in plan',()=>{
 const f=fixture();
 assert.throws(()=>prepareEnvelope({...f.plan,actorUid:'VIGUERAS'},f.source,NOW),
   {code:'INVALID_AUTHORIZED_PLAN'});
 assert.throws(()=>prepareEnvelope({...f.plan,recipientUids:['TARGET_FREE_TEXT']},f.source,NOW),
   {code:'INVALID_AUTHORIZED_PLAN'});
});
test('reject forged proof, uncommitted source, invalid revision and mismatched actor',()=>{
 const f=fixture();
 for(const patch of [{serverVerified:false},{transitionCommitted:false},
  {sourceAuthority:'browser'},{revision:0},{actorUid:DENNIS},
  {businessProofDigest:'not-a-proof'}]){
  assert.throws(()=>prepareEnvelope(f.plan,{...f.source,...patch},NOW));
 }
});
test('a changed source cannot be staged with old authorization key',()=>{
 const f=fixture();
 assert.throws(()=>prepareEnvelope({...f.plan,idempotencyKey:'wrong'},f.source,NOW),
   {code:'PLAN_SOURCE_MISMATCH'});
});
test('duplicate or empty recipients and invalid kind are rejected',()=>{
 const f=fixture();
 for(const r of [[],[SUPERVISOR,SUPERVISOR],[SUPERVISOR,SUPERVISOR,DENNIS]]){
  assert.throws(()=>prepareEnvelope({...f.plan,recipientUids:r},f.source,NOW),
   {code:'INVALID_AUTHORIZED_PLAN'});
 }
 assert.throws(()=>prepareEnvelope(f.plan,{...f.source,kind:'TASK_PUSH'},NOW),
  {code:'UNVERIFIED_BUSINESS_SOURCE'});
});
test('invalid timestamps and future source commits are rejected',()=>{
 const f=fixture();
 assert.throws(()=>prepareEnvelope(f.plan,{...f.source,committedAtUtc:'2026-11-04 13:45'},NOW),
   {code:'INVALID_SOURCE_TIMESTAMP'});
 assert.throws(()=>prepareEnvelope(f.plan,{...f.source,committedAtUtc:'2027-01-01T13:45:00Z'},NOW),
   {code:'INVALID_SOURCE_TIMESTAMP'});
});
test('reject tampered existing record rather than trusting its fingerprint',async()=>{
 const db=mock(),ledger=service(db.transport),f=fixture();
 const first=await ledger.stage(f.plan,f.source);
 db.data.get(ROOT+'/'+first.eventId).source.businessProofDigest='b'.repeat(64);
 await assert.rejects(ledger.stage(f.plan,f.source),{code:'EVENT_KEY_CONFLICT'});
});
test('ledger is read-only with respect to delivery; does not dispatch anything',async()=>{
 const db=mock(),ledger=service(db.transport),f=fixture();
 const x=await ledger.stage(f.plan,f.source);
 const row=await ledger.get(x.eventId);
 assert.equal(row.outbox.status,'pending');
 assert.equal(row.outbox.deliveries[SUPERVISOR].status,'pending');
 assert.equal(typeof ledger.sendPush,'undefined');
 assert.equal(typeof ledger.markDelivered,'undefined');
});
