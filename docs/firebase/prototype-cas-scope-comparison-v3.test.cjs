'use strict';
// §0.250 — deterministic contention comparison, not a Firebase performance benchmark.
const {test}=require('node:test');
const assert=require('node:assert/strict');

async function run({mode,count=64,invCount=4,maxAttempts=8}){
  const versions=new Map(),results=[],metrics={attempts:0,conflicts:0,committed:0,exhausted:0};
  const root='GLOBAL';
  for(let i=0;i<count;i++){
    const key=mode==='global'?root:'INV_'+(i%invCount);
    results.push({id:i,key,attempt:0,observed:0,done:false});
  }
  // Each round snapshots all versions before any commit to model colliding writers.
  for(let round=0;round<maxAttempts;round++){
    const active=results.filter(r=>!r.done&&r.attempt<maxAttempts);
    if(!active.length)break;
    const snapshot=new Map(versions);
    for(const r of active){r.observed=snapshot.get(r.key)||0;r.attempt++;metrics.attempts++;}
    for(const r of active){
      if((versions.get(r.key)||0)!==r.observed){metrics.conflicts++;continue;}
      versions.set(r.key,r.observed+1);r.done=true;metrics.committed++;
    }
  }
  metrics.exhausted=count-metrics.committed;
  assert.equal(metrics.committed+metrics.exhausted,count);
  assert.equal([...versions.values()].reduce((a,b)=>a+b,0),metrics.committed);
  return metrics;
}
test('scoped CAS reduces unrelated INV collisions in a synthetic burst',async()=>{
 const global=await run({mode:'global'});
 const scoped=await run({mode:'scoped'});
 assert.equal(global.committed,8);
 assert.equal(scoped.committed,32);
 assert.ok(scoped.conflicts<global.conflicts);
 assert.ok(scoped.exhausted<global.exhausted);
 console.log('SYNTHETIC_CAS_COMPARISON',JSON.stringify({global,scoped}));
});
test('independent CAS does not establish global atomic user revocation',async()=>{
 const scoped=await run({mode:'scoped',count:16,invCount:2,maxAttempts:8});
 assert.equal(scoped.committed,16);
 // Critical limitation: revocation in a separate global authority can race.
 // This test only measures contention. Never infer cross-INV revoke safety.
 assert.equal(typeof scoped.globalRevocationAtomic,'undefined');
});
