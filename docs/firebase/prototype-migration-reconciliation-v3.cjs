'use strict';
// §0.236 — PURE SYNTHETIC CUTOVER RECONCILIATION SIMULATION.
// No Firebase import, no network, no filesystem, no writes, no Push.
// Device inventories/reports and receipt flags are FIXTURES, never evidence
// that real devices or real business transactions have been verified.
const crypto=require('node:crypto');
const {projectLegacy,dryRunMigration}=require('./prototype-migration-dryrun-v3.cjs');
const SAFE=/^[A-Za-z0-9_-]{1,140}$/;
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const reserved=new Set(['__proto__','prototype','constructor']);
const valid=x=>typeof x==='string'&&SAFE.test(x)&&!reserved.has(x);
const hash=x=>crypto.createHash('sha256').update(String(x),'utf8').digest('hex').slice(0,16);
const sort=x=>Array.isArray(x)?x.map(sort):plain(x)?
 Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort(x[k])])):x;
const same=(a,b)=>JSON.stringify(sort(a))===JSON.stringify(sort(b));
const issue=(list,code,domain,reference='')=>
 list.push({code,domain,referenceHash:reference?hash(reference):null});
const asString=v=>v&&typeof v==='object'&&v.texto!==undefined?v.texto:v;
function cells(grid){
 const m=new Map();
 if(!plain(grid))return m;
 for(const [day,lanes] of Object.entries(grid)){
  if(!plain(lanes))continue;
  for(const [lane,v] of Object.entries(lanes))
   m.set(day+'|'+lane,v);
 }
 return m;
}
function compareSnapshot(before,after,issues,summary){
 const old=before.projected.irrigationByInv,newer=after.projected.irrigationByInv;
 const ids=new Set([...Object.keys(old),...Object.keys(newer)]);
 for(const invId of [...ids].sort()){
  const a=cells(old[invId]),b=cells(newer[invId]);
  const lanes=new Set([...a.keys(),...b.keys()]);
  let delta=0;
  for(const key of lanes)if(!same(a.get(key),b.get(key)))delta++;
  if(delta){
   summary.changedCells+=delta;summary.changedInvernaderos++;
   issue(issues,'RIEGO_CHANGED_SINCE_SNAPSHOT','irrigation',invId);
  }
 }
 const oldP=before.projected.proposalsById;
 const newP=after.projected.proposalsById;
 for(const id of Object.keys(newP).sort()){
  if(!Object.hasOwn(oldP,id)){
   summary.newProposals++;
   issue(issues,'PROPOSAL_CREATED_SINCE_SNAPSHOT','proposals',id);
   continue;
  }
  if(!same(oldP[id],newP[id])){
   summary.changedProposals++;
   const oldState=oldP[id].estado,newState=newP[id].estado;
   issue(issues,oldState!==newState?'PROPOSAL_STATE_CHANGED_SINCE_SNAPSHOT':
     'PROPOSAL_MODIFIED_SINCE_SNAPSHOT','proposals',id);
   if(oldState!==newState&&!(oldState==='pendiente'&&
      ['aceptada','rechazada'].includes(newState)))
    issue(issues,'PROPOSAL_ILLEGAL_TRANSITION','proposals',id);
   if(oldState!==newState&&['aceptada','rechazada'].includes(newState))
    verifyProposalLink(newP[id],newer,issues);
  }
 }
 for(const id of Object.keys(oldP))if(!Object.hasOwn(newP,id)){
  summary.removedProposals++;
  issue(issues,'PROPOSAL_REMOVED_SINCE_SNAPSHOT','proposals',id);
 }
 const oldA=before.projected.alertsByUser,newA=after.projected.alertsByUser;
 for(const uid of new Set([...Object.keys(oldA),...Object.keys(newA)])){
  if(!same(oldA[uid],newA[uid])){
   summary.changedAlertBuckets++;
   issue(issues,'ALERTS_CHANGED_SINCE_SNAPSHOT','alerts',uid);
  }
 }
}
function verifyProposalLink(p,irrigation,issues){
 const invId=String(p.invId??'');
 const day=p.dia;
 const lanes=Array.isArray(p.calles)?p.calles:
   p.calle===undefined?[]:[p.calle];
 if(!valid(invId)||!DAY.test(day||'')||!lanes.length||
    lanes.some(x=>!valid(String(x)))){
  issue(issues,'PROPOSAL_LOCATION_UNVERIFIABLE','proposals',p.id);return;
 }
 const grid=irrigation[invId];
 if(!plain(grid)){
  issue(issues,'PROPOSAL_INV_NOT_PRESENT','proposals',p.id);return;
 }
 if(p.estado==='aceptada'){
  const expected=p.textoFinal??p.textoPropuesto;
  if(typeof expected!=='string'||!expected.trim()){
   issue(issues,'PROPOSAL_RESULT_UNVERIFIABLE','proposals',p.id);return;
  }
  for(const lane of lanes){
   const value=grid[day]?.[String(lane)];
   if(asString(value)!==expected){
    issue(issues,'ACCEPTED_PROPOSAL_RIEGO_MISMATCH','proposals',p.id);return;
   }
  }
 }
 if(p.estado==='rechazada'){
  for(const lane of lanes){
   if(asString(grid[day]?.[String(lane)])!=='?'){
    issue(issues,'REJECTED_PROPOSAL_RIEGO_MISMATCH','proposals',p.id);return;
   }
  }
 }
}
function checkDevices({deviceInventory,deviceReports,asOfUtc,latest},issues,summary){
 if(!plain(deviceInventory)||deviceInventory.reviewed!==true||
    !Array.isArray(deviceInventory.expectedDevices)||
    deviceInventory.expectedDevices.length===0){
  issue(issues,'DEVICE_INVENTORY_NOT_VERIFIED','offline');return;
 }
 const expected=new Set();
 for(const id of deviceInventory.expectedDevices){
  if(!valid(id)||expected.has(id))issue(issues,'INVALID_OR_DUPLICATE_DEVICE','offline',id);
  else expected.add(id);
 }
 if(!Array.isArray(deviceReports)){
  issue(issues,'DEVICE_REPORTS_MISSING','offline');return;
 }
 const reports=new Map(),allOps=new Map(),cellCommands=new Map();
 const cutover=Date.parse(asOfUtc);
 if(typeof asOfUtc!=='string'||!Number.isFinite(cutover)){
  issue(issues,'INVALID_REVIEW_TIME','offline');return;
 }
 for(const device of deviceReports){
  const id=device?.id;
  if(!valid(id)){issue(issues,'INVALID_DEVICE_REPORT','offline');continue;}
  if(reports.has(id)){issue(issues,'DUPLICATE_DEVICE_REPORT','offline',id);continue;}
  reports.set(id,device);
  if(!expected.has(id))issue(issues,'UNKNOWN_DEVICE_REPORT','offline',id);
  const time=Date.parse(device.checkedAtUtc);
  if(device.syntheticTrustMarker!==true||!Number.isFinite(time)||
     time>cutover+300000||cutover-time>900000)
   issue(issues,'STALE_OR_UNVERIFIED_DEVICE_REPORT','offline',id);
  if(!Array.isArray(device.operations)){
   issue(issues,'INVALID_OFFLINE_JOURNAL','offline',id);continue;
  }
  for(const op of device.operations){
   summary.offlineCommands++;
   if(!op||!valid(op.id)||!valid(op.invId)||!DAY.test(op.day||'')||
      !valid(String(op.lane??''))||!['queued','syncing','acknowledged','conflict'].includes(op.status)){
    issue(issues,'INVALID_OFFLINE_COMMAND','offline',id);continue;
   }
   if(allOps.has(op.id))issue(issues,'DUPLICATE_OFFLINE_COMMAND','offline',op.id);
   allOps.set(op.id,id);
   const key=op.invId+'|'+op.day+'|'+op.lane;
   if(cellCommands.has(key)&&cellCommands.get(key)!==op.id)
    issue(issues,'OVERLAPPING_OFFLINE_CELL','offline',key);
   else cellCommands.set(key,op.id);
   if(op.status!=='acknowledged'){
    summary.pendingOfflineCommands++;
    issue(issues,'OFFLINE_NOT_CONFIRMED','offline',op.id);
   }else if(op.serverReceiptVerified!==true||op.receiptCommandId!==op.id){
    issue(issues,'OFFLINE_RECEIPT_UNVERIFIED','offline',op.id);
   }
   const current=latest.projected.irrigationByInv[op.invId]?.[op.day]?.[String(op.lane)];
   if(!Object.hasOwn(latest.projected.irrigationByInv,op.invId)||
      current===undefined){
    issue(issues,'OFFLINE_CELL_MISSING','offline',op.id);continue;
   }
   if(op.status==='acknowledged'){
    if(!same(asString(current),asString(op.nextValue)))
     issue(issues,'OFFLINE_ACK_DIFFERS_FROM_RIEGO','offline',op.id);
   }else if(!same(asString(current),asString(op.baseValue))){
    issue(issues,'OFFLINE_BASE_CHANGED','offline',op.id);
   }
  }
 }
 for(const id of expected)if(!reports.has(id)){
  summary.unreportedDevices++;
  issue(issues,'DEVICE_NOT_REPORTED','offline',id);
 }
 summary.reportedDevices=reports.size;
}
function simulateMigrationReconciliation({
 snapshot,latest,candidate,deviceInventory,deviceReports,asOfUtc
}={}){
 if(!plain(snapshot)||!plain(latest)||!plain(candidate))
  throw Object.assign(new Error('SYNTHETIC_INPUT_REQUIRED'),{code:'SYNTHETIC_INPUT_REQUIRED'});
 const before=projectLegacy(snapshot),after=projectLegacy(latest);
 const comparison=dryRunMigration({snapshot:latest,candidate});
 const issues=[...before.issues,...after.issues,...comparison.issues];
 const summary={changedInvernaderos:0,changedCells:0,newProposals:0,
   changedProposals:0,removedProposals:0,changedAlertBuckets:0,
   offlineCommands:0,pendingOfflineCommands:0,reportedDevices:0,unreportedDevices:0};
 if(!same(snapshot.etags,latest.etags))
  issue(issues,'SOURCE_ETAGS_CHANGED_SINCE_SNAPSHOT','etags');
 compareSnapshot(before,after,issues,summary);
 checkDevices({deviceInventory,deviceReports,asOfUtc,latest:after},issues,summary);
 issues.sort((a,b)=>(a.domain+'|'+a.code+'|'+a.referenceHash)
  .localeCompare(b.domain+'|'+b.code+'|'+b.referenceHash));
 return Object.freeze({
  schema:'lasala-migration-reconciliation/demo-v1',simulationOnly:true,
  hasNetwork:false,writes:0,pushSent:0,
  status:issues.length?'BLOCKED':'SIMULATED_MATCH',
  eligibleForCutover:false,requiresBackofficeApproval:true,
  requiresRealDeviceAudit:true,requiresFreshSourceETags:true,
  sourceIntegrity:after.issues.length?'BLOCKED':'CHECKED_SYNTHETIC',
  latestCandidateParity:comparison.parity,
  summary,issueCount:issues.length,issues
 });
}
module.exports={simulateMigrationReconciliation};
