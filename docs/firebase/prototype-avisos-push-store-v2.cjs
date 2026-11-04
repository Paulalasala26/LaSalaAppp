'use strict';
// ISOLATED, NON-DEPLOYABLE Firebase REST adapter for ViguerAPP Phase 2.
// Strictly loopback Firebase Emulator with demo-* project; NEVER live Firebase.
// Only a privileged server should adapt this to real Firebase after security review.
const crypto=require('node:crypto');
const core=require('./prototype-avisos-push-v2.cjs');
const ROOTS=Object.freeze({
  alerts:'lasala-avisos-v2',
  endpoints:'lasala-push-endpoints-v2',
  outbox:'lasala-push-outbox-v2',
  weekly:'lasala-push-weekly-v2'
});
const UID=/^lasala-[a-f0-9]{40}$/;
const SAFE_ID=/^[A-Za-z0-9_-]{1,140}$/;
const HASH=/^[a-f0-9]{64}$/;
const MAX_ALL_USERS=300, MAX_ALL_ALERTS=12000;
const fail=(status,code)=>{throw Object.assign(new Error(code),{status,code})};
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const copy=x=>JSON.parse(JSON.stringify(x));
function createDemoRestTransport({baseUrl,projectId,fetchImpl,authToken='demo-only'}={}){
  if(!/^demo-[a-z0-9-]+$/.test(projectId||''))throw new TypeError('DEMO_PROJECT_REQUIRED');
  if(typeof fetchImpl!=='function')throw new TypeError('FETCH_ADAPTER_REQUIRED');
  let uri;try{uri=new URL(baseUrl)}catch(_){throw new TypeError('LOOPBACK_EMULATOR_REQUIRED')}
  if(uri.protocol!=='http:'||!['127.0.0.1','localhost'].includes(uri.hostname)||
     uri.port!=='9000'||uri.pathname!=='/'||uri.search||uri.hash)
    throw new TypeError('LOOPBACK_EMULATOR_REQUIRED');
  const root=uri.origin;
  if(typeof authToken!=='string'||authToken.length<5)throw new TypeError('DEMO_TOKEN_REQUIRED');
  const url=(segments)=>{
    for(const s of segments){
      if(typeof s!=='string'||!SAFE_ID.test(s))fail(400,'INVALID_PATH');
    }
    return root+'/'+segments.map(encodeURIComponent).join('/')+'.json';
  };
  async function retrieve(path,withEtag=false){
    const response=await fetchImpl(url(path),{
      method:'GET',
      headers:{Authorization:'Bearer '+authToken,
        ...(withEtag?{'X-Firebase-ETag':'true'}:{})},
      cache:'no-store'
    });
    if(!response.ok)fail(503,'FIREBASE_READ_FAILED');
    const etag=withEtag?response.headers.get('etag'):null;
    if(withEtag&&!etag)fail(503,'ETAG_MISSING');
    return {value:await response.json(),etag};
  }
  async function conditionalPut(path,value,etag){
    if(typeof etag!=='string'||etag.length<1)fail(503,'ETAG_MISSING');
    const response=await fetchImpl(url(path)+'?print=silent',{
      method:'PUT',
      headers:{Authorization:'Bearer '+authToken,
        'Content-Type':'application/json','if-match':etag},
      body:JSON.stringify(value)
    });
    if(response.status===412)return false;
    if(!response.ok)fail(503,'FIREBASE_WRITE_FAILED');
    return true;
  }
  // Compare-and-set at one path. The ETag read is required even for null -> object.
  async function compareAndSwap(path,expectedVersion,value){
    if(!Number.isSafeInteger(expectedVersion)||expectedVersion<0)fail(400,'INVALID_VERSION');
    const state=await retrieve(path,true);
    if(state.value===null){
      if(expectedVersion!==0)return false;
    }else{
      if(!plain(state.value)||state.value.version!==expectedVersion)return false;
    }
    return conditionalPut(path,value,state.etag);
  }
  async function insertIfMissing(path,value){
    const state=await retrieve(path,true);
    if(state.value!==null)return false;
    return conditionalPut(path,value,state.etag);
  }
  return Object.freeze({retrieve,compareAndSwap,insertIfMissing});
}
function createDemoStore({transport,loadAuthorizedSourceEvent}={}){
  for(const fn of ['retrieve','compareAndSwap','insertIfMissing'])
    if(typeof transport?.[fn]!=='function')throw new TypeError('INVALID_TRANSPORT');
  const requireUid=u=>{if(!UID.test(u||''))fail(400,'INVALID_UID');return u};
  const requireId=i=>{if(!SAFE_ID.test(i||''))fail(400,'INVALID_ID');return i};
  const requireHash=h=>{if(!HASH.test(h||''))fail(400,'INVALID_ENDPOINT_ID');return h};
  function validateAlert(uid,id,record){
    if(!plain(record)||record.recipientUid!==uid||record.id!==id||
      !Number.isSafeInteger(record.version)||record.version<1)
      fail(400,'INVALID_ALERT_DOCUMENT');
  }
  function validateSubscription(id,record){
    if(!plain(record)||!UID.test(record.uid||'')||
      !plain(record.subscription)||core.endpointId(record.subscription.endpoint)!==id||
      !Number.isSafeInteger(record.version)||record.version<1)
      fail(400,'INVALID_SUBSCRIPTION_DOCUMENT');
  }
  async function getOwnAlerts(uid){
    requireUid(uid);
    const r=await transport.retrieve([ROOTS.alerts,uid]);
    if(r.value===null)return {};
    if(!plain(r.value))fail(503,'INVALID_STORE');
    for(const [id,record] of Object.entries(r.value))validateAlert(uid,id,record);
    return copy(r.value);
  }
  async function getAlert(uid,id){
    requireUid(uid);requireId(id);
    const r=await transport.retrieve([ROOTS.alerts,uid,id]);
    if(r.value!==null)validateAlert(uid,id,r.value);
    return r.value===null?null:copy(r.value);
  }
  async function compareAndSwapAlert(uid,id,expectedVersion,next){
    requireUid(uid);requireId(id);validateAlert(uid,id,next);
    if(next.version!==expectedVersion+1)fail(400,'INVALID_VERSION_STEP');
    // An update must never CREATE an existing user's alert: version starts at 1,
    // and create is exclusively the migration / queued-delivery path.
    if(expectedVersion<1)fail(400,'INVALID_VERSION');
    return transport.compareAndSwap([ROOTS.alerts,uid,id],expectedVersion,next);
  }
  async function insertAlert(uid,id,record){
    requireUid(uid);requireId(id);validateAlert(uid,id,record);
    if(record.version!==1)fail(400,'INVALID_INITIAL_VERSION');
    return transport.insertIfMissing([ROOTS.alerts,uid,id],record);
  }
  async function getSubscription(id){
    requireHash(id);
    const {value}=await transport.retrieve([ROOTS.endpoints,id]);
    if(value!==null)validateSubscription(id,value);
    return value===null?null:copy(value);
  }
  async function compareAndSwapSubscription(id,expectedVersion,next){
    requireHash(id);
    if(next!==null){
      validateSubscription(id,next);
      if(next.version!==expectedVersion+1)fail(400,'INVALID_VERSION_STEP');
    }
    return transport.compareAndSwap([ROOTS.endpoints,id],expectedVersion,next);
  }
  async function insertSubscription(id,record){
    requireHash(id);validateSubscription(id,record);
    if(record.version!==1)fail(400,'INVALID_INITIAL_VERSION');
    return transport.insertIfMissing([ROOTS.endpoints,id],record);
  }
  async function enqueueNotification(key,event){
    requireId(key);
    if(!plain(event)||!UID.test(event.recipientUid||'')||
      !UID.test(event.actorUid||''))fail(400,'INVALID_NOTIFICATION');
    return transport.insertIfMissing([ROOTS.outbox,key],{...copy(event),version:1});
  }
  async function enqueueWeeklyReminder(key,events){
    requireId(key);
    if(!Array.isArray(events)||events.length!==2||
      events.some(x=>!plain(x)||!UID.test(x.recipientUid||'')))fail(400,'INVALID_WEEKLY');
    return transport.insertIfMissing([ROOTS.weekly,key],{events:copy(events),version:1});
  }
  async function getAllAlerts(){
    const {value}=await transport.retrieve([ROOTS.alerts]);
    if(value===null)return {};
    if(!plain(value)||Object.keys(value).length>MAX_ALL_USERS)fail(503,'INVALID_STORE');
    let count=0;
    for(const [uid,records] of Object.entries(value)){
      requireUid(uid);
      if(!plain(records))fail(503,'INVALID_STORE');
      for(const [id,record] of Object.entries(records)){
        validateAlert(uid,id,record);
        if(++count>MAX_ALL_ALERTS)fail(503,'TOO_MANY_ALERTS');
      }
    }
    return copy(value);
  }
  async function getSourceEvent(kind,referenceId){
    if(typeof loadAuthorizedSourceEvent!=='function')fail(503,'EVENT_SOURCE_NOT_CONFIGURED');
    if(!SAFE_ID.test(kind||'')||!SAFE_ID.test(referenceId||''))fail(400,'INVALID_REFERENCE');
    return loadAuthorizedSourceEvent(kind,referenceId);
  }
  return Object.freeze({getOwnAlerts,getAlert,compareAndSwapAlert,insertAlert,
    getSubscription,compareAndSwapSubscription,insertSubscription,
    enqueueNotification,enqueueWeeklyReminder,getAllAlerts,getSourceEvent});
}
module.exports={createDemoRestTransport,createDemoStore,ROOTS};
