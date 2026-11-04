'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {uidForName}=require('./prototype-avisos-push-v2.cjs');
const {ROOT,SCHEMA,createDemoBusinessEventTransaction}=
 require('./prototype-business-event-transaction-v2.cjs');
const FRAN=uidForName('FRAN'),VIGUERAS=uidForName('VIGUERAS'),DENNIS=uidForName('DENNIS');
const deep=x=>JSON.parse(JSON.stringify(x));
const seed=()=>({schema:SCHEMA,invId:'INV_1',version:1,
 grid:{'2026-11-04':{'1':{texto:'30 MIN',revisadoPorVigueras:true,other:'retained'},
                     '2':{texto:'40 MIN',revisadoPorVigueras:true}}},
 events:{},commands:{}});
function harness({failure=null,initial=seed(),maxAttempts=5}={}){
 const cells=new Map([[ROOT+'/INV_1',deep(initial)]]);
 let writes=0,reads=0,conflicts=0;
 const command={id:'CMD_1',kind:'riego_validado_modificado',invId:'INV_1',
   day:'2026-11-04',lane:'1',expectedText:'30 MIN',nextText:'35 MIN',actorUid:FRAN};
 const permit={authorized:true,businessApproved:true,actorUid:FRAN,
  authorizedInvIds:['INV_1'],recipientUids:[VIGUERAS]};
 const transport={
  async retrieve(path,withEtag=false){
   reads++;
   const row=cells.get(path.join('/'))??null;
   return {value:deep(row),etag:withEtag?'"'+(row?.version||0)+'"':null};
  },
  async compareAndSwap(path,version,next){
   writes++;await Promise.resolve();
   const key=path.join('/'),current=cells.get(key);
   if(failure==='always-conflict'){conflicts++;return false;}
   if(failure==='before-commit')throw Object.assign(new Error('NO_WRITE'),{code:'NO_WRITE'});
   if(current?.version!==version){conflicts++;return false;}
   cells.set(key,deep(next));
   if(failure==='after-commit')throw Object.assign(new Error('RESPONSE_LOST'),{code:'RESPONSE_LOST'});
   return true;
  }
 };
 const make=(load=async()=>command,authorize=async()=>permit)=>
  createDemoBusinessEventTransaction({transport,loadTrustedCommand:load,
    authorizeTrustedCommand:authorize,maxAttempts,
    now:()=>new Date('2026-11-04T14:00:00Z')});
 return {command,permit,cells,transport,make,
  get state(){return deep(cells.get(ROOT+'/INV_1'))},
  get reads(){return reads},get writes(){return writes},get conflicts(){return conflicts}};
}
test('atomic single CAS changes validated cell, event evidence and pending delivery together',async()=>{
 const h=harness(),out=await h.make().execute('CMD_1');
 assert.equal(out.status,'committed');
 const s=h.state, ev=s.events[out.eventId];
 assert.equal(s.version,2);
 assert.equal(s.grid['2026-11-04']['1'].texto,'35 MIN');
 assert.equal(s.grid['2026-11-04']['1'].revisadoPorVigueras,false);
 assert.equal(s.grid['2026-11-04']['1'].other,'retained');
 assert.equal(s.grid['2026-11-04']['2'].texto,'40 MIN');
 assert.equal(Object.keys(s.events).length,1);
 assert.equal(Object.keys(s.commands).length,1);
 assert.equal(ev.source.actorUid,FRAN);
 assert.equal(ev.outbox.status,'pending');
 assert.deepEqual(Object.keys(ev.outbox.deliveries),[VIGUERAS]);
 assert.equal(ev.outbox.deliveries[VIGUERAS].status,'pending');
 assert.equal(h.writes,1);
});
test('same command retried returns committed record without any new write',async()=>{
 const h=harness(),s=h.make();
 const first=await s.execute('CMD_1'),writes=h.writes;
 const second=await s.execute('CMD_1');
 assert.equal(second.status,'already_committed');
 assert.equal(first.eventId,second.eventId);
 assert.equal(h.writes,writes);
 assert.equal(h.state.version,2);
});
test('simultaneous same-command calls produce one mutation and one event',async()=>{
 const h=harness(),s=h.make();
 const res=await Promise.all(Array.from({length:15},()=>s.execute('CMD_1')));
 assert.equal(res.filter(x=>x.status==='committed').length,1);
 assert.equal(res.filter(x=>x.status==='already_committed').length,14);
 assert.equal(h.state.version,2);
 assert.equal(Object.keys(h.state.events).length,1);
 assert.equal(Object.keys(h.state.commands).length,1);
});
test('crash before CAS results in no state, no event or queued alert',async()=>{
 const h=harness({failure:'before-commit'});
 await assert.rejects(h.make().execute('CMD_1'),{code:'NO_WRITE'});
 assert.deepEqual(h.state,seed());
});
test('lost response after successful CAS is reconciled, never dispatched twice',async()=>{
 const h=harness({failure:'after-commit'});
 const result=await h.make().execute('CMD_1');
 assert.equal(result.status,'committed_recovered');
 assert.equal(h.state.version,2);
 assert.equal(Object.keys(h.state.events).length,1);
 const retry=await h.make().execute('CMD_1');
 assert.equal(retry.status,'already_committed');
 assert.equal(retry.eventId,result.eventId);
});
test('CAS conflicts without progress exhaust bounded retries without mutation',async()=>{
 const h=harness({failure:'always-conflict',maxAttempts:3});
 await assert.rejects(h.make().execute('CMD_1'),{code:'CAS_RETRIES_EXHAUSTED'});
 assert.equal(h.writes,3);
 assert.deepEqual(h.state,seed());
});
test('independent valid cells serialize via CAS and preserve both events',async()=>{
 const h=harness(),commands={
  CMD_1:{...h.command},
  CMD_2:{...h.command,id:'CMD_2',lane:'2',expectedText:'40 MIN',nextText:'45 MIN'}
 };
 const service=h.make(async id=>commands[id]);
 const results=await Promise.all([service.execute('CMD_1'),service.execute('CMD_2')]);
 assert.equal(results.filter(x=>x.status==='committed').length,2);
 assert.equal(h.state.grid['2026-11-04']['1'].texto,'35 MIN');
 assert.equal(h.state.grid['2026-11-04']['2'].texto,'45 MIN');
 assert.equal(h.state.version,3);
 assert.equal(Object.keys(h.state.events).length,2);
 assert.equal(Object.keys(h.state.commands).length,2);
});
test('two different commands changing same cell never overwrite a concurrent winner',async()=>{
 const h=harness(),commands={
  CMD_1:{...h.command},
  CMD_2:{...h.command,id:'CMD_2',nextText:'37 MIN'}
 };
 const service=h.make(async id=>commands[id]);
 const rs=await Promise.allSettled([service.execute('CMD_1'),service.execute('CMD_2')]);
 assert.equal(rs.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(rs.filter(x=>x.status==='rejected'&&x.reason?.code==='BUSINESS_PRECONDITION_FAILED').length,1);
 assert.equal(h.state.version,2);
 assert.equal(Object.keys(h.state.events).length,1);
});
test('reuse of same command id with altered business values is denied',async()=>{
 const h=harness(),s=h.make();
 await s.execute('CMD_1');
 h.command.nextText='120 MIN';
 await assert.rejects(s.execute('CMD_1'),{code:'COMMAND_ID_REUSE'});
 assert.equal(h.state.version,2);
});
test('role/permission revocation is enforced before checking an old command',async()=>{
 const h=harness(),s=h.make();
 await s.execute('CMD_1');
 h.permit.businessApproved=false;
 await assert.rejects(s.execute('CMD_1'),{code:'COMMAND_NOT_AUTHORIZED'});
});
test('unauthorized user or unassigned greenhouse must not write',async()=>{
 const h=harness();
 h.permit.authorizedInvIds=['INV_2'];
 await assert.rejects(h.make().execute('CMD_1'),{code:'COMMAND_NOT_AUTHORIZED'});
 assert.equal(h.writes,0);
 h.permit.authorizedInvIds=['INV_1'];h.permit.actorUid=DENNIS;
 await assert.rejects(h.make().execute('CMD_1'),{code:'COMMAND_NOT_AUTHORIZED'});
 assert.equal(h.writes,0);
});
test('only a command reference is accepted, not a mutable object or injected target',async()=>{
 const h=harness();
 await assert.rejects(h.make().execute({id:'CMD_1',target:DENNIS}),{code:'INVALID_COMMAND_REFERENCE'});
 await assert.rejects(h.make().execute('CMD_1?target=DENNIS'),{code:'INVALID_COMMAND_REFERENCE'});
});
test('reject non validated or diverged original irrigation cell',async()=>{
 const initial=seed();initial.grid['2026-11-04']['1'].revisadoPorVigueras=false;
 const h=harness({initial});
 await assert.rejects(h.make().execute('CMD_1'),{code:'BUSINESS_PRECONDITION_FAILED'});
 assert.deepEqual(h.state,initial);
});
test('reject untrusted command kind and bad business patch',async()=>{
 const h=harness();h.command.kind='riego_problema_reportado';
 await assert.rejects(h.make().execute('CMD_1'),{code:'INVALID_TRUSTED_COMMAND'});
 h.command.kind='riego_validado_modificado';h.command.nextText='30 MIN';
 await assert.rejects(h.make().execute('CMD_1'),{code:'INVALID_TRUSTED_COMMAND'});
});
test('malformed persisted aggregate fails closed instead of being overwritten',async()=>{
 const h=harness({initial:{version:1,grid:{},events:{},commands:{}}});
 await assert.rejects(h.make().execute('CMD_1'),{code:'INVALID_AGGREGATE'});
 assert.equal(h.writes,0);
});
test('no Push or visible alert is emitted from the synthetic aggregate',async()=>{
 const h=harness(),s=h.make();await s.execute('CMD_1');
 assert.equal(typeof s.sendPush,'undefined');
 assert.equal(typeof s.writeLiveRiego,'undefined');
 assert.equal(typeof s.dispatch,'undefined');
 assert.equal(h.state.events[Object.keys(h.state.events)[0]].outbox.status,'pending');
});
