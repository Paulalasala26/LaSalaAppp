'use strict';
// ISOLATED ONLY: real Firebase RTDB emulator HTTP + existing admin-users JWT verifier.
// Zero service account credentials, zero real Firebase URLs, no deployable API.
const crypto=require('node:crypto');
const helpers=require('../../api/admin-users')._adminCatalogHelpers;
const {createDemoStore}=require('./prototype-avisos-push-store-v2.cjs');
const PROJECT='demo-lasala-phase2-alerts';
const NAMESPACE=PROJECT+'-default-rtdb';
const HOST='127.0.0.1:9000';
const VALID_ID=/^[A-Za-z0-9_-]{1,140}$/;
const VALID_HASH=/^[a-f0-9]{64}$/;
const URL_BASE='http://127.0.0.1:9000/';
function ensureLocal(){
  if(process.env.FIREBASE_DATABASE_EMULATOR_HOST!==HOST)
    throw new Error('LOCAL_EMULATOR_ONLY');
  if(process.env.GCLOUD_PROJECT&&process.env.GCLOUD_PROJECT!==PROJECT)
    throw new Error('DEMO_PROJECT_ONLY');
  if(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    throw new Error('REAL_SERVICE_CREDENTIALS_FORBIDDEN');
}
const err=(status,code)=>Object.assign(new Error(code),{status,code});
function makeEmulatorTransport({fetchImpl=fetch}={}){
  ensureLocal();
  if(typeof fetchImpl!=='function')throw new TypeError('INVALID_FETCH');
  function address(segments,extra=''){
    if(!Array.isArray(segments)||!segments.length||segments.some(s=>!VALID_ID.test(s)))
      throw err(400,'INVALID_PATH');
    // Both ns and owner are for official local emulator ONLY. Never re-use in production.
    const params=new URLSearchParams({ns:NAMESPACE,auth:'owner'});
    if(extra)params.set('print',extra);
    return URL_BASE+segments.map(encodeURIComponent).join('/')+'.json?'+params;
  }
  async function retrieve(segments,etag=false){
    const r=await fetchImpl(address(segments),{
      method:'GET',cache:'no-store',
      headers:etag?{'X-Firebase-ETag':'true'}:{}
    });
    if(!r.ok)throw err(503,'EMULATOR_READ_'+r.status);
    const tag=etag?r.headers.get('ETag'):null;
    if(etag&&!tag)throw err(503,'ETAG_MISSING');
    return {value:await r.json(),etag:tag};
  }
  async function conditionalPut(segments,value,etag){
    if(typeof etag!=='string'||etag.length===0)throw err(503,'ETAG_MISSING');
    const r=await fetchImpl(address(segments,'silent'),{
      method:'PUT',headers:{'Content-Type':'application/json','if-match':etag},
      body:JSON.stringify(value)
    });
    if(r.status===412)return false;
    if(!r.ok)throw err(503,'EMULATOR_WRITE_'+r.status);
    return true;
  }
  async function compareAndSwap(segments,expectedVersion,next){
    if(!Number.isSafeInteger(expectedVersion)||expectedVersion<0)throw err(400,'INVALID_VERSION');
    const current=await retrieve(segments,true);
    if(current.value===null?expectedVersion!==0:
      !current.value||typeof current.value!=='object'||
      current.value.version!==expectedVersion)return false;
    return conditionalPut(segments,next,current.etag);
  }
  async function insertIfMissing(segments,next){
    const current=await retrieve(segments,true);
    if(current.value!==null)return false;
    return conditionalPut(segments,next,current.etag);
  }
  async function removeSynthetic(segments){
    // Cleanup only for specific TEST-ONLY keys; never a DELETE to the root.
    if(segments.length!==1||!['lasala-avisos-usuario-v1','lasala-push-subs-v1',
      'lasala-roles-v1','lasala-users-v1','lasala-avisos-v2',
      'lasala-push-endpoints-v2','lasala-push-outbox-v2','lasala-push-weekly-v2'].includes(segments[0]))
      throw err(400,'CLEANUP_NOT_ALLOWED');
    const r=await fetchImpl(address(segments),{method:'DELETE'});
    if(!r.ok)throw err(503,'EMULATOR_CLEANUP_FAILED');
  }
  async function seedSynthetic(segments,value){
    if(segments.length!==1||!['lasala-roles-v1','lasala-users-v1',
      'lasala-avisos-usuario-v1','lasala-push-subs-v1'].includes(segments[0]))
      throw err(400,'SEED_NOT_ALLOWED');
    const existing=await retrieve(segments,true);
    return conditionalPut(segments,value,existing.etag);
  }
  return Object.freeze({retrieve,conditionalPut,compareAndSwap,insertIfMissing,
    removeSynthetic,seedSynthetic});
}
function makeBackendAuth(transport,{verifyToken=helpers.verifyFirebaseIdToken}={}){
  if(typeof verifyToken!=='function')throw new TypeError('VERIFIER_REQUIRED');
  if(typeof transport?.retrieve!=='function')throw new TypeError('TRANSPORT_REQUIRED');
  async function verifyIdentity(token){
    // Real signature/JWKS/project/UID validation code in api/admin-users.js.
    // Test runner supplies synthetic RSA JWT and stubbed JWKS, not a live Google key.
    const appUser=await verifyToken(token);
    if(typeof appUser!=='string')throw err(401,'UNAUTHORIZED');
    return {appUser,uid:'lasala-'+crypto.createHash('sha256')
      .update(appUser,'utf8').digest('hex').slice(0,40)};
  }
  async function loadRole(user){
    const {value}=await transport.retrieve(['lasala-roles-v1']);
    return value&&typeof value==='object'?value[user]||null:null;
  }
  async function loadAccount(user){
    const {value}=await transport.retrieve(['lasala-users-v1']);
    const hash=value&&typeof value==='object'?value[user]:null;
    return typeof hash==='string'&&VALID_HASH.test(hash);
  }
  return Object.freeze({verifyIdentity,loadRole,loadAccount});
}
function createIntegratedDemoApi({transport,verifyToken,authorizeEvent=async()=>false,
  cronSecret=()=>undefined,now}={}){
  const auth=makeBackendAuth(transport,{verifyToken});
  const store=createDemoStore({transport});
  const {createAvisosPushApi}=require('./prototype-avisos-push-api-v2.cjs');
  return createAvisosPushApi({...auth,storage:store,authorizeEvent,cronSecret,...(now?{now}:{})});
}
module.exports={PROJECT,NAMESPACE,makeEmulatorTransport,makeBackendAuth,createIntegratedDemoApi};
