'use strict';
// §0.249 - deterministic contention experiment only. No emulator/network/deploy.
// Models a global root CAS vs independent CAS per greenhouse. Not an RTDB latency benchmark.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGlobalFencePrototype}=require('./prototype-global-fence-v3.cjs');

function harness({scoped=false,maxAttempts=8}={}){
 let globalVersion=1, wins=0,conflicts=0,reads=0;
 const states=Object.fromEntries(['INV_A','INV_B'].map(inv=>[inv,{
  version:1,grid:{CELL:'30 MIN'},receipts:{}
 }]));
 const sessions={USER:{active:true},ADMIN:{active:true}};
 const clone=x=>structuredClone(x);
 const transport={
  async retrieve(){
   reads++;
   return {etag:'"'+globalVersion+'"',value:{
    version:globalVersion,globalEpoch:1,sessions:clone(sessions),
    invernaderos:Object.fromEntries(Object.entries(states).map(([inv,s])=>[
      inv,{acl:{USER:{active:true,ops:['EDIT_RIEGO']},
        ADMIN:{active:true,grantManager:true}},
       grid:clone(s.grid),receipts:clone(s.receipts)}
    ]))
   }};
  },
  async compareAndSwap(_path,expected,next){
   // yield to force competing requests to observe the same version.
   await Promise.resolve();
   if(expected!==globalVersion){conflicts++;return false}
   globalVersion=next.version; wins++;
   for(const inv of Object.keys(states)){
    states[inv].grid=clone(next.invernaderos[inv].grid);
    states[inv].receipts=clone(next.invernaderos[inv].receipts);
   }
   return true;
  }
 };
 const auth={async verifyIdentity(token){
  if(token!=='USER')throw Error('UNAUTHORIZED');
  return {uid:'USER'};
 }};
 const gateway=createGlobalFencePrototype({transport,auth,maxAttempts});
 return {gateway,stats:()=>({wins,conflicts,reads,globalVersion})};
}
async function burst(n){
 const h=harness();
 const calls=Array.from({length:n},(_,i)=>h.gateway.commit({
  token:'USER',invId:i%2?'INV_B':'INV_A',
  id:'REQ_'+i,cellKey:'CELL',newText:'VALUE_'+i
 }));
 const settled=await Promise.allSettled(calls);
 const errors=settled.filter(x=>x.status==='rejected');
 const committed=settled.filter(x=>x.status==='fulfilled');
 assert.equal(h.stats().wins,committed.length);
 assert.equal(h.stats().globalVersion,1+committed.length);
 assert.equal(committed.length+errors.length,n);
 assert.ok(h.stats().conflicts>0);
 assert.ok(errors.every(x=>x.reason.code==='CAS_EXHAUSTED'));
 return {n,committed:committed.length,rejected:errors.length,...h.stats()};
}
test('global CAS reproduces contention and enforces bounded retries',async()=>{
 const small=await burst(8);
 const medium=await burst(32);
 const large=await burst(96);
 assert.equal(small.n,8);assert.equal(medium.n,32);assert.equal(large.n,96);
 assert.ok(large.rejected>0,'large burst must reveal retry exhaustion');
 // No wall-clock or Firebase emulator throughput conclusion is inferred.
 console.log('SYNTHETIC_GLOBAL_CAS_CONTENTION',JSON.stringify([small,medium,large]));
});
