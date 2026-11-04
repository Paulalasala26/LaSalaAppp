'use strict';
// §0.239 — ISOLATED BACKEND POLICY PROTOTYPE. NO OPERATIVE API/ROUTES.
// Role, account, assignment, catalog, source and fence must be re-read from
// trusted server stores on EACH attempt; no client claims are trusted.
// A positive authorization result is NOT a commit capability. Transaction
// code must check epoch/role/permissions against the committed write boundary.
const {uidForName}=require('./prototype-avisos-push-v2.cjs');
const {REGANTES}=require('./prototype-event-resolvers-v2.cjs');
const ROLES=new Set(['ADMIN','TECNICO','REGANTE','PEON','CARGADOR']);
const N=/^[A-Z0-9._ -]{1,80}$/, ID=/^[A-Za-z0-9_-]{1,140}$/;
const HASH=/^[a-f0-9]{64}$/;
const p=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const deny=code=>{throw Object.assign(new Error(code),{code})};
const id=x=>typeof x==='string'&&ID.test(x)&&
 !['__proto__','prototype','constructor'].includes(x);
const validName=x=>typeof x==='string'&&N.test(x)&&x===x.trim()&&
 !['__PROTO__','CONSTRUCTOR','PROTOTYPE'].includes(x);
const POLICY=Object.freeze({
 READ_RIEGO:{roles:['ADMIN','TECNICO','REGANTE'],read:true,phase:'any'},
 EDIT_RIEGO:{roles:['ADMIN','TECNICO'],phase:'v3_active'},
 DELETE_RIEGO:{roles:['ADMIN','TECNICO'],phase:'v3_active'},
 CREATE_PROPOSAL:{roles:['TECNICO'],phase:'v3_active',source:'new_proposal'},
 ACCEPT_PROPOSAL:{roles:['ADMIN'],user:'VIGUERAS',phase:'v3_active',source:'pending_proposal'},
 ACCEPT_PROPOSAL_EDITED:{roles:['ADMIN'],user:'VIGUERAS',phase:'v3_active',source:'pending_proposal'},
 REJECT_PROPOSAL:{roles:['ADMIN'],user:'VIGUERAS',phase:'v3_active',source:'pending_proposal'},
 MARK_LEAVES:{roles:['TECNICO'],phase:'v3_active'},
 CORRECT_LEAVES:{roles:['ADMIN'],user:'VIGUERAS',phase:'v3_active'},
 REPORT_RIEGO_PROBLEM:{roles:['REGANTE'],phase:'v3_active',source:'current_riego'},
 RESOLVE_RIEGO_PROBLEM:{roles:['TECNICO'],phase:'v3_active',source:'assigned_problem'},
 MARK_RIEGO_EXECUTED:{roles:['REGANTE'],phase:'v3_active',source:'current_riego'}
});
const HARD_DENY=new Set(['LEGACY_DIRECT_WRITE','LEGACY_INDEX_WRITE',
 'LEGACY_PROPOSALS_GLOBAL_WRITE','REPLAY_LEGACY_OFFLINE']);
