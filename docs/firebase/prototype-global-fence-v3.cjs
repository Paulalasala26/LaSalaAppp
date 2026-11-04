'use strict';
// §0.248 - ISOLATED pure prototype. No Firebase network, SDK or deployment.
// Global user revocation and per-INV commits share a SINGLE CAS root.
// This has scaling limits and is not an operational migration proposal.
const crypto=require('node:crypto');
const ID=/^[A-Za-z0-9_-]{1,140}$/;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const copy=x=>structuredClone(x);
const deny=code=>{throw Object.assign(new Error(code),{code});};
function valid(x){return typeof x==='string'&&ID.test(x)&&
 !['__proto__','constructor','prototype'].includes(x)}
function createGlobalFencePrototype({transport,auth,maxAttempts=8}={}){
 if(typeof transport?.retrieve!=='function'||
    typeof transport?.compareAndSwap!=='function'||
    typeof auth?.verifyIdentity!=='function'||
    !Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>16)
   throw new TypeError('ISOLATED_DEPENDENCIES_REQUIRED');
 async function mutate(request,action){
  if(!plain(request)||!valid(request.invId)||!valid(request.id)||
     typeof request.token!=='string')deny('INVALID_REQUEST');
  const identity=await auth.verifyIdentity(request.token);
  if(!valid(identity?.uid))deny('UNVERIFIED_IDENTITY');
  for(let tries=0;tries<maxAttempts;tries++){
   const read=await transport.retrieve(['lasala-global-fence-demo-v1'],true);
   const state=read?.value;
   if(!plain(state)||!Number.isSafeInteger(state.version)||
      !plain(state.sessions)||!plain(state.invernaderos)||!read.etag)
     deny('INVALID_AUTHORITY');
   const session=state.sessions[identity.uid];
   if(!plain(session)||session.active!==true)deny('GLOBAL_SESSION_REVOKED');
   const inv=state.invernaderos[request.invId];
   if(!plain(inv)||!plain(inv.acl)||!plain(inv.grid)||!plain(inv.receipts))
     deny('INVALID_INV');
   const actor=inv.acl[identity.uid];
   if(!plain(actor)||actor.active!==true)deny('INV_ACCESS_REVOKED');
   const digest=crypto.createHash('sha256').update(JSON.stringify([
     action,identity.uid,request.invId,request.id,
     request.cellKey??null,request.newText??null,request.targetUid??null
   ])).digest('hex');
   const existing=inv.receipts[request.id];
   if(existing){
    if(existing.digest!==digest)deny('RECEIPT_CONFLICT');
    return {status:'already_committed',revision:existing.revision};
   }
   const next=copy(state),ninv=next.invernaderos[request.invId];
   if(action==='commit'){
    if(!valid(request.cellKey)||typeof request.newText!=='string'||
       request.newText.length>250||!Object.hasOwn(inv.grid,request.cellKey))
      deny('INVALID_EDIT');
    if(!Array.isArray(actor.ops)||!actor.ops.includes('EDIT_RIEGO'))
      deny('OP_NOT_PERMITTED');
    ninv.grid[request.cellKey]=request.newText;
   }else if(action==='revoke'){
    if(actor.grantManager!==true||!valid(request.targetUid)||
       !plain(state.sessions[request.targetUid]))deny('GRANT_MANAGER_REQUIRED');
    if(request.targetUid===identity.uid)deny('CANNOT_REVOKE_SELF');
    next.sessions[request.targetUid]={...state.sessions[request.targetUid],active:false};
    next.globalEpoch=(state.globalEpoch||0)+1;
   }else deny('INVALID_ACTION');
   next.version++;
   ninv.receipts[request.id]={digest,revision:next.version};
   const success=await transport.compareAndSwap(
     ['lasala-global-fence-demo-v1'],state.version,next);
   if(success===true)return {status:'committed',revision:next.version};
   if(success!==false)deny('INVALID_CAS');
  }
  deny('CAS_EXHAUSTED');
 }
 return Object.freeze({
  commit:r=>mutate(r,'commit'),
  revoke:r=>mutate(r,'revoke')
 });
}
module.exports={createGlobalFencePrototype};
