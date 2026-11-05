'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createRevocationBarrierModel}=require('./prototype-revocation-barrier-v3.cjs');
test('revocation becomes effective only after all INV fences acknowledge',()=>{
 const m=createRevocationBarrierModel();
 assert.equal(m.write('INV_A','FRAN','W1').status,'committed');
 assert.equal(m.begin('REVOKE1').status,'started');
 // Pre-fence writes are possible; announcement alone is NOT a security boundary.
 assert.equal(m.write('INV_B','FRAN','W2').status,'committed');
 m.fence('INV_A','REVOKE1','FRAN');
 assert.throws(()=>m.write('INV_A','FRAN','W3'),{code:'LOCAL_FENCE'});
 assert.throws(()=>m.finish('REVOKE1'),{code:'BARRIER_INCOMPLETE'});
 m.fence('INV_B','REVOKE1','FRAN');
 assert.equal(m.finish('REVOKE1').status,'completed');
 assert.throws(()=>m.write('INV_A','FRAN','W4'),{code:'LOCAL_FENCE'});
 assert.throws(()=>m.write('INV_B','FRAN','W5'),{code:'LOCAL_FENCE'});
});
test('recovery resumes incomplete barrier without clearing committed INV fences',()=>{
 const m=createRevocationBarrierModel(['INV_A','INV_B','INV_C']);
 m.begin('R2');m.fence('INV_A','R2','FRAN');
 assert.deepEqual(m.recover('R2').pending,['INV_B','INV_C']);
 assert.equal(m.begin('R2').status,'already_started');
 assert.equal(m.fence('INV_A','R2','FRAN').status,'acknowledged');
 m.fence('INV_B','R2','FRAN');
 assert.throws(()=>m.finish('R2'),{code:'BARRIER_INCOMPLETE'});
 m.fence('INV_C','R2','FRAN');
 assert.equal(m.finish('R2').status,'completed');
 assert.equal(m.begin('R2').status,'already_completed');
 assert.deepEqual(m.recover('R2').pending,[]);
});
test('wrong revocation ID cannot acknowledge or complete another barrier',()=>{
 const m=createRevocationBarrierModel();
 m.begin('R3');
 assert.throws(()=>m.fence('INV_A','WRONG','FRAN'),{code:'REVOCATION_NOT_ACTIVE'});
 assert.throws(()=>m.finish('WRONG'),{code:'REVOCATION_NOT_ACTIVE'});
 assert.throws(()=>m.begin('R4'),{code:'REVOCATION_IN_PROGRESS'});
 assert.deepEqual(m.recover('R3').pending,['INV_A','INV_B']);
});
test('fence preserves other users ability to write to their INV',()=>{
 const m=createRevocationBarrierModel();
 m.begin('R4');m.fence('INV_A','R4','FRAN');
 assert.equal(m.write('INV_A','DENNIS','D1').status,'committed');
 assert.throws(()=>m.write('INV_A','FRAN','F1'),{code:'LOCAL_FENCE'});
});
test('duplicate writes have one receipt and revocation cannot erase it',()=>{
 const m=createRevocationBarrierModel();
 const first=m.write('INV_A','FRAN','W1');
 assert.equal(m.write('INV_A','FRAN','W1').revision,first.revision);
 m.begin('R5');m.fence('INV_A','R5','FRAN');
 // Existing receipts remain readable as idempotent history in this model.
 assert.equal(m.get().nodes.INV_A.receipts.W1,first.revision);
 assert.equal(m.get().nodes.INV_A.writes.length,1);
});
