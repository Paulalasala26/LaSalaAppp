'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createDemoRestTransport,createDemoStore,ROOTS}=require('./prototype-avisos-push-store-v2.cjs');
const {planMigration,loadMigrationPlan,executeDemoMigration,LEGACY}=
  require('./prototype-avisos-push-migration-v2.cjs');
const {uidForName,endpointId}=require('./prototype-avisos-push-v2.cjs');
const A=uidForName('TECNICO_A'),B=uidForName('TECNICO_B');
const clone=x=>JSON.parse(JSON.stringify(x));
const sub=x=>({endpoint:'https://push.example.test/'+x,
  keys:{auth:'auth-test-123456',p256dh:'key-test-0123456789abcdef'}});
const alert=(id='aviso_100')=>({id,fecha:'04/11/2026, 10:00:00',
  titulo:'Aviso',mensaje:'Mensaje',visto:false,leido:false,
  evaluacion:null,observaciones:'',tipo:'general'});
const fail=(fn,code)=>assert.rejects(fn,e=>e?.code===code||e?.message===code);
function mockDb(options={}){
  const db=clone(options.db||{});
  const calls={get:0,put:0,paths:[],headers:[],writes:0};
  const parts=url=>{
    const u=new URL(url);
    assert.equal(u.origin,'http://127.0.0.1:9000');
    assert.ok(!u.search||u.search==='?print=silent');
    assert.match(u.pathname,/^\/[A-Za-z0-9_/-]+\.json$/);
    return u.pathname.slice(1,-5).split('/').map(decodeURIComponent);
  };
  const get=key=>{
    let here=db;
    for(const p of key){
      if(!here||!Object.prototype.hasOwnProperty.call(here,p))return null;
      here=here[p];
    }
    return clone(here);
  };
  const put=(key,value)=>{
    let here=db;
    for(const p of key.slice(0,-1)){if(!here[p])here[p]={};here=here[p]}
    if(value===null)delete here[key[key.length-1]];
    else here[key[key.length-1]]=clone(value);
  };
  const etag=path=>'"'+crypto.createHash('sha256').update(JSON.stringify(get(path))).digest('hex').slice(0,16)+'"';
  const fetch=async(url,request)=>{
    assert.equal(request.headers.Authorization,'Bearer demo-only');
    const path=parts(url),method=request.method;
    calls.paths.push({path:path.join('/'),method,url});
    calls.headers.push(request.headers);
    if(method==='GET'){
      calls.get++;
      const headers=request.headers['X-Firebase-ETag']==='true'&&!options.noEtag?
        {etag:etag(path)}:{};
      return new Response(JSON.stringify(get(path)),{status:200,headers});
    }
    if(method==='PUT'){
      calls.put++;
      assert.ok(new URL(url).searchParams.has('print'));
      assert.equal(request.headers['Content-Type'],'application/json');
      // Simulated concurrent writer runs BEFORE the server rechecks its current ETag.
      if(typeof options.onPut==='function')options.onPut({path,request,put,get,calls});
      const currentEtag=etag(path);
      if(options.failPut)return new Response(JSON.stringify({error:'denied'}),{status:403});
      if(options.conflict||request.headers['if-match']!==currentEtag)
        return new Response(JSON.stringify({error:'conflict'}),{status:412});
      put(path,JSON.parse(request.body));calls.writes++;
      return new Response('',{status:200});
    }
    throw Error('UNEXPECTED_METHOD');
  };
  return {db,calls,get,put,fetch};
}
function fixture(options={}){
  const db=mockDb(options);
  const transport=createDemoRestTransport({baseUrl:'http://127.0.0.1:9000/',
    projectId:'demo-lasala-phase2-alerts',fetchImpl:db.fetch});
  const store=createDemoStore({transport});
  return {...db,transport,store};
}
const legacy=()=>({
  [LEGACY.alerts]:JSON.stringify({TECNICO_A:[alert(),alert('aviso_200')],TECNICO_B:[alert('aviso_300')]}),
  [LEGACY.push]:JSON.stringify({TECNICO_A:[sub('one')],TECNICO_B:[sub('two')]})
});
test('transport refuses real Firebase URL and non-demo project',()=>{
  const fetchImpl=async()=>{throw Error('NO_NETWORK')};
  for(const url of ['https://la-sala-app-test-default-rtdb.europe-west1.firebasedatabase.app/',
    'http://evil.test:9000/','http://127.0.0.1:9010/','http://127.0.0.1:9000/foreign',
    'http://localhost:9000/?write=1'])
    assert.throws(()=>createDemoRestTransport({baseUrl:url,projectId:'demo-test',fetchImpl}),/LOOPBACK_EMULATOR_REQUIRED/);
  assert.throws(()=>createDemoRestTransport({baseUrl:'http://127.0.0.1:9000/',
    projectId:'la-sala-app-test',fetchImpl}),/DEMO_PROJECT_REQUIRED/);
});
test('reads null record with ETag before first CAS write',async()=>{
  const f=fixture();
  const val={id:'aviso_1',recipientUid:A,version:1};
  assert.equal(await f.transport.compareAndSwap([ROOTS.alerts,A,'aviso_1'],0,val),true);
  assert.deepEqual(f.get([ROOTS.alerts,A,'aviso_1']),val);
  assert.equal(f.calls.put,1);
  assert.equal(f.calls.headers[0]['X-Firebase-ETag'],'true');
  assert.ok(f.calls.headers[1]['if-match']);
});
test('stale version never reaches PUT or overwrites current data',async()=>{
  const existing={id:'aviso_1',recipientUid:A,version:2};
  const f=fixture({db:{[ROOTS.alerts]:{[A]:{aviso_1:existing}}}});
  const ok=await f.transport.compareAndSwap([ROOTS.alerts,A,'aviso_1'],1,{...existing,version:3});
  assert.equal(ok,false);assert.equal(f.calls.put,0);
  assert.equal(f.get([ROOTS.alerts,A,'aviso_1']).version,2);
});
test('ETag collision returns false without changing winner',async()=>{
  const existing={id:'aviso_1',recipientUid:A,version:1};
  const f=fixture({db:{[ROOTS.alerts]:{[A]:{aviso_1:existing}}},
    onPut:({path,put})=>put(path,{...existing,version:2,fromOther:true})});
  assert.equal(await f.transport.compareAndSwap([ROOTS.alerts,A,'aviso_1'],1,
    {...existing,version:2,read:true}),false);
  assert.equal(f.get([ROOTS.alerts,A,'aviso_1']).fromOther,true);
});
test('missing Firebase ETag blocks writes',async()=>{
  const f=fixture({noEtag:true});
  await fail(()=>f.transport.insertIfMissing([ROOTS.outbox,'TEST_1'],{version:1}), 'ETAG_MISSING');
  assert.equal(f.calls.put,0);
});
test('Firebase REST 403 write fails closed with non-sensitive status',async()=>{
  const f=fixture({failPut:true});
  await fail(()=>f.transport.insertIfMissing([ROOTS.outbox,'TEST_1'],{version:1}),
    'FIREBASE_WRITE_FAILED');
  assert.equal(f.calls.writes,0);
});
test('compare-and-swap mutates only one alert document',async()=>{
  const old={...alert(),id:'aviso_100',recipientUid:A,version:1};
  const other={...alert('aviso_300'),recipientUid:B,version:1};
  const f=fixture({db:{[ROOTS.alerts]:{[A]:{aviso_100:old},[B]:{aviso_300:other}}}});
  assert.equal(await f.store.compareAndSwapAlert(A,'aviso_100',1,{...old,leido:true,version:2}),true);
  assert.equal(f.get([ROOTS.alerts,A,'aviso_100']).leido,true);
  assert.deepEqual(f.get([ROOTS.alerts,B,'aviso_300']),other);
});
test('alert writer refuses foreign UID or mismatched document identity',async()=>{
  const f=fixture();
  await fail(()=>f.store.insertAlert(A,'aviso_1',{id:'aviso_1',recipientUid:B,version:1}),
    'INVALID_ALERT_DOCUMENT');
  assert.equal(f.calls.put,0);
});
test('alert writer refuses version jumps',async()=>{
  const f=fixture();
  await fail(()=>f.store.compareAndSwapAlert(A,'aviso_1',1,{
    id:'aviso_1',recipientUid:A,version:5}), 'INVALID_VERSION_STEP');
  assert.equal(f.calls.put,0);
});
test('subscription CAS enforces one canonical endpoint ID',async()=>{
  const f=fixture(),id=endpointId(sub('one').endpoint);
  const record={uid:A,subscription:sub('one'),version:1};
  assert.equal(await f.store.insertSubscription(id,record),true);
  const wrong=endpointId(sub('two').endpoint);
  await fail(()=>f.store.insertSubscription(wrong,record),'INVALID_SUBSCRIPTION_DOCUMENT');
  assert.equal(f.get([ROOTS.endpoints,id]).uid,A);
});
test('subscription transfer requires version match and cannot erase competing writer',async()=>{
  const f=fixture(),id=endpointId(sub('one').endpoint),prior={uid:A,subscription:sub('one'),version:1};
  await f.store.insertSubscription(id,prior);
  assert.equal(await f.store.compareAndSwapSubscription(id,1,{...prior,uid:B,version:2}),true);
  assert.equal(await f.store.compareAndSwapSubscription(id,1,null),false);
  assert.equal(f.get([ROOTS.endpoints,id]).uid,B);
});
test('same event key queued once with Firebase-safe hashed paths',async()=>{
  const f=fixture(),evt={recipientUid:A,actorUid:B,kind:'riego_problema',referenceId:'EV_1'};
  assert.equal(await f.store.enqueueNotification('riego_problema:EV_1',evt),true);
  assert.equal(await f.store.enqueueNotification('riego_problema:EV_1',evt),false);
  const puts=f.calls.paths.filter(x=>x.method==='PUT');
  assert.equal(puts.length,1);
  assert.match(puts[0].path,/\/e_[a-f0-9]{64}$/);
});
test('weekly Tuta batch queued atomically only once',async()=>{
  const f=fixture(),events=[{recipientUid:A},{recipientUid:B}];
  assert.equal(await f.store.enqueueWeeklyReminder('weekly-tuta:2026-11-05',events),true);
  assert.equal(await f.store.enqueueWeeklyReminder('weekly-tuta:2026-11-05',events),false);
  const root=f.get([ROOTS.weekly]);
  assert.equal(Object.keys(root).length,1);
  assert.equal(Object.values(root)[0].events.length,2);
});
test('list own alerts cannot read another UID',async()=>{
  const a={...alert(),recipientUid:A,version:1};
  const f=fixture({db:{[ROOTS.alerts]:{[A]:{aviso_100:a},[B]:{aviso_200:{...a,id:'aviso_200',recipientUid:B}}}}});
  const mine=await f.store.getOwnAlerts(A);
  assert.deepEqual(Object.keys(mine),['aviso_100']);
  assert.ok(f.calls.paths[0].path.endsWith('/'+A));
});
test('all alerts returns only alert root and enforces document bounds',async()=>{
  const rec={...alert(),recipientUid:A,version:1};
  const f=fixture({db:{[ROOTS.alerts]:{[A]:{aviso_100:rec}},[ROOTS.endpoints]:{secret:'PRIVATE'}}});
  const all=await f.store.getAllAlerts();
  assert.deepEqual(Object.keys(all),[A]);
  assert.ok(!JSON.stringify(all).includes('PRIVATE'));
});
test('event source requires approved server loader',async()=>{
  const f=fixture();
  await fail(()=>f.store.getSourceEvent('riego_problema','EV_1'),'EVENT_SOURCE_NOT_CONFIGURED');
});
test('legacy string JSON is parsed losslessly with original status',()=>{
  const data=legacy();
  const p=planMigration({legacyAlerts:data[LEGACY.alerts],legacyPush:data[LEGACY.push],
    sourceEtags:{alerts:'"etag-a"',push:'"etag-p"'}});
  assert.deepEqual(p.counts,{recipients:2,alerts:3,push:2});
  assert.equal(p.alerts[0].record.version,1);
  assert.ok(p.alerts[0].record.fecha);
  assert.equal(p.alerts[0].record.visto,false);
  assert.equal(p.alerts[0].record.leido,false);
  assert.equal(p.alerts[0].record.migratedFrom,LEGACY.alerts);
});
test('migration plan rejects duplicate IDs without silently dropping events',()=>{
  const copy=legacy();copy[LEGACY.alerts]=JSON.stringify({TECNICO_A:[alert(),alert()]});
  assert.throws(()=>planMigration({legacyAlerts:copy[LEGACY.alerts],legacyPush:copy[LEGACY.push],
    sourceEtags:{alerts:'"a"',push:'"b"'}}),/DUPLICATE_LEGACY_ALERT/);
});
test('migration plan rejects one endpoint shared by different users',()=>{
  const data=legacy();
  data[LEGACY.push]=JSON.stringify({TECNICO_A:[sub('one')],TECNICO_B:[sub('one')]});
  assert.throws(()=>planMigration({legacyAlerts:data[LEGACY.alerts],legacyPush:data[LEGACY.push],
    sourceEtags:{alerts:'"a"',push:'"b"'}}),/SHARED_ENDPOINT_OWNER_CONFLICT/);
});
test('migration plan rejects invalid subscription rather than dropping it',()=>{
  const data=legacy();
  data[LEGACY.push]=JSON.stringify({TECNICO_A:[{endpoint:'http://unsafe.test'}]});
  assert.throws(()=>planMigration({legacyAlerts:data[LEGACY.alerts],legacyPush:data[LEGACY.push],
    sourceEtags:{alerts:'"a"',push:'"b"'}}),/INVALID_LEGACY_PUSH/);
});
test('migration dry-run makes zero PUTs and reports exact counts',async()=>{
  const f=fixture({db:legacy()});
  const plan=await loadMigrationPlan(f.transport);
  const r=await executeDemoMigration({transport:f.transport,store:f.store,plan});
  assert.deepEqual(r,{dryRun:true,ready:true,recipients:2,alerts:3,push:2,
    wouldCreateAlerts:3,wouldCreatePush:2});
  assert.equal(f.calls.put,0);
});
test('migration refuses writes without explicit demo-only approval',async()=>{
  const f=fixture({db:legacy()}),plan=await loadMigrationPlan(f.transport);
  await fail(()=>executeDemoMigration({transport:f.transport,store:f.store,
    plan,dryRun:false}), 'DEMO_APPROVAL_REQUIRED');
  assert.equal(f.calls.put,0);
});
test('migration writes only v2 and retains both v1 source keys',async()=>{
  const initial=legacy(),f=fixture({db:initial});
  const plan=await loadMigrationPlan(f.transport);
  const outcome=await executeDemoMigration({transport:f.transport,store:f.store,
    plan,dryRun:false,approvedForDemo:true});
  assert.deepEqual(outcome,{dryRun:false,createdAlerts:3,createdPush:2,
    sourceUnchanged:true,complete:true,requiresCutoverReconciliation:true});
  assert.equal(f.get([LEGACY.alerts]),initial[LEGACY.alerts]);
  assert.equal(f.get([LEGACY.push]),initial[LEGACY.push]);
  assert.equal(f.calls.writes,5);
  const writes=f.calls.paths.filter(x=>x.method==='PUT').map(x=>x.path);
  assert.ok(writes.every(x=>x.startsWith(ROOTS.alerts+'/')||x.startsWith(ROOTS.endpoints+'/')));
});
test('migration is idempotent on identical second pass',async()=>{
  const f=fixture({db:legacy()}),plan=await loadMigrationPlan(f.transport);
  await executeDemoMigration({transport:f.transport,store:f.store,plan,
    dryRun:false,approvedForDemo:true});
  const second=await executeDemoMigration({transport:f.transport,store:f.store,plan,
    dryRun:false,approvedForDemo:true});
  assert.equal(second.createdAlerts,0);
  assert.equal(second.createdPush,0);
  assert.equal(f.calls.writes,5);
});
test('source changes after planning block migration before first write',async()=>{
  const f=fixture({db:legacy()}),plan=await loadMigrationPlan(f.transport);
  const changed=JSON.stringify({TECNICO_A:[alert('new_aviso')]});
  f.put([LEGACY.alerts],changed);
  await fail(()=>executeDemoMigration({transport:f.transport,store:f.store,plan,
    dryRun:false,approvedForDemo:true}), 'SOURCE_CHANGED_BEFORE_MIGRATION');
  assert.equal(f.calls.writes,0);
});
test('conflicting v2 record blocks entire migration at preflight',async()=>{
  const data=legacy();const first=planMigration({legacyAlerts:data[LEGACY.alerts],
    legacyPush:data[LEGACY.push],sourceEtags:{alerts:'"a"',push:'"b"'}}).alerts[0];
  data[ROOTS.alerts]={[first.uid]:{[first.id]:{...first.record,mensaje:'changed externally'}}};
  const f=fixture({db:data}),plan=await loadMigrationPlan(f.transport);
  await fail(()=>executeDemoMigration({transport:f.transport,store:f.store,plan,
    dryRun:false,approvedForDemo:true}), 'ALERT_MIGRATION_CONFLICT');
  assert.equal(f.calls.writes,0);
});
test('legacy concurrent changes during migration are detected; no false completion',async()=>{
  const initial=legacy();let once=false;
  const f=fixture({db:initial,onPut:({path,put})=>{
    if(!once&&path[0]===ROOTS.alerts){
      once=true;put([LEGACY.alerts],JSON.stringify({TECNICO_A:[alert('concurrent')]}));
    }
  }});
  const plan=await loadMigrationPlan(f.transport);
  const outcome=await executeDemoMigration({transport:f.transport,store:f.store,plan,
    dryRun:false,approvedForDemo:true});
  assert.equal(outcome.sourceUnchanged,false);
  assert.equal(outcome.complete,false);
  assert.equal(outcome.requiresCutoverReconciliation,true);
  assert.equal(f.get([LEGACY.alerts]),JSON.stringify({TECNICO_A:[alert('concurrent')]}));
});
test('migration accepts empty legacy snapshots without writing any data',async()=>{
  const f=fixture({db:{}}),plan=await loadMigrationPlan(f.transport);
  const outcome=await executeDemoMigration({transport:f.transport,store:f.store,plan,
    dryRun:false,approvedForDemo:true});
  assert.equal(outcome.createdAlerts,0);assert.equal(outcome.createdPush,0);
  assert.equal(f.calls.put,0);
});

test('migration treats reordered Firebase JSON fields as identical data',async()=>{
  const values=legacy();
  const plan=planMigration({legacyAlerts:values[LEGACY.alerts],legacyPush:values[LEGACY.push],
    sourceEtags:{alerts:'"synthetic-a"',push:'"synthetic-b"'}});
  const original=plan.alerts[0];
  values[ROOTS.alerts]={[original.uid]:{[original.id]:
    Object.fromEntries(Object.entries(original.record).reverse())}};
  const f=fixture({db:values});
  const fresh=await loadMigrationPlan(f.transport);
  const dry=await executeDemoMigration({transport:f.transport,store:f.store,plan:fresh});
  assert.equal(dry.dryRun,true);
  assert.equal(dry.wouldCreateAlerts,2);
  const out=await executeDemoMigration({transport:f.transport,store:f.store,
    plan:fresh,approvedForDemo:true,dryRun:false});
  assert.equal(out.createdAlerts,2);
  assert.equal(out.complete,true);
});