function legacyMap(raw){
 let x=raw;
 if(typeof x==='string'){try{x=JSON.parse(x)}catch(_){deny('INVALID_AUTH_STORE')}}
 if(!p(x))deny('INVALID_AUTH_STORE');
 return x;
}
function classifyWriteFailure(error){
 const status=Number(error?.status??error?.statusCode??error?.response?.status);
 const code=typeof error?.code==='string'?error.code.toUpperCase():'';
 if(status===401||['UNAUTHENTICATED','AUTH_EXPIRED','TOKEN_EXPIRED','UNAUTHORIZED'].includes(code))
  return Object.freeze({action:'REAUTH_HOLD',retry:false,retainLocal:true,markSaved:false});
 if(status===403||['PERMISSION_DENIED','AUTHORIZATION_DENIED','FROZEN','WRITER_FENCED'].includes(code))
  return Object.freeze({action:'DENIED_HOLD',retry:false,retainLocal:true,markSaved:false});
 if(status===409||status===412||['ETAG_CONFLICT','VERSION_CONFLICT','FENCE_CELL_CONFLICT'].includes(code))
  return Object.freeze({action:'RECONCILE_HOLD',retry:false,retainLocal:true,markSaved:false});
 if(status===400||status===422||['VALIDATION_FAILED','INVALID_COMMAND'].includes(code))
  return Object.freeze({action:'INVALID_HOLD',retry:false,retainLocal:true,markSaved:false});
 if([408,425,429,500,502,503,504].includes(status)||
    ['NETWORK_ERROR','ECONNRESET','ETIMEDOUT','TIMEOUT','UNAVAILABLE'].includes(code))
  return Object.freeze({action:'TRANSIENT_BACKOFF',retry:true,retainLocal:true,markSaved:false});
 return Object.freeze({action:'UNKNOWN_HOLD',retry:false,retainLocal:true,markSaved:false});
}
function inspectLegacyOfflineEntry(entry){
 // Actual localStorage queue uses {clave,usuario,invId,dia,calle,base,deseado}.
 // It has neither a server command receipt nor an epoch/authorization proof.
 if(!p(entry)||!id(entry.invId)||!validName(entry.usuario)||
    typeof entry.dia!=='string'||typeof entry.calle!=='string')
  return Object.freeze({action:'INVALID_HOLD',automaticReplay:false,retainLocal:true});
 return Object.freeze({action:'RECONCILE_LEGACY_OFFLINE',automaticReplay:false,retainLocal:true});
}
function createDemoRiegoCommandAuthorizer({
 auth,transport,loadTrustedCommand,loadTrustedFence,approved=false
}={}){
 if(typeof auth?.verifyIdentity!=='function'||
    typeof transport?.retrieve!=='function'||
    typeof loadTrustedCommand!=='function'||typeof loadTrustedFence!=='function')
  throw new TypeError('TRUSTED_BACKEND_DEPENDENCIES_REQUIRED');
 return async function authorize(token,request){
  if(!p(request)||Object.keys(request).sort().join('|')!=='op|referenceId'||
     !id(request.referenceId)||typeof request.op!=='string')
   deny('UNTRUSTED_COMMAND_REQUEST');
  if(HARD_DENY.has(request.op))deny('LEGACY_WRITER_UNSUPPORTED');
  const policy=POLICY[request.op];
  if(!policy)deny('UNKNOWN_RIEGO_OPERATION');
  if(approved!==true)deny('MANAGER_APPROVAL_REQUIRED');
  const identity=await auth.verifyIdentity(token);
  if(!validName(identity?.appUser)||identity?.uid!==uidForName(identity.appUser))
   deny('INVALID_BACKEND_IDENTITY');
  const [rolesResult,usersResult,catResult,assignmentResult]=await Promise.all([
   transport.retrieve(['lasala-roles-v1']),
   transport.retrieve(['lasala-users-v1']),
   transport.retrieve(['lasala-invernaderos-catalog-v2']),
   transport.retrieve(['lasala-event-permissions-v2'])
  ]);
  const roles=legacyMap(rolesResult?.value),users=legacyMap(usersResult?.value);
  const role=Object.hasOwn(roles,identity.appUser)?roles[identity.appUser]:null;
  if(!ROLES.has(role)||!HASH.test(users[identity.appUser]||''))
   deny('ACTOR_DISABLED_OR_ROLE_INVALID');
  if(!policy.roles.includes(role)||policy.user&&policy.user!==identity.appUser)
   deny('ROLE_NOT_ALLOWED_FOR_OPERATION');
  const catalog=catResult?.value,config=assignmentResult?.value;
  if(!p(catalog)||catalog.schema!=='lasala-inv-catalog-v2'||!p(catalog.invernaderos)||
     !p(config)||config.schema!=='lasala-event-permissions-v2'||
     config.approvedByBackoffice!==true||!p(config.actors))
   deny('UNAPPROVED_RIEGO_ASSIGNMENTS');
  const conf=Object.hasOwn(config.actors,identity.appUser)?config.actors[identity.appUser]:null;
  if(!p(conf)||conf.approved!==true||conf.role!==role||
     !Array.isArray(conf.allowedInvIds)||!Array.isArray(conf.allowedSalas)||
     (policy.read?conf.canReadRiego!==true:conf.canWriteRiego!==true))
   deny('ACTOR_SCOPE_NOT_APPROVED');
  const actor=Object.freeze({name:identity.appUser,uid:identity.uid,role});
  // Never take invIds, state, expected epoch, recipient or editor from request.
  const source=await loadTrustedCommand(request,actor);
  if(!p(source)||source.serverVerified!==true||source.persisted!==true||
     source.referenceId!==request.referenceId||source.op!==request.op||
     !Array.isArray(source.invIds)||!source.invIds.length||
     source.invIds.length>50||new Set(source.invIds).size!==source.invIds.length||
     source.invIds.some(x=>!id(x)))
   deny('UNVERIFIED_COMMAND_SOURCE');
  if(source.actorUid!==identity.uid)deny('COMMAND_ACTOR_MISMATCH');
  if(policy.source==='pending_proposal'&&
     !(source.proposalState==='pendiente'&&source.proposalPersisted===true))
   deny('PROPOSAL_STATE_NOT_PENDING');
  if(policy.source==='new_proposal'&&
     !(source.originalCellWasQuestion===true&&source.proposalPersisted===true))
   deny('INVALID_PROPOSAL_ORIGIN');
  if(policy.source==='current_riego'&&source.riegoDayConfirmedByServer!==true)
   deny('UNVERIFIED_RIEGO_DAY');
  if(policy.source==='assigned_problem'&&
     !(source.problemPersisted===true&&source.assignedTechnician===identity.appUser))
   deny('PROBLEM_NOT_ASSIGNED');
  for(const invId of source.invIds){
   if(!Object.hasOwn(catalog.invernaderos,invId))deny('UNKNOWN_OR_INACTIVE_INV');
   const inv=catalog.invernaderos[invId];
   if(!p(inv)||inv.active!==true||!/^sala[1-5]$/.test(inv.sala))
    deny('UNKNOWN_OR_INACTIVE_INV');
   if(!conf.allowedInvIds.includes(invId)&&!conf.allowedSalas.includes(inv.sala))
    deny('INV_NOT_ASSIGNED');
   if(role==='REGANTE'){
    const rooms=REGANTES[identity.appUser];
    if(!rooms||!rooms.includes(inv.sala))deny('REGANTE_OUT_OF_SCOPE');
   }
  }
  const epochs={};
  for(const invId of source.invIds){
   const fence=await loadTrustedFence(invId,actor,request.op);
   if(!p(fence)||fence.serverVerified!==true||fence.enforcedByBackend!==true||
      !Number.isSafeInteger(fence.epoch)||fence.epoch<0||
      typeof fence.phase!=='string')
    deny('UNVERIFIED_WRITER_FENCE');
   if(!policy.read&&fence.phase!=='v3_active')deny('INV_WRITES_FROZEN');
   if(policy.read&&!['legacy','freezing','frozen','v3_active','rollback_hold'].includes(fence.phase))
    deny('INVALID_READ_FENCE');
   epochs[invId]=fence.epoch;
  }
  // Advisory only: no permission granted to write RTDB from browser.
  return Object.freeze({
   authorized:true,operation:request.op,actorUid:identity.uid,
   invIds:Object.freeze([...source.invIds]),fenceEpochs:Object.freeze(epochs),
   serverRevalidationRequiredAtCommit:true,outboxNotAuthorizedByThisResult:true
  });
 };
}
module.exports={POLICY,HARD_DENY,classifyWriteFailure,inspectLegacyOfflineEntry,
 createDemoRiegoCommandAuthorizer};
