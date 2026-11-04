'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGlobalFencePrototype}=require('./prototype-global-fence-v3.cjs');
const copy=x=>structuredClone(x);
function setup(){
 let state={
  version:1,globalEpoch:1,
  sessions:{FRAN:{active:true},VIGUERAS:{active:true}},
  invernaderos:{
   INV_A:{acl:{FRAN:{active:true,ops:['EDIT_RIEGO']},
     VIGUERAS:{active:true,grantManager:true}},
    grid:{CELL:'30 MIN'},receipts:{}},
   INV_B:{acl:{FRAN:{active:true,ops:['EDIT_RIEGO']},
     VIGUERAS:{active:true,grantManager:true}},
    grid:{CELL:'40 MIN'},receipts:{}}
  }
 };
 let barrier=null,interference=null;
 const transport={
  async retrieve(){return {value:copy(state),etag:'"'+state.version+'"'}},
  async compareAndSwap(path,expected,next){
   if(interference){const fn=interference;interference=null;await fn();}
   if(barrier){await barrier();}
   if(state.version!==expected)return false;
   state=copy(next);return true;
  }
 };
 const auth={async verifyIdentity(token){
  if(!['FRAN','VIGUERAS'].includes(token))throw Error('INVALID_JWT');
  return {uid:token};
 }};
 const gateway=createGlobalFencePrototype({transport,auth});
 return {
  gateway, get state(){return copy(state)},
  interfere:fn=>{interference=fn},
  setBarrier:fn=>{barrier=fn}
 };
}
const write=(invId,id)=>({token:'FRAN',invId,id,cellKey:'CELL',newText:'50 MIN'});
const revoke=(invId='INV_B')=>({token:'VIGUERAS',invId,id:'REVOKE_FRAN',targetUid:'FRAN'});
test('global revocation first invalidates writes in another INV',async()=>{
 const x=setup();
 assert.equal((await x.gateway.revoke(revoke())).status,'committed');
 await assert.rejects(x.gateway.commit(write('INV_A','EDIT1')),
  {code:'GLOBAL_SESSION_REVOKED'});
 assert.equal(x.state.invernaderos.INV_A.grid.CELL,'30 MIN');
});
test('write first can commit, but revocation linearizes after it',async()=>{
 const x=setup();
 assert.equal((await x.gateway.commit(write('INV_A','EDIT1'))).status,'committed');
 assert.equal((await x.gateway.revoke(revoke())).status,'committed');
 await assert.rejects(x.gateway.commit(write('INV_B','EDIT2')),
  {code:'GLOBAL_SESSION_REVOKED'});
 assert.equal(x.state.invernaderos.INV_B.grid.CELL,'40 MIN');
});
test('revocation wins between read and CAS: stale writer retries and fails closed',async()=>{
 const x=setup();
 x.interfere(async()=>{await x.gateway.revoke(revoke());});
 await assert.rejects(x.gateway.commit(write('INV_A','RACE')),
  {code:'GLOBAL_SESSION_REVOKED'});
 assert.equal(x.state.invernaderos.INV_A.grid.CELL,'30 MIN');
 assert.equal(x.state.version,2);
});
test('repeat and conflicting replay cannot duplicate changes',async()=>{
 const x=setup(),request=write('INV_A','EDIT1');
 assert.equal((await x.gateway.commit(request)).status,'committed');
 assert.equal((await x.gateway.commit(request)).status,'already_committed');
 await assert.rejects(x.gateway.commit({...request,newText:'80 MIN'}),
  {code:'RECEIPT_CONFLICT'});
 assert.equal(x.state.version,2);
});
test('session errors, unauthorized manager and self-revocation cannot mutate',async()=>{
 const x=setup();
 await assert.rejects(x.gateway.revoke({token:'FRAN',invId:'INV_A',
  id:'REV',targetUid:'VIGUERAS'}),{code:'GRANT_MANAGER_REQUIRED'});
 await assert.rejects(x.gateway.revoke({token:'VIGUERAS',invId:'INV_A',
  id:'SELF',targetUid:'VIGUERAS'}),{code:'CANNOT_REVOKE_SELF'});
 await assert.rejects(x.gateway.commit({...write('INV_A','EDIT'),
  token:'UNKNOWN'}));
 assert.equal(x.state.version,1);
});
