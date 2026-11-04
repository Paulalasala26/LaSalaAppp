'use strict';
// §0.235 — PURE SYNTHETIC DRY-RUN. No Firebase adapter, filesystem, network or writes.
// The returned report contains counts/hashes and hashed references, never data rows.
// projectLegacy() is ONLY for constructing synthetic test candidates; do not use
// either function with production data without a separate approved, isolated tool.
const crypto=require('node:crypto');
const SAFE=/^[A-Za-z0-9_-]{1,140}$/;
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const STATES=new Set(['pendiente','aceptada','rechazada']);
const bare=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const fail=code=>{throw Object.assign(new Error(code),{code})};
const digest=x=>crypto.createHash('sha256').update(x,'utf8').digest('hex');
const refHash=x=>digest(String(x)).slice(0,16);
const sorted=x=>{
 if(Array.isArray(x))return x.map(sorted);
 if(bare(x))return Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])]));
 return x;
};
const canonical=x=>JSON.stringify(sorted(x));
const hash=x=>digest(canonical(x));
const copy=x=>JSON.parse(JSON.stringify(x));
const mapEntries=e=>Object.fromEntries(e);
const protectedKey=x=>['__proto__','prototype','constructor'].includes(x);
const validId=x=>typeof x==='string'&&SAFE.test(x)&&!protectedKey(x);
function addIssue(issues,code,domain,reference=''){
 issues.push({code,domain,referenceHash:reference?refHash(reference):null});
}
function jsonRoot(raw,type,domain,issues,ref=''){
 if(typeof raw!=='string'){addIssue(issues,'SOURCE_NOT_JSON_STRING',domain,ref);return null;}
 let parsed;
 try{parsed=JSON.parse(raw)}catch(_){addIssue(issues,'SOURCE_MALFORMED_JSON',domain,ref);return null;}
 if(type==='array'&&!Array.isArray(parsed)||
    type==='object'&&!bare(parsed)){
  addIssue(issues,'SOURCE_INVALID_SHAPE',domain,ref);return null;
 }
 return parsed;
}
function checkEtags(snapshot,issues){
 if(!bare(snapshot.etags)||!bare(snapshot.etags.shards)){
  addIssue(issues,'SOURCE_ETAGS_INVALID','etags');return;
 }
 for(const root of ['index','proposals','alerts']){
  if(typeof snapshot.etags[root]!=='string'||!snapshot.etags[root])
   addIssue(issues,'SOURCE_ETAG_MISSING','etags',root);
 }
 const keys=bare(snapshot.shards)?Object.keys(snapshot.shards):[];
 for(const id of keys){
  if(typeof snapshot.etags.shards[id]!=='string'||!snapshot.etags.shards[id])
   addIssue(issues,'SOURCE_ETAG_MISSING','shards',id);
 }
}
function projectLegacy(snapshot){
 if(!bare(snapshot))fail('INVALID_SNAPSHOT');
 const issues=[];
 if(!bare(snapshot.shards))fail('INVALID_SOURCE_SHARDS');
 checkEtags(snapshot,issues);
 const index=jsonRoot(snapshot.index,'array','index',issues);
 const proposals=jsonRoot(snapshot.proposals,'array','proposals',issues);
 const alerts=jsonRoot(snapshot.alerts,'object','alerts',issues);
 const invIds=[],invSet=new Set();
 if(index){
  for(const id of index){
   if(!validId(id)){addIssue(issues,'INVALID_INV_ID','index',String(id));continue;}
   if(invSet.has(id))addIssue(issues,'DUPLICATE_INV_ID','index',id);
   else {invSet.add(id);invIds.push(id);}
  }
 }
 const irrigation=[];
 let cells=0;
 for(const id of Object.keys(snapshot.shards).sort()){
  if(!validId(id)){addIssue(issues,'INVALID_INV_ID','shards',id);continue;}
  if(!invSet.has(id))addIssue(issues,'ORPHAN_SHARD','shards',id);
  const raw=snapshot.shards[id];
  if(raw===null){if(invSet.has(id))addIssue(issues,'MISSING_SHARD','shards',id);continue;}
  const grid=jsonRoot(raw,'object','shards',issues,id);
  if(!grid)continue;
  let valid=true;
  for(const [day,lanes] of Object.entries(grid)){
   if(!DAY.test(day)||!bare(lanes)){addIssue(issues,'INVALID_RIEGO_DAY','shards',id);valid=false;break;}
   for(const lane of Object.keys(lanes)){
    if(!validId(lane)){addIssue(issues,'INVALID_RIEGO_LANE','shards',id);valid=false;break;}
    cells++;
   }
   if(!valid)break;
  }
  if(valid)irrigation.push([id,copy(grid)]);
 }
 if(index)for(const id of invIds){
  if(!Object.prototype.hasOwnProperty.call(snapshot.shards,id))
   addIssue(issues,'MISSING_SHARD','shards',id);
 }
 const proposalsById=[],proposalSeen=new Set();
 if(proposals)for(const p of proposals){
  if(!bare(p)||!validId(p.id)||!validId(String(p.invId??''))||
     !STATES.has(p.estado)||typeof p.propuestoPor!=='string'||!p.propuestoPor.trim()){
   addIssue(issues,'INVALID_PROPOSAL','proposals',p?.id);continue;
  }
  if(proposalSeen.has(p.id)){addIssue(issues,'DUPLICATE_PROPOSAL_ID','proposals',p.id);continue;}
  proposalSeen.add(p.id);
  if(!invSet.has(String(p.invId)))addIssue(issues,'PROPOSAL_INV_NOT_INDEXED','proposals',p.id);
  proposalsById.push([p.id,copy(p)]);
 }
 const alertsByUser=[];
 let alertCount=0;
 if(alerts)for(const [user,records] of Object.entries(alerts)){
  if(!validId(user)||!Array.isArray(records)){
   addIssue(issues,'INVALID_ALERT_BUCKET','alerts',user);continue;
  }
  if(records.length>30)addIssue(issues,'LEGACY_ALERT_LIMIT_EXCEEDED','alerts',user);
  const found=new Set();
  for(const a of records){
   if(!bare(a)||!validId(a.id)){
    addIssue(issues,'INVALID_ALERT','alerts',user);continue;
   }
   if(found.has(a.id))addIssue(issues,'DUPLICATE_ALERT_ID','alerts',user);
   found.add(a.id);alertCount++;
  }
  alertsByUser.push([user,copy(records)]);
 }
 const projected={irrigationByInv:mapEntries(irrigation),
  proposalsById:mapEntries(proposalsById),alertsByUser:mapEntries(alertsByUser)};
 const counts={indexInv:invSet.size,validShards:irrigation.length,cells,
  proposals:proposalsById.length,recipients:alertsByUser.length,alerts:alertCount};
 return {projected,issues,counts};
}
function comparePart(expected,actual,domain,issues){
 if(!bare(actual)){addIssue(issues,'TARGET_DOMAIN_INVALID',domain);return;}
 const a=new Set(Object.keys(expected)),b=new Set(Object.keys(actual));
 for(const id of [...a].sort())if(!b.has(id))addIssue(issues,'TARGET_ITEM_MISSING',domain,id);
 for(const id of [...b].sort())if(!a.has(id))addIssue(issues,'TARGET_ITEM_EXTRA',domain,id);
 for(const id of [...a].sort())if(b.has(id)&&canonical(expected[id])!==canonical(actual[id]))
  addIssue(issues,'TARGET_VALUE_MISMATCH',domain,id);
}
function dryRunMigration({snapshot,candidate,recheckEtags}={}){
 if(!bare(snapshot)||!bare(candidate))fail('INVALID_DRY_RUN_INPUT');
 const {projected,issues,counts}=projectLegacy(snapshot);
 const domains=['irrigationByInv','proposalsById','alertsByUser'];
 for(const domain of domains)comparePart(projected[domain],candidate[domain],domain,issues);
 if(recheckEtags!==undefined){
  if(!bare(recheckEtags)||canonical(recheckEtags)!==canonical(snapshot.etags))
   addIssue(issues,'SOURCE_CHANGED_SINCE_SNAPSHOT','etags');
 }
 const sourceDigests=Object.fromEntries(domains.map(d=>[d,hash(projected[d])]));
 const candidateDigests=Object.fromEntries(domains.map(d=>
  [d,bare(candidate[d])?hash(candidate[d]):null]));
 const stableIssues=issues.sort((a,b)=>
  (a.domain+'|'+a.code+'|'+a.referenceHash).localeCompare(b.domain+'|'+b.code+'|'+b.referenceHash));
 return Object.freeze({
  schema:'lasala-migration-dryrun/demo-v1',dryRun:true,readOnly:true,
  hasNetwork:false,writes:0,pushSent:0,
  parity:stableIssues.length?'BLOCKED':'MATCH',
  eligibleForCutover:false,requiresBackofficeApproval:true,
  requiresFreshSourceEtagCheck:true,requiresOfflineClientReconciliation:true,
  unrecoverableDeletedLegacyAlerts:true,
  etagManifestDigest:bare(snapshot.etags)?hash(snapshot.etags):null,
  sourceCounts:counts,sourceDigests,candidateDigests,
  differences:stableIssues.length,issues:stableIssues
 });
}
module.exports={projectLegacy,dryRunMigration};
