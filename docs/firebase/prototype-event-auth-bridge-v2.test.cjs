'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {uidForName}=require('./prototype-avisos-push-v2.cjs');
const {createEmulatorAuthorizationBridge}=require('./prototype-event-auth-bridge-v2.cjs');
const users={FRAN:'a'.repeat(64),DENNIS:'b'.repeat(64),VIGUERAS:'c'.repeat(64),REGANTE1:'d'.repeat(64)};
const roles={FRAN:'TECNICO',DENNIS:'TECNICO',VIGUERAS:'ADMIN',REGANTE1:'REGANTE'};
const account=name=>({appUser:name,uid:uidForName(name)});
function harness(name='FRAN',settings={}){
 const mockRoles={...roles},mockUsers={...users};
 const transport={retrieve:async path=>({value:JSON.stringify(path[0]==='lasala-roles-v1'?mockRoles:mockUsers)})};
 const auth={verifyIdentity:async()=>settings.identity||account(name)};
 const source={
   id:'EV_1',kind:'riego_hojas_marcadas',actorUid:uidForName(name),persisted:true,
   serverVerified:true,transitionCommitted:true,revision:1,invIds:['INV_1'],
   sala:'sala1',markingConfirmed:true
 };
 let sourceCalls=0,scopeCalls=0;
 const bridge=createEmulatorAuthorizationBridge({
  auth,transport,approved:settings.approved??true,
  loadTrustedSource:async()=>{sourceCalls++;return source},
  resolveTrustedScope:async()=>{scopeCalls++;return {serverVerified:true,authorizedInvIds:['INV_1']}}
 });
 const request={kind:'riego_hojas_marcadas',referenceId:'EV_1'};
 return {bridge,request,mockRoles,mockUsers,source,get sourceCalls(){return sourceCalls},get scopeCalls(){return scopeCalls}};
}
test('backend verified actor and current roles allow valid technician with own INV',async()=>{
 const h=harness(),out=await h.bridge('fake-test-token',h.request);
 assert.deepEqual(out.recipientUids,[uidForName('VIGUERAS')]);
 assert.equal(out.outboxRequired,true);
 assert.equal(h.sourceCalls,1);
 assert.equal(h.scopeCalls,1);
});
test('denies role changed after prior authorization',async()=>{
 const h=harness();await h.bridge('token',h.request);
 h.mockRoles.FRAN='PEON';
 await assert.rejects(h.bridge('token',h.request),{code:'ROLE_DENIED'});
});
test('disabled account is rejected even if token still valid',async()=>{
 const h=harness();h.mockUsers.FRAN='disabled:'+users.FRAN;
 await assert.rejects(h.bridge('token',h.request),{code:'ACTOR_DISABLED'});
 assert.equal(h.sourceCalls,0);
});
test('forged ADMIN claim does not override role obtained from store',async()=>{
 const h=harness('FRAN',{identity:account('FRAN')});
 h.mockRoles.FRAN='CARGADOR';
 await assert.rejects(h.bridge('token',{...h.request,role:'ADMIN'}),{code:'UNTRUSTED_REQUEST'});
 await assert.rejects(h.bridge('token',h.request),{code:'ROLE_DENIED'});
});
test('untrusted target and different greenhouse are denied',async()=>{
 const h=harness();
 await assert.rejects(h.bridge('token',{...h.request,target:'DENNIS'}),{code:'UNTRUSTED_REQUEST'});
 h.source.invIds=['INV_OTHER'];
 await assert.rejects(h.bridge('token',h.request),{code:'INV_SCOPE_DENIED'});
});
test('stale source actor is denied',async()=>{
 const h=harness();h.source.actorUid=uidForName('DENNIS');
 await assert.rejects(h.bridge('token',h.request),{code:'UNVERIFIED_SOURCE'});
});
test('inactive supervisor blocks emission',async()=>{
 const h=harness();h.mockUsers.VIGUERAS='disabled';
 await assert.rejects(h.bridge('token',h.request),{code:'INACTIVE_RECIPIENT'});
});
test('unknown and invalid roles fail closed',async()=>{
 const h=harness();h.mockRoles.FRAN='CUSTOM_ADMIN';
 await assert.rejects(h.bridge('token',h.request),{code:'ACTOR_DISABLED'});
});
test('tampered UID is denied even if token verifier returns identity',async()=>{
 const h=harness('FRAN',{identity:{appUser:'FRAN',uid:uidForName('DENNIS')}});
 await assert.rejects(h.bridge('token',h.request),{code:'INVALID_IDENTITY'});
});
test('source resolver must supply committed persisted server state',async()=>{
 const h=harness();h.source.serverVerified=false;
 await assert.rejects(h.bridge('token',h.request),{code:'SOURCE_NOT_VERIFIED'});
});
test('business approval remains mandatory before enabling authorization',async()=>{
 const h=harness('FRAN',{approved:false});
 await assert.rejects(h.bridge('token',h.request),{code:'BUSINESS_APPROVAL_REQUIRED'});
});
test('invalid legacy maps never silently grant access',async()=>{
 const h=harness();h.mockRoles.FRAN=null;
 await assert.rejects(h.bridge('token',h.request),{code:'ACTOR_DISABLED'});
});
