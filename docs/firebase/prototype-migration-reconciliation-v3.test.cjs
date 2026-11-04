'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {projectLegacy}=require('./prototype-migration-dryrun-v3.cjs');
const {simulateMigrationReconciliation:simulate}=
 require('./prototype-migration-reconciliation-v3.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
function source(){
 return {
  index:JSON.stringify(['INV_1','INV_2']),
  shards:{
   INV_1:JSON.stringify({'2026-11-04':{
    '1':{texto:'30 MIN',revisadoPorVigueras:true},'2':'?'}}),
   INV_2:JSON.stringify({'2026-11-04':{'3':'45 MIN'}})
  },
  proposals:JSON.stringify([
   {id:'prop_1',invId:'INV_1',dia:'2026-11-04',calles:['2'],
    estado:'pendiente',propuestoPor:'FRAN',textoPropuesto:'35 MIN'},
   {id:'prop_2',invId:'INV_2',dia:'2026-11-04',calle:'3',
    estado:'pendiente',propuestoPor:'DENNIS',textoPropuesto:'45 MIN'}]),
  alerts:JSON.stringify({VIGUERAS:[{id:'aviso_1',mensaje:'Texto de prueba',leido:false}],
   FRAN:[{id:'aviso_2',mensaje:'Otro mensaje',leido:true}]}),
  etags:{index:'"index1"',proposals:'"props1"',alerts:'"alerts1"',
   shards:{INV_1:'"inv1"',INV_2:'"inv2"'}}
 };
}
function setup(){
 const snapshot=source(),latest=clone(snapshot);
 const candidate=projectLegacy(snapshot).projected;
 const deviceInventory={reviewed:true,expectedDevices:['DEVICE_A','DEVICE_B']};
 const deviceReports=['DEVICE_A','DEVICE_B'].map(id=>
  ({id,syntheticTrustMarker:true,checkedAtUtc:'2026-11-04T14:00:00Z',operations:[]}));
 return {snapshot,latest,candidate,deviceInventory,deviceReports,
  asOfUtc:'2026-11-04T14:05:00Z'};
}
const run=f=>simulate(f);
const has=(out,code)=>out.issues.some(x=>x.code===code);
const changeGrid=(f,mutate,inv='INV_1')=>{
 const grid=JSON.parse(f.latest.shards[inv]);mutate(grid);
 f.latest.shards[inv]=JSON.stringify(grid);
 f.latest.etags.shards[inv]='"changed-inv"';
};
const changeProposals=(f,mutate)=>{
 const data=JSON.parse(f.latest.proposals);mutate(data);
 f.latest.proposals=JSON.stringify(data);
 f.latest.etags.proposals='"changed-prop"';
};
test('unaltered synthetic snapshot, candidate and reviewed devices report simulated match only',()=>{
 const f=setup(),r=run(f);
 assert.equal(r.status,'SIMULATED_MATCH');
 assert.equal(r.issueCount,0);
 assert.equal(r.latestCandidateParity,'MATCH');
 assert.equal(r.eligibleForCutover,false);
 assert.equal(r.writes,0);assert.equal(r.pushSent,0);assert.equal(r.hasNetwork,false);
});
test('the simulation report exposes hashes but never user names, IDs, or riego text',()=>{
 const r=run(setup()),str=JSON.stringify(r);
 for(const x of ['FRAN','VIGUERAS','DENNIS','prop_1','INV_1','DEVICE_A',
  '30 MIN','35 MIN','Texto de prueba'])
  assert.ok(!str.includes(x),x);
});
test('repeatability and input immutability',()=>{
 const f=setup(),orig=JSON.stringify(f);
 assert.deepEqual(run(f),run(f));
 assert.equal(JSON.stringify(f),orig);
});
test('ETag changed without changed cell content still blocks cutover',()=>{
 const f=setup();f.latest.etags.shards.INV_1='"new-etag"';
 const r=run(f);assert.ok(has(r,'SOURCE_ETAGS_CHANGED_SINCE_SNAPSHOT'));
 assert.equal(r.summary.changedCells,0);
 assert.equal(r.status,'BLOCKED');
});
test('concurrent change of an irrigation cell detected against stale candidate',()=>{
 const f=setup();changeGrid(f,g=>g['2026-11-04']['1'].texto='33 MIN');
 const r=run(f);
 assert.ok(has(r,'RIEGO_CHANGED_SINCE_SNAPSHOT'));
 assert.ok(has(r,'TARGET_VALUE_MISMATCH'));
 assert.equal(r.summary.changedInvernaderos,1);
 assert.equal(r.summary.changedCells,1);
});
test('candidate refreshed to latest does not erase intervening changes',()=>{
 const f=setup();changeGrid(f,g=>g['2026-11-04']['1'].texto='34 MIN');
 f.candidate=projectLegacy(f.latest).projected;
 const r=run(f);
 assert.equal(r.latestCandidateParity,'MATCH');
 assert.ok(has(r,'RIEGO_CHANGED_SINCE_SNAPSHOT'));
 assert.ok(has(r,'SOURCE_ETAGS_CHANGED_SINCE_SNAPSHOT'));
 assert.equal(r.eligibleForCutover,false);
});
test('proposals created after snapshot must be reconciled independently',()=>{
 const f=setup();changeProposals(f,p=>p.push({...p[0],id:'prop_3'}));
 const r=run(f);assert.ok(has(r,'PROPOSAL_CREATED_SINCE_SNAPSHOT'));
 assert.equal(r.summary.newProposals,1);
});
test('removed proposal is suspicious because legacy proposals should not be deleted',()=>{
 const f=setup();changeProposals(f,p=>p.pop());
 assert.ok(has(run(f),'PROPOSAL_REMOVED_SINCE_SNAPSHOT'));
});
test('proposals edited without state change still cause a reconciliation',()=>{
 const f=setup();changeProposals(f,p=>p[0].textoPropuesto='55 MIN');
 assert.ok(has(run(f),'PROPOSAL_MODIFIED_SINCE_SNAPSHOT'));
});
test('accepted proposal with matching committed irrigation is still a late transition',()=>{
 const f=setup();changeProposals(f,p=>p[0].estado='aceptada');
 changeGrid(f,g=>g['2026-11-04']['2']='35 MIN');
 f.candidate=projectLegacy(f.latest).projected;
 const r=run(f);
 assert.ok(has(r,'PROPOSAL_STATE_CHANGED_SINCE_SNAPSHOT'));
 assert.ok(!has(r,'ACCEPTED_PROPOSAL_RIEGO_MISMATCH'));
 assert.equal(r.status,'BLOCKED');
});
test('accepted proposal with unchanged question mark is inconsistent',()=>{
 const f=setup();changeProposals(f,p=>p[0].estado='aceptada');
 assert.ok(has(run(f),'ACCEPTED_PROPOSAL_RIEGO_MISMATCH'));
});
test('accepted proposal without day or lane must not be assumed applied',()=>{
 const f=setup();changeProposals(f,p=>{p[0].estado='aceptada';delete p[0].dia});
 assert.ok(has(run(f),'PROPOSAL_LOCATION_UNVERIFIABLE'));
});
test('accepted proposal with final text different from original is checked against final text',()=>{
 const f=setup();changeProposals(f,p=>{p[0].estado='aceptada';p[0].textoFinal='42 MIN'});
 changeGrid(f,g=>g['2026-11-04']['2']='42 MIN');
 assert.ok(!has(run(f),'ACCEPTED_PROPOSAL_RIEGO_MISMATCH'));
});
test('rejected proposal leaves original question mark unchanged',()=>{
 const f=setup();changeProposals(f,p=>p[0].estado='rechazada');
 const r=run(f);
 assert.ok(has(r,'PROPOSAL_STATE_CHANGED_SINCE_SNAPSHOT'));
 assert.ok(!has(r,'REJECTED_PROPOSAL_RIEGO_MISMATCH'));
});
test('rejected proposal that changed the irrigation is blocked',()=>{
 const f=setup();changeProposals(f,p=>p[0].estado='rechazada');
 changeGrid(f,g=>g['2026-11-04']['2']='35 MIN');
 assert.ok(has(run(f),'REJECTED_PROPOSAL_RIEGO_MISMATCH'));
});
test('illegal retrograde proposal state cannot be taken as a normal reconciliation',()=>{
 const f=setup();changeProposals(f,p=>p[0].estado='aceptada');
 f.snapshot.proposals=f.latest.proposals;
 changeProposals(f,p=>p[0].estado='pendiente');
 assert.ok(has(run(f),'PROPOSAL_ILLEGAL_TRANSITION'));
});
test('legacy notice changes are independently flagged',()=>{
 const f=setup(),alerts=JSON.parse(f.latest.alerts);
 alerts.FRAN[0].leido=false;f.latest.alerts=JSON.stringify(alerts);
 f.latest.etags.alerts='"alerts2"';
 assert.ok(has(run(f),'ALERTS_CHANGED_SINCE_SNAPSHOT'));
});
test('device inventory must be explicitly reviewed even with no queued operations',()=>{
 const f=setup();f.deviceInventory.reviewed=false;
 assert.ok(has(run(f),'DEVICE_INVENTORY_NOT_VERIFIED'));
});
test('empty claimed device inventory never certifies that there are no offline devices',()=>{
 const f=setup();f.deviceInventory.expectedDevices=[];
 assert.ok(has(run(f),'DEVICE_INVENTORY_NOT_VERIFIED'));
});
test('missing report of a known device is blocking',()=>{
 const f=setup();f.deviceReports.pop();
 const r=run(f);assert.ok(has(r,'DEVICE_NOT_REPORTED'));
 assert.equal(r.summary.unreportedDevices,1);
});
test('unknown device and duplicate device reports are blocking',()=>{
 const f=setup();f.deviceReports.push({...f.deviceReports[0],id:'DEVICE_UNKNOWN'});
 f.deviceReports.push({...f.deviceReports[0]});
 const r=run(f);
 assert.ok(has(r,'UNKNOWN_DEVICE_REPORT'));assert.ok(has(r,'DUPLICATE_DEVICE_REPORT'));
});
test('unverified or stale device report does not grant cutover permission',()=>{
 const f=setup();f.deviceReports[0].syntheticTrustMarker=false;
 f.deviceReports[1].checkedAtUtc='2026-11-04T12:00:00Z';
 assert.ok(has(run(f),'STALE_OR_UNVERIFIED_DEVICE_REPORT'));
});
test('invalid review timestamp blocks offline reconciliation',()=>{
 const f=setup();f.asOfUtc='not-a-date';
 assert.ok(has(run(f),'INVALID_REVIEW_TIME'));
});
test('offline pending operation blocks even if its base still matches server',()=>{
 const f=setup();f.deviceReports[0].operations=[{
  id:'CMD_1',invId:'INV_1',day:'2026-11-04',lane:'2',
  status:'queued',baseValue:'?',nextValue:'35 MIN'
 }];
 const r=run(f);
 assert.ok(has(r,'OFFLINE_NOT_CONFIRMED'));
 assert.ok(!has(r,'OFFLINE_BASE_CHANGED'));
 assert.equal(r.summary.pendingOfflineCommands,1);
});
test('offline operation whose base diverged is a real conflict',()=>{
 const f=setup();f.deviceReports[0].operations=[{
  id:'CMD_1',invId:'INV_1',day:'2026-11-04',lane:'1',
  status:'queued',baseValue:'20 MIN',nextValue:'35 MIN'
 }];
 assert.ok(has(run(f),'OFFLINE_BASE_CHANGED'));
});
test('claimed offline acknowledgment without server receipt is rejected',()=>{
 const f=setup();f.deviceReports[0].operations=[{
  id:'CMD_1',invId:'INV_1',day:'2026-11-04',lane:'1',
  status:'acknowledged',nextValue:'30 MIN'
 }];
 assert.ok(has(run(f),'OFFLINE_RECEIPT_UNVERIFIED'));
});
test('synthetic acknowledged operation matching grid and verified fixture receipt',()=>{
 const f=setup();f.deviceReports[0].operations=[{
  id:'CMD_1',invId:'INV_1',day:'2026-11-04',lane:'1',
  status:'acknowledged',nextValue:'30 MIN',
  serverReceiptVerified:true,receiptCommandId:'CMD_1'
 }];
 const r=run(f);
 assert.equal(r.status,'SIMULATED_MATCH');assert.equal(r.eligibleForCutover,false);
});
test('acknowledged operation with different final grid value blocks',()=>{
 const f=setup();f.deviceReports[0].operations=[{
  id:'CMD_1',invId:'INV_1',day:'2026-11-04',lane:'1',
  status:'acknowledged',nextValue:'60 MIN',
  serverReceiptVerified:true,receiptCommandId:'CMD_1'
 }];
 assert.ok(has(run(f),'OFFLINE_ACK_DIFFERS_FROM_RIEGO'));
});
test('offline operations on the same cell from two devices overlap',()=>{
 const f=setup();
 f.deviceReports[0].operations=[{id:'A_1',invId:'INV_1',
  day:'2026-11-04',lane:'2',status:'queued',baseValue:'?',nextValue:'35 MIN'}];
 f.deviceReports[1].operations=[{id:'B_1',invId:'INV_1',
  day:'2026-11-04',lane:'2',status:'queued',baseValue:'?',nextValue:'40 MIN'}];
 assert.ok(has(run(f),'OVERLAPPING_OFFLINE_CELL'));
});
test('a command ID duplicated across devices cannot be reconciled blindly',()=>{
 const f=setup(),op={id:'CMD_1',invId:'INV_1',day:'2026-11-04',
 lane:'1',status:'queued',baseValue:'30 MIN',nextValue:'35 MIN'};
 f.deviceReports[0].operations=[op];
 f.deviceReports[1].operations=[{...op}];
 assert.ok(has(run(f),'DUPLICATE_OFFLINE_COMMAND'));
});
test('unknown invernadero/day/lane in offline journal cannot silently create a cell',()=>{
 const f=setup();
 f.deviceReports[0].operations=[{id:'CMD_1',invId:'INV_10',
  day:'2026-11-04',lane:'1',status:'queued',baseValue:'?',nextValue:'35 MIN'}];
 assert.ok(has(run(f),'OFFLINE_CELL_MISSING'));
});
test('invalid offline status, ID and journal are rejected',()=>{
 const f=setup();
 f.deviceReports[0].operations=[{id:'BAD ID',invId:'INV_1',day:'2026-11-04',
  lane:'1',status:'sent',baseValue:'30 MIN'}];
 f.deviceReports[1].operations=null;
 const r=run(f);
 assert.ok(has(r,'INVALID_OFFLINE_COMMAND'));
 assert.ok(has(r,'INVALID_OFFLINE_JOURNAL'));
});
test('source malformed JSON is a blocking integrity condition',()=>{
 const f=setup();f.latest.shards.INV_1='{bad';
 assert.ok(has(run(f),'SOURCE_MALFORMED_JSON'));
});
test('no client-supplied approval flags override no-cutover decision',()=>{
 const f=setup(),r=simulate({...f,approved:true,forceCutover:true,
  bypassOffline:true,write:true});
 assert.equal(r.status,'SIMULATED_MATCH');assert.equal(r.eligibleForCutover,false);
 assert.equal(r.writes,0);assert.equal(r.pushSent,0);
});
test('input validation rejects missing snapshot/latest/candidate instead of assuming empty',()=>{
 assert.throws(()=>simulate({}),{code:'SYNTHETIC_INPUT_REQUIRED'});
});
