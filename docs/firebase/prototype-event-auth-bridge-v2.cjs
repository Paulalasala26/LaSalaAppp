'use strict';
// Isolated phase-2 security adapter. No HTTP endpoint or Firebase production access.
// Identity comes from makeBackendAuth.verifyIdentity(token); roles and account state
// are re-read from emulator transport on every authorization attempt.
const {uidForName}=require('./prototype-avisos-push-v2.cjs');
const {authorize}=require('./prototype-event-authorization-v2.cjs');
const ROLES=new Set(['ADMIN','TECNICO','REGANTE','PEON','CARGADOR']);
const NAME=/^[A-Z0-9._ -]{1,80}$/;
function reject(code){throw Object.assign(new Error(code),{code});}
function decodeLegacy(value){
 let v=value;
 if(typeof v==='string'){try{v=JSON.parse(v)}catch(_){reject('INVALID_AUTH_STORE')}}
 if(v===null)return {};
 if(!v||Array.isArray(v)||typeof v!=='object')reject('INVALID_AUTH_STORE');
 return v;
}
function active(hash){return typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash)}
function validName(name){return typeof name==='string'&&NAME.test(name)&&name===name.trim()}
function createEmulatorAuthorizationBridge({auth,transport,loadTrustedSource,resolveTrustedScope,approved=false}={}){
 if(!auth||typeof auth.verifyIdentity!=='function'||typeof transport?.retrieve!=='function')throw new TypeError('VERIFIED_AUTH_AND_TRANSPORT_REQUIRED');
 if(typeof loadTrustedSource!=='function'||typeof resolveTrustedScope!=='function')throw new TypeError('TRUSTED_SOURCE_RESOLVERS_REQUIRED');
 return async function check(token,request){
  if(!request||Object.keys(request).sort().join('|')!=='kind|referenceId')reject('UNTRUSTED_REQUEST');
  const identity=await auth.verifyIdentity(token);
  if(!validName(identity?.appUser)||identity.uid!==uidForName(identity.appUser))reject('INVALID_IDENTITY');
  const [rolesData,usersData]=await Promise.all([
   transport.retrieve(['lasala-roles-v1']),transport.retrieve(['lasala-users-v1'])
  ]);
  const roles=decodeLegacy(rolesData.value),users=decodeLegacy(usersData.value);
  const role=roles[identity.appUser];
  if(!ROLES.has(role)||!active(users[identity.appUser]))reject('ACTOR_DISABLED');
  const actor={name:identity.appUser,uid:identity.uid,role,active:true,verified:true};
  const source=await loadTrustedSource(request,actor);
  // The resolver must establish event source, original actor and committed transition.
  if(!source?.serverVerified||!source.persisted)reject('SOURCE_NOT_VERIFIED');
  const scope=await resolveTrustedScope(actor,source);
  if(!scope?.serverVerified)reject('SCOPE_NOT_VERIFIED');
  const accounts={};
  for(const [name,r] of Object.entries(roles)){
   if(!validName(name)||!ROLES.has(r))continue;
   accounts[name]={name,uid:uidForName(name),role:r,active:active(users[name]),serverVerified:true};
  }
  return authorize({actor,request,source,accounts,scope,approval:approved});
 };
}
module.exports={createEmulatorAuthorizationBridge};
