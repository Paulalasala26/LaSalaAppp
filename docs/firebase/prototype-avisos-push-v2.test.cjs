'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const m=require('./prototype-avisos-push-v2.cjs');
const c=(name,role='TECNICO',active=true)=>({
  appUser:name,uid:m.uidForName(name),role,active,verified:true
});
const a=c('USER_A'),b=c('USER_B'),r=c('USER_R','REGANTE'),boss=c('USER_M','ADMIN');
const alert={id:'AVISO_1',recipientUid:a.uid,version:1,visto:false,leido:false,tipo:'general',evaluacion:null};
const data={[a.uid]:{AVISO_1:alert},[b.uid]:{AVISO_2:{...alert,id:'AVISO_2',recipientUid:b.uid}}};
const sub=x=>({endpoint:'https://push.example.test/'+x,keys:{auth:'aaaaaaaaaaaa',p256dh:'bbbbbbbbbbbbbbbbbbbbbb'}});
function fails(fn,status,code){
  assert.throws(fn,e=>e?.status===status&&e?.code===code);
}
test('stable UID is derived from uppercase user, as in Firebase Auth',()=>{
  assert.match(m.uidForName('USER_A'),/^lasala-[a-f0-9]{40}$/);
  assert.equal(m.uidForName('USER_A'),m.uidForName('USER_A'));
  assert.notEqual(m.uidForName('USER_A'),m.uidForName('USER_B'));
});
test('reject unverified, inactive, mismatched identity and invalid role',()=>{
  fails(()=>m.actor({...a,verified:false}),401,'UNAUTHORIZED');
  fails(()=>m.actor({...a,active:false}),403,'INACTIVE_OR_INVALID_ROLE');
  fails(()=>m.actor({...a,uid:b.uid}),403,'IDENTITY_MISMATCH');
  fails(()=>m.actor({...a,role:'GUEST'}),403,'INACTIVE_OR_INVALID_ROLE');
});
test('own alerts omit foreign users and return independent value',()=>{
  const result=m.ownAlerts(data,a);
  assert.deepEqual(Object.keys(result),['AVISO_1']);
  result.AVISO_1.leido=true;
  assert.equal(data[a.uid].AVISO_1.leido,false);
  assert.deepEqual(Object.keys(m.ownAlerts(data,b)),['AVISO_2']);
});
test('cannot set an arbitrary recipient or owner while updating an alert',()=>{
  fails(()=>m.editOwnAlert(data,a,{id:'AVISO_1',action:'mark-read',expectedVersion:1,uid:b.uid}),400,'UNKNOWN_FIELD');
  fails(()=>m.editOwnAlert(data,a,{id:'AVISO_2',action:'mark-read',expectedVersion:1}),404,'ALERT_NOT_FOUND');
});
test('mark-read increments version without changing source snapshot',()=>{
  const tx=m.editOwnAlert(data,a,{id:'AVISO_1',action:'mark-read',expectedVersion:1});
  assert.equal(tx.uid,a.uid);
  assert.equal(tx.next.leido,true);
  assert.equal(tx.next.version,2);
  assert.equal(data[a.uid].AVISO_1.leido,false);
});
test('stale alert version returns conflict',()=>{
  fails(()=>m.editOwnAlert(data,a,{id:'AVISO_1',action:'mark-read',expectedVersion:0}),400,'INVALID_VERSION');
  fails(()=>m.editOwnAlert(data,a,{id:'AVISO_1',action:'mark-read',expectedVersion:2}),409,'CONCURRENT_MODIFICATION');
});
test('REGANTE cannot evaluate and TECNICO can evaluate own alert',()=>{
  const mine={[r.uid]:{AVISO_1:{...alert,recipientUid:r.uid}}};
  fails(()=>m.editOwnAlert(mine,r,{id:'AVISO_1',action:'evaluate',expectedVersion:1,evaluation:'bien',notes:''}),403,'FORBIDDEN');
  const changed=m.editOwnAlert(data,a,{id:'AVISO_1',action:'evaluate',expectedVersion:1,evaluation:'mal',notes:'Incidencia'});
  assert.equal(changed.next.evaluacion,'mal');
  assert.equal(changed.next.deleted,true);
  assert.equal(changed.next.evaluadoPor,'USER_A');
});
test('resolve requires TECNICO and a riego problem, and removes from visible state',()=>{
  fails(()=>m.editOwnAlert(data,a,{id:'AVISO_1',action:'resolve',expectedVersion:1,notes:'Listo'}),403,'FORBIDDEN');
  const problems={[a.uid]:{PROB_1:{...alert,id:'PROB_1',tipo:'problema_ejecucion'}}};
  const changed=m.editOwnAlert(problems,a,{id:'PROB_1',action:'resolve',expectedVersion:1,notes:'  Reparado  '});
  assert.equal(changed.next.deleted,true);
  assert.equal(changed.next.solucion,'Reparado');
});
test('dismiss only affects own alert',()=>{
  const tx=m.editOwnAlert(data,a,{id:'AVISO_1',action:'dismiss',expectedVersion:1});
  assert.equal(tx.next.deleted,true);
  assert.equal(tx.next.deletedReason,'dismissed');
  assert.deepEqual(Object.keys(m.ownAlerts({[a.uid]:{AVISO_1:tx.next}},a)),[]);
});
test('push consent is mandatory and subscription endpoint must be HTTPS',()=>{
  fails(()=>m.registerPush({},a,sub('one')),403,'CONSENT_REQUIRED');
  fails(()=>m.registerPush({},a,{...sub('one'),endpoint:'http://bad'},{consented:true}),400,'INVALID_ENDPOINT');
});
test('two devices same owner and repeated registration deduplicate',()=>{
  const x=m.registerPush({},a,sub('one'),{consented:true});
  let index={[x.id]:x.entry};
  const y=m.registerPush(index,a,sub('two'),{consented:true});
  index[y.id]=y.entry;
  assert.equal(Object.keys(index).length,2);
  const x2=m.registerPush(index,a,sub('one'),{consented:true});
  index[x2.id]=x2.entry;
  assert.equal(Object.keys(index).length,2);
  assert.equal(index[x.id].version,2);
  assert.equal(m.pushStatus(index,a,sub('one').endpoint),true);
});
test('user switching in same browser never shows foreign subscription as owned',()=>{
  const endpoint=sub('shared');
  const x=m.registerPush({},a,endpoint,{consented:true});
  let index={[x.id]:x.entry};
  assert.equal(m.pushStatus(index,b,endpoint.endpoint),false);
  fails(()=>m.unregisterPush(index,b,endpoint.endpoint),403,'FOREIGN_SUBSCRIPTION');
  const moved=m.registerPush(index,b,endpoint,{consented:true});
  index[moved.id]=moved.entry;
  assert.equal(m.pushStatus(index,a,endpoint.endpoint),false);
  assert.equal(m.pushStatus(index,b,endpoint.endpoint),true);
});
test('unregistration by owner works and missing record is idempotent',()=>{
  const x=m.registerPush({},a,sub('one'),{consented:true});
  const index={[x.id]:x.entry};
  assert.deepEqual(m.unregisterPush(index,a,sub('one').endpoint),{id:x.id,delete:true});
  assert.deepEqual(m.unregisterPush({},a,sub('one').endpoint),{id:x.id,delete:false});
});
test('notification events refuse raw arbitrary target/title/body',()=>{
  fails(()=>m.prepareNotification(r,{kind:'riego_problema',referenceId:'EV_1',target:b.uid},
    {id:'EV_1',guardUid:a.uid}),400,'UNTRUSTED_EVENT_FIELDS');
  fails(()=>m.prepareNotification(r,{kind:'riego_resuelto',referenceId:'EV_1'},
    {id:'EV_1',reporterUid:a.uid}),403,'EVENT_FORBIDDEN');
});
test('recipient always comes from trusted server-side record',()=>{
  const msg=m.prepareNotification(r,{kind:'riego_problema',referenceId:'EV_1'},{
    id:'EV_1',guardUid:a.uid
  });
  assert.equal(msg.recipientUid,a.uid);
  assert.equal(msg.actorUid,r.uid);
  assert.equal(msg.title,'Problema de riego');
  fails(()=>m.prepareNotification(r,{kind:'riego_problema',referenceId:'EV_1'},
    {id:'EV_2',guardUid:a.uid}),404,'EVENT_SOURCE_NOT_FOUND');
});
test('service-to-service dispatch requires a configured secret',()=>{
  const secret='s'.repeat(64);
  assert.equal(m.verifyInternalSecret('Bearer '+secret,secret),true);
  assert.equal(m.verifyInternalSecret('Bearer wrong',secret),false);
  fails(()=>m.verifyInternalSecret('Bearer invalid','short'),503,'SERVICE_SECRET_NOT_CONFIGURED');
});
