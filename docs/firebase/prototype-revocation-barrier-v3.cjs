'use strict';
// §0.251 pure model: two-phase user revocation, per-INV CAS authority.
// Not a deployed distributed protocol. All state transitions here are synchronous.
const clone=x=>structuredClone(x);
const err=code=>{throw Object.assign(new Error(code),{code})};
function createRevocationBarrierModel(invs=['INV_A','INV_B']){
 if(!Array.isArray(invs)||!invs.length||new Set(invs).size!==invs.length||
    invs.some(x=>typeof x!=='string'||!/^INV_[A-Z0-9_]+$/.test(x)))
  throw new TypeError('INVALID_INVS');
 let global={status:'active',epoch:1,revocationId:null,ack:[]};
 const nodes=Object.fromEntries(invs.map(id=>[id,{
  version:1,epoch:1,phase:'active',fencedUsers:[],receipts:{},writes:[]
 }]));
 const get=()=>({global:clone(global),nodes:clone(nodes)});
 function write(inv,user,id){
  const node=nodes[inv];
  if(!node||typeof user!=='string'||typeof id!=='string')err('INVALID_REFERENCE');
  // A writer carries the epoch obtained when it was admitted.
  if(node.receipts[id])return {status:'already_committed',revision:node.receipts[id]};
  if(node.phase!=='active'||node.fencedUsers.includes(user))
   err('LOCAL_FENCE');
  node.version++;
  node.writes.push({user,id,epoch:node.epoch});
  node.receipts[id]=node.version;
  return {status:'committed',revision:node.version};
 }
 function begin(id){
  if(typeof id!=='string'||!id.length)err('INVALID_REVOCATION');
  if(global.status==='completed'){
   if(global.revocationId===id)return {status:'already_completed'};
   err('ALREADY_REVOKED');
  }
  if(global.status==='revoking'){
   if(global.revocationId===id)return {status:'already_started'};
   err('REVOCATION_IN_PROGRESS');
  }
  global={status:'revoking',epoch:global.epoch+1,revocationId:id,ack:[]};
  // In real deployment this announcement by itself does NOT stop writes.
  return {status:'started'};
 }
 function fence(inv,id,user){
  if(global.status!=='revoking'||global.revocationId!==id)err('REVOCATION_NOT_ACTIVE');
  const node=nodes[inv];if(!node||typeof user!=='string')err('INVALID_REFERENCE');
  if(!node.fencedUsers.includes(user)){
   node.fencedUsers.push(user);
   node.epoch++;node.version++;
  }
  if(!global.ack.includes(inv))global.ack.push(inv);
  return {status:'acknowledged',inv,version:node.version};
 }
 function finish(id){
  if(global.revocationId!==id||global.status!=='revoking')
   err('REVOCATION_NOT_ACTIVE');
  if(invs.some(inv=>!global.ack.includes(inv)))err('BARRIER_INCOMPLETE');
  global.status='completed';
  return {status:'completed',epoch:global.epoch};
 }
 function recover(id){
  if(global.revocationId!==id)err('REVOCATION_UNKNOWN');
  return {status:global.status,pending:invs.filter(inv=>!global.ack.includes(inv))};
 }
 return Object.freeze({get,write,begin,fence,finish,recover});
}
module.exports={createRevocationBarrierModel};
