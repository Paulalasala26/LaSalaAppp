'use strict';
// ISOLATED MIGRATION PROTOTYPE. No live Firebase, no destructive operations.
// Legacy v1 remains the authoritative source until separately approved cutover.
const crypto=require('node:crypto');
const {uidForName,endpointId}=require('./prototype-avisos-push-v2.cjs');
const LEGACY=Object.freeze({alerts:'lasala-avisos-usuario-v1',push:'lasala-push-subs-v1'});
const VALID_USER=/^[A-Z0-9][A-Z0-9._ -]{0,79}$/;
const VALID_ID=/^[A-Za-z0-9_-]{1,140}$/;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const fail=(code)=>{throw Object.assign(new Error(code),{code})};
const clone=v=>JSON.parse(JSON.stringify(v));
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v),'utf8').digest('hex');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function parseLegacy(raw,key){
  if(raw===null)return {};
  let value=raw;
  if(typeof value==='string'){
    try{value=JSON.parse(value)}catch(_){fail('INVALID_LEGACY_JSON')}
  }
  if(!plain(value))fail('INVALID_LEGACY_ROOT');
  if(Object.keys(value).length>300)fail('TOO_MANY_USERS');
  for(const [user,items] of Object.entries(value)){
    if(!VALID_USER.test(user)||!Array.isArray(items)||items.length>500)
      fail('INVALID_LEGACY_USER');
  }
  return value;
}
function planMigration({legacyAlerts,legacyPush,sourceEtags}){
  const alerts=parseLegacy(legacyAlerts,LEGACY.alerts);
  const push=parseLegacy(legacyPush,LEGACY.push);
  if(!sourceEtags||typeof sourceEtags.alerts!=='string'||!sourceEtags.alerts||
     typeof sourceEtags.push!=='string'||!sourceEtags.push)
    fail('SOURCE_ETAG_REQUIRED');
  const plannedAlerts=[],plannedPush=[],seenEndpoints=new Map();
  let total=0;
  for(const user of Object.keys(alerts).sort()){
    const uid=uidForName(user);
    const ids=new Set();
    for(const a of alerts[user]){
      if(++total>12000)fail('TOO_MANY_ALERTS');
      if(!plain(a)||typeof a.id!=='string'||!VALID_ID.test(a.id))
        fail('INVALID_LEGACY_ALERT');
      if(ids.has(a.id))fail('DUPLICATE_LEGACY_ALERT');
      ids.add(a.id);
      const record={...clone(a),id:a.id,recipientUid:uid,version:1,
        migratedFrom:'lasala-avisos-usuario-v1'};
      plannedAlerts.push({uid,id:a.id,record});
    }
  }
  for(const user of Object.keys(push).sort()){
    const uid=uidForName(user);
    for(const sub of push[user]){
      if(!plain(sub)||typeof sub.endpoint!=='string'||sub.endpoint.length>2048||
        !/^https:\/\//.test(sub.endpoint)||typeof sub.keys?.auth!=='string'||
        typeof sub.keys?.p256dh!=='string'||
        sub.keys.auth.length<8||sub.keys.p256dh.length<16)
        fail('INVALID_LEGACY_PUSH');
      const sid=endpointId(sub.endpoint);
      const previous=seenEndpoints.get(sid);
      if(previous){
        if(previous.uid!==uid)fail('SHARED_ENDPOINT_OWNER_CONFLICT');
        if(!equal(previous.subscription,sub))fail('DUPLICATE_ENDPOINT_KEYS_CONFLICT');
        continue;
      }
      seenEndpoints.set(sid,{uid,subscription:sub});
      plannedPush.push({id:sid,record:{uid,subscription:clone(sub),version:1}});
    }
  }
  plannedAlerts.sort((a,b)=>a.uid.localeCompare(b.uid)||a.id.localeCompare(b.id));
  plannedPush.sort((a,b)=>a.id.localeCompare(b.id));
  return Object.freeze({
    sourceEtags:Object.freeze({...sourceEtags}),
    sourceHash:Object.freeze({alerts:hash(legacyAlerts),push:hash(legacyPush)}),
    alerts:plannedAlerts,push:plannedPush,
    counts:Object.freeze({recipients:Object.keys(alerts).length,
      alerts:plannedAlerts.length,push:plannedPush.length})
  });
}
async function loadMigrationPlan(transport){
  if(typeof transport?.retrieve!=='function')throw new TypeError('INVALID_TRANSPORT');
  const [alerts,push]=await Promise.all([
    transport.retrieve([LEGACY.alerts],true),
    transport.retrieve([LEGACY.push],true)
  ]);
  return planMigration({legacyAlerts:alerts.value,legacyPush:push.value,
    sourceEtags:{alerts:alerts.etag,push:push.etag}});
}
async function sameLegacySource(transport,plan){
  const [a,p]=await Promise.all([
    transport.retrieve([LEGACY.alerts],true),
    transport.retrieve([LEGACY.push],true)
  ]);
  return a.etag===plan.sourceEtags.alerts&&p.etag===plan.sourceEtags.push&&
    hash(a.value)===plan.sourceHash.alerts&&hash(p.value)===plan.sourceHash.push;
}
async function executeDemoMigration({transport,store,plan,approvedForDemo=false,dryRun=true}={}){
  if(!transport||!store||!plan||!Array.isArray(plan.alerts)||!Array.isArray(plan.push))
    throw new TypeError('INVALID_MIGRATION');
  const checks=['getAlert','getSubscription','insertAlert','insertSubscription'];
  if(checks.some(k=>typeof store[k]!=='function'))throw new TypeError('INVALID_STORE');
  if(!(await sameLegacySource(transport,plan)))
    fail('SOURCE_CHANGED_BEFORE_MIGRATION');
  // Preflight EVERYTHING: never partially write when a conflict is already known.
  let presentAlerts=0,presentPush=0;
  for(const a of plan.alerts){
    const prior=await store.getAlert(a.uid,a.id);
    if(prior!==null){
      if(!equal(prior,a.record))fail('ALERT_MIGRATION_CONFLICT');
      presentAlerts++;
    }
  }
  for(const p of plan.push){
    const prior=await store.getSubscription(p.id);
    if(prior!==null){
      if(!equal(prior,p.record))fail('PUSH_MIGRATION_CONFLICT');
      presentPush++;
    }
  }
  if(!(await sameLegacySource(transport,plan)))
    fail('SOURCE_CHANGED_DURING_PREFLIGHT');
  if(dryRun)return {dryRun:true,ready:true,...plan.counts,
    wouldCreateAlerts:plan.alerts.length-presentAlerts,
    wouldCreatePush:plan.push.length-presentPush};
  if(approvedForDemo!==true)fail('DEMO_APPROVAL_REQUIRED');
  let createdAlerts=0,createdPush=0;
  for(const a of plan.alerts){
    const existing=await store.getAlert(a.uid,a.id);
    if(existing!==null){
      if(!equal(existing,a.record))fail('ALERT_MIGRATION_CONFLICT');
      continue;
    }
    if(await store.insertAlert(a.uid,a.id,a.record))createdAlerts++;
    else {
      const raced=await store.getAlert(a.uid,a.id);
      if(!equal(raced,a.record))fail('ALERT_CAS_CONFLICT');
    }
  }
  for(const p of plan.push){
    const existing=await store.getSubscription(p.id);
    if(existing!==null){
      if(!equal(existing,p.record))fail('PUSH_MIGRATION_CONFLICT');
      continue;
    }
    if(await store.insertSubscription(p.id,p.record))createdPush++;
    else {
      const raced=await store.getSubscription(p.id);
      if(!equal(raced,p.record))fail('PUSH_CAS_CONFLICT');
    }
  }
  const sourceUnchanged=await sameLegacySource(transport,plan);
  return {dryRun:false,createdAlerts,createdPush,sourceUnchanged,
    complete:sourceUnchanged,
    // Never delete v1 data, disable its writers or assert migration complete
    // when old clients could still write. A follow-up reconciliation is mandatory.
    requiresCutoverReconciliation:true};
}
module.exports={LEGACY,planMigration,loadMigrationPlan,executeDemoMigration};
