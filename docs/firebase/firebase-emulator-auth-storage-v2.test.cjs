'use strict';
// Official RTDB emulator integration. No network except 127.0.0.1:9000,
// with synthetic RSA JWTs and a stubbed Google JWKS response.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const {PROJECT,NAMESPACE,makeEmulatorTransport,makeBackendAuth,
  createIntegratedDemoApi}=require('./prototype-avisos-push-auth-emulator-v2.cjs');
const {createDemoStore,ROOTS}=require('./prototype-avisos-push-store-v2.cjs');
const {loadMigrationPlan,executeDemoMigration,LEGACY}=
  require('./prototype-avisos-push-migration-v2.cjs');
const {uidForName}=require('./prototype-avisos-push-v2.cjs');
const JWKS='https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const USER='TECNICO_A',OTHER='TECNICO_B',UID=uidForName(USER),OTHER_UID=uidForName(OTHER);
let transport,store,dbEnv,pub,priv,originalFetch;
const rootKeys=['lasala-roles-v1','lasala-users-v1',LEGACY.alerts,LEGACY.push,
  ROOTS.alerts,ROOTS.endpoints,ROOTS.outbox,ROOTS.weekly];
const stringify=x=>JSON.stringify(x);
function encode(value){return Buffer.from(JSON.stringify(value)).toString('base64url')}
function fakeJwt(user=USER,props={},key=priv){
  const now=Math.floor(Date.now()/1000);
  const head=encode({alg:'RS256',kid:'LOCAL_EMULATOR_ONLY',typ:'JWT'});
  const data=encode({iss:'https://securetoken.google.com/la-sala-app-test',
    aud:'la-sala-app-test',sub:uidForName(user),auth_time:now-5,
    exp:now+3600,iat:now-5,appUser:user,role:'ADMIN',...props});
  const signed=head+'.'+data;
  return signed+'.'+crypto.sign('RSA-SHA256',Buffer.from(signed),key).toString('base64url');
}
const auth=user=>({method:'POST',headers:{authorization:'Bearer '+fakeJwt(user)},body:{action:'mine'}});
const result=(r,code)=>assert.equal(r.status,code,JSON.stringify(r.body));
function api(extra={}){
  return createIntegratedDemoApi({transport,cronSecret:()=>'local-cron-secret-only-123456789',
    now:()=>new Date('2026-11-05T07:00:00Z'),...extra});
}
async function putLegacy(name,map){
  assert.equal(await transport.seedSynthetic([name],JSON.stringify(map)),true);
}
before(async()=>{
  assert.equal(process.env.FIREBASE_DATABASE_EMULATOR_HOST,'127.0.0.1:9000');
  assert.ok(!process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  originalFetch=global.fetch;
  ({publicKey:pub,privateKey:priv}=crypto.generateKeyPairSync('rsa',{modulusLength:2048}));
  const jwk=pub.export({format:'jwk'});jwk.kid='LOCAL_EMULATOR_ONLY';jwk.kty='RSA';jwk.alg='RS256';jwk.use='sig';
  global.fetch=async (url,options={})=>{
    if(String(url)===JWKS)return new Response(stringify({keys:[jwk]}),
      {status:200,headers:{'content-type':'application/json'}});
    // The rules-unit-testing library also needs loopback fetch, not just our transport.
    if(/^http:\/\/(?:127\.0\.0\.1|localhost):9000\//.test(String(url)))
      return originalFetch(url,options);
    throw new Error('UNEXPECTED_EXTERNAL_FETCH');
  };
  transport=makeEmulatorTransport({fetchImpl:originalFetch});
  store=createDemoStore({transport});
  dbEnv=await initializeTestEnvironment({projectId:PROJECT,database:{
    host:'127.0.0.1',port:9000,
    rules:require('node:fs').readFileSync(
      __dirname+'/database.rules.test.candidate.phase2-avisos-push.json','utf8')
  }});
  for(const key of rootKeys)await transport.removeSynthetic([key]);
  await putLegacy('lasala-roles-v1',{[USER]:'TECNICO',[OTHER]:'TECNICO',
    DENNIS:'TECNICO',FRAN:'TECNICO'});
  await putLegacy('lasala-users-v1',{[USER]:'a'.repeat(64),[OTHER]:'b'.repeat(64),
    DENNIS:'c'.repeat(64),FRAN:'d'.repeat(64)});
});
after(async()=>{
  try{
    if(transport)for(const key of rootKeys)await transport.removeSynthetic([key]);
    if(dbEnv)await dbEnv.cleanup();
  }finally{if(originalFetch)global.fetch=originalFetch}
});
test('guards reject real URLs and presence of service account credentials',()=>{
  assert.equal(NAMESPACE,PROJECT+'-default-rtdb');
  assert.throws(()=>makeEmulatorTransport({fetchImpl:()=>{},baseUrl:
    'https://la-sala-app-test-default-rtdb.europe-west1.firebasedatabase.app'}),
    /CUSTOM_BASE_URL_FORBIDDEN/);
  const before=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  try{
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON='synthetic-no-real-key';
    assert.throws(()=>makeEmulatorTransport({fetchImpl:()=>{}}),/REAL_SERVICE_CREDENTIALS_FORBIDDEN/);
  }finally{
    if(before===undefined)delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    else process.env.FIREBASE_SERVICE_ACCOUNT_JSON=before;
  }
});
test('real backend JWT signature verifier accepts synthetic RSA ID token with valid UID',async()=>{
  const authAdapter=makeBackendAuth(transport);
  assert.deepEqual(await authAdapter.verifyIdentity(fakeJwt()),{appUser:USER,uid:UID});
  assert.equal(await authAdapter.loadRole(USER),'TECNICO');
  assert.equal(await authAdapter.loadAccount(USER),true);
});
test('real JWT verifier blocks bad signatures, audience, UID, expiry and missing appUser',async()=>{
  const verifier=makeBackendAuth(transport).verifyIdentity;
  const different=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
  for(const token of [
    fakeJwt(USER,{},different.privateKey),
    fakeJwt(USER,{aud:'another-project'}),
    fakeJwt(USER,{sub:OTHER_UID}),
    fakeJwt(USER,{exp:Math.floor(Date.now()/1000)-10}),
    fakeJwt(USER,{appUser:null})
  ])await assert.rejects(verifier(token));
});
test('authenticated role and hash come from live server data, not token role claim',async()=>{
  const h=api();
  let r=await h(auth(USER));result(r,200);
  assert.deepEqual(Object.keys(r.body.avisos),[]);
  await putLegacy('lasala-roles-v1',{[USER]:'PEON',[OTHER]:'TECNICO',
    DENNIS:'TECNICO',FRAN:'TECNICO'});
  r=await h(auth(USER));result(r,200); // PEON can read only their own alerts.
  await putLegacy('lasala-roles-v1',{[USER]:'ADMIN_FORGED',[OTHER]:'TECNICO',
    DENNIS:'TECNICO',FRAN:'TECNICO'});
  result(await h(auth(USER)),403);
  await putLegacy('lasala-roles-v1',{[USER]:'TECNICO',[OTHER]:'TECNICO',
    DENNIS:'TECNICO',FRAN:'TECNICO'});
});
test('inactive account is rejected despite otherwise valid JWT',async()=>{
  const h=api();
  await putLegacy('lasala-users-v1',{[USER]:'disabled:'+'a'.repeat(64),
    [OTHER]:'b'.repeat(64),DENNIS:'c'.repeat(64),FRAN:'d'.repeat(64)});
  result(await h(auth(USER)),403);
  await putLegacy('lasala-users-v1',{[USER]:'a'.repeat(64),
    [OTHER]:'b'.repeat(64),DENNIS:'c'.repeat(64),FRAN:'d'.repeat(64)});
});
test('real official emulator blocks browser sessions from every protected v2 node',async()=>{
  const client=dbEnv.authenticatedContext(UID,{appUser:USER,role:'ADMIN'}).database();
  await assertFails(client.ref(ROOTS.alerts+'/'+UID).get());
  await assertFails(client.ref(ROOTS.alerts+'/'+UID).set({forbidden:true}));
  await assertFails(client.ref(ROOTS.endpoints).get());
  await assertFails(client.ref(ROOTS.outbox).set({forbidden:true}));
  await assertFails(client.ref(ROOTS.weekly).get());
});
test('privileged server can insert own alert through real ETag REST while clients cannot',async()=>{
  const record={id:'AVISO_1',recipientUid:UID,version:1,fecha:'04/11/2026',
    titulo:'synthetic',mensaje:'only for emulator',leido:false,visto:false,tipo:'general'};
  assert.equal(await store.insertAlert(UID,'AVISO_1',record),true);
  assert.equal(await store.insertAlert(UID,'AVISO_1',record),false);
  const h=api();
  const r=await h(auth(USER));result(r,200);
  assert.equal(r.body.avisos.AVISO_1.mensaje,'only for emulator');
  const other=await h(auth(OTHER));result(other,200);
  assert.equal(other.body.avisos.AVISO_1,undefined);
});
test('full POST API uses backend verifier, roles, account and CAS in real emulator',async()=>{
  const h=api();
  const req={method:'POST',headers:{authorization:'Bearer '+fakeJwt()},
    body:{action:'mark-read',id:'AVISO_1',expectedVersion:1}};
  result(await h(req),200);
  assert.equal((await store.getAlert(UID,'AVISO_1')).version,2);
  result(await h(req),409);
  assert.equal((await store.getAlert(UID,'AVISO_1')).leido,true);
});
test('stale real Firebase ETag cannot overwrite a concurrent winning write',async()=>{
  const path=[ROOTS.alerts,UID,'AVISO_1'];
  const original=await transport.retrieve(path,true);
  const other={...original.value,version:3,mensaje:'writer B'};
  assert.equal(await transport.conditionalPut(path,other,original.etag),true);
  const stale={...original.value,version:3,mensaje:'writer A'};
  assert.equal(await transport.conditionalPut(path,stale,original.etag),false);
  assert.equal((await transport.retrieve(path)).value.mensaje,'writer B');
});
test('synthetic v1 to v2 dry-run does not write, then migration is idempotent',async()=>{
  await putLegacy(LEGACY.alerts,{[OTHER]:[{id:'AVISO_2',fecha:'04/11/2026',
    titulo:'Another synthetic',mensaje:'another',visto:false,leido:false}]});
  await putLegacy(LEGACY.push,{[OTHER]:[]});
  const plan=await loadMigrationPlan(transport);
  assert.deepEqual(plan.counts,{recipients:1,alerts:1,push:0});
  const dry=await executeDemoMigration({transport,store,plan});
  assert.equal(dry.dryRun,true);assert.equal(dry.wouldCreateAlerts,1);
  assert.equal(await store.getAlert(OTHER_UID,'AVISO_2'),null);
  const once=await executeDemoMigration({transport,store,plan,
    dryRun:false,approvedForDemo:true});
  assert.equal(once.createdAlerts,1);
  assert.equal(once.complete,true);
  const again=await executeDemoMigration({transport,store,plan,
    dryRun:false,approvedForDemo:true});
  assert.equal(again.createdAlerts,0);
  assert.equal((await store.getAlert(OTHER_UID,'AVISO_2')).leido,false);
});
test('weekly Cron uses privileged ETag insert and cannot duplicate the weekly batch',async()=>{
  const h=api();
  const cronReq={method:'GET',query:{},
    headers:{'user-agent':'vercel-cron/1.0',
      authorization:'Bearer local-cron-secret-only-123456789'}};
  result(await h(cronReq),202);
  const duplicate=await h(cronReq);result(duplicate,200);
  assert.equal(duplicate.body.duplicate,true);
  const all=(await transport.retrieve([ROOTS.weekly])).value;
  assert.equal(Object.keys(all).length,1);
  assert.equal(Object.values(all)[0].events.length,2);
});
