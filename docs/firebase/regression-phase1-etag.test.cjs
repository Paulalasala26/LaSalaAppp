'use strict';
// Offline regression of REAL API modules with a fake in-memory RTDB HTTP transport.
// Node 22 built-ins only. No Firebase/SharePoint credentials; no network requests.
// Run from repository root: node --test docs/firebase/regression-phase1-etag.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const userModule=require('../../api/admin-users.js');
const {updateKey}=userModule._adminCatalogHelpers;
const audit=require('../../api/admin-audit.js');

function reply(code,value,etag) {
  return new Response(JSON.stringify(value),{status:code,headers:etag?{ETag:etag}:{}});
}
async function withFetch(mock,work) {
  const original=global.fetch;
  global.fetch=mock;
  try{return await work()}finally{global.fetch=original}
}
function makeKeyStore(initial, options={}) {
  const state={value:initial,revision:1,gets:0,puts:0,conflicts:0};
  const fetcher=async (url,opts={})=>{
    const method=opts.method||'GET';
    assert.match(String(url),/lasala-config-infra-v1\.json/);
    assert.equal(opts.headers.Authorization,'Bearer fake-service');
    if(method==='GET'){
      state.gets++;
      return reply(200,state.value,options.missingEtag?undefined:'"v'+state.revision+'"');
    }
    assert.equal(method,'PUT');
    state.puts++;
    assert.equal(opts.headers['Content-Type'],'application/json');
    if(options.alwaysConflict||options.firstConflict&&state.conflicts===0){
      state.conflicts++;
      if(options.firstConflict){
        const latest=typeof state.value==='string'?JSON.parse(state.value):state.value;
        state.value=JSON.stringify({...latest,otherWriter:true});
        state.revision++;
      }
      return reply(412,{});
    }
    assert.equal(opts.headers['if-match'],'"v'+state.revision+'"');
    state.value=JSON.parse(opts.body);
    state.revision++;
    return reply(200,null);
  };
  return {state,fetcher};
}

test('catalog CAS writes with the original ETag; preserves legacy string representation',async()=>{
  const {state,fetcher}=makeKeyStore('{"original":1}');
  await withFetch(fetcher,async()=>{
    const outcome=await updateKey('lasala-config-infra-v1','fake-service',map=>{map.created=2});
    assert.deepEqual(outcome,{changed:true});
  });
  assert.deepEqual(JSON.parse(state.value),{original:1,created:2});
  assert.equal(typeof state.value,'string');
  assert.equal(state.puts,1);
});
test('catalog CAS retries 412, re-reads and preserves concurrent changes',async()=>{
  const {state,fetcher}=makeKeyStore('{"original":1}',{firstConflict:true});
  await withFetch(fetcher,()=>updateKey('lasala-config-infra-v1','fake-service',map=>{map.created=2}));
  assert.deepEqual(JSON.parse(state.value),{original:1,otherWriter:true,created:2});
  assert.equal(state.gets,2);
  assert.equal(state.puts,2);
});
test('catalog CAS fails closed after five 412 responses',async()=>{
  const {state,fetcher}=makeKeyStore('{"original":1}',{alwaysConflict:true});
  await withFetch(fetcher,async()=>{
    await assert.rejects(updateKey('lasala-config-infra-v1','fake-service',map=>{map.created=2}),
      e=>e.httpStatus===409&&e.code==='CONCURRENT_MODIFICATION');
  });
  assert.equal(state.puts,5);
  assert.deepEqual(JSON.parse(state.value),{original:1});
});
test('catalog unchanged callback does not write',async()=>{
  const {state,fetcher}=makeKeyStore('{"original":1}');
  await withFetch(fetcher,async()=>{
    assert.deepEqual(await updateKey('lasala-config-infra-v1','fake-service',()=>false),{changed:false});
  });
  assert.equal(state.puts,0);
});
test('catalog missing ETag never writes',async()=>{
  const {state,fetcher}=makeKeyStore('{"original":1}',{missingEtag:true});
  await withFetch(fetcher,async()=>{
    await assert.rejects(updateKey('lasala-config-infra-v1','fake-service',m=>{m.created=1}),/ETag/);
  });
  assert.equal(state.puts,0);
});
test('audit prune deletes only old entries with matching ETag',async()=>{
  const atOld='2024-03-01T00:00:00.000Z', atNew='2026-06-01T00:00:00.000Z';
  const data={old001:{at:atOld},new001:{at:atNew}};
  let deletes=0;
  const fetcher=async(url,opts={})=>{
    const m=opts.method||'GET',p=String(url);
    assert.equal(opts.headers.Authorization,'Bearer fake-service');
    if(p.endsWith('/lasala-admin-audit-v1.json'))return reply(200,data);
    if(p.includes('/old001.json')&&m==='GET'){
      assert.equal(opts.headers['X-Firebase-ETag'],'true');
      return reply(200,data.old001,'"old-v1"');
    }
    if(p.includes('/old001.json')&&m==='DELETE'){
      assert.equal(opts.headers['if-match'],'"old-v1"');
      deletes++;delete data.old001;return reply(200,null);
    }
    throw Error('Unexpected audit request '+m+' '+p);
  };
  await withFetch(fetcher,async()=>{
    const result=await audit.pruneExpiredAudit('fake-service',new Date('2026-11-03T00:00:00Z'));
    assert.deepEqual(result,{deleted:1,candidates:1,remaining:0});
  });
  assert.equal(deletes,1);
  assert.ok(data.new001);
});
test('audit prune handles changed ETag without deleting entry',async()=>{
  const data={old001:{at:'2024-03-01T00:00:00.000Z'}};
  let attempts=0;
  const fetcher=async(url,opts={})=>{
    const m=opts.method||'GET',p=String(url);
    if(p.endsWith('/lasala-admin-audit-v1.json'))return reply(200,data);
    if(p.includes('/old001.json')&&m==='GET')return reply(200,data.old001,'"stale"');
    if(p.includes('/old001.json')&&m==='DELETE'){
      attempts++;assert.equal(opts.headers['if-match'],'"stale"');
      return reply(412,data.old001,'"current"');
    }
    throw Error('Unexpected audit request');
  };
  await withFetch(fetcher,async()=>{
    const result=await audit.pruneExpiredAudit('fake-service',new Date('2026-11-03T00:00:00Z'));
    assert.deepEqual(result,{deleted:0,candidates:1,remaining:1});
  });
  assert.equal(attempts,1);
  assert.ok(data.old001);
});

// QC API is loaded with mocked admin helpers before importing its module.
// Only the transport and identities are synthetic: QC validation and ETag flow are REAL.
const helpers=userModule._adminCatalogHelpers;
const actorState={role:'TECNICO'};
helpers.verifyFirebaseIdToken=async()=> 'TEST_ACTOR';
helpers.serviceAccount=()=>({project_id:'demo-local'});
helpers.serviceAccessToken=async()=> 'fake-service';
helpers.readKey=async key=>key==='lasala-roles-v1'?
  {TEST_ACTOR:actorState.role}:{TEST_ACTOR:'a'.repeat(64)};
helpers.validHash=()=>true;
const qc=require('../../api/admin-qc-mediciones.js');
function qcRequest(overrides={}) {
  return {method:'POST',headers:{authorization:'Bearer synthetic-id-token'},body:{
    id:'QC1',tipo:'carga',dia:15,partida:'PART1',version:0,schemaVersion:6,
    categorias:{color:{opciones:['ok']},tamano:{opciones:['ok']},
      sanidad:{opciones:['ok'],porcentajesEnfermedades:{}},
      flores:{opciones:['ok']},raices:{opciones:['ok']}},
    porcentajeInvalidasGlobal:0,...overrides
  }};
}
function responseSink(){
  return {headers:{},statusCode:200,body:null,
    setHeader(k,v){this.headers[k]=v;return this},
    status(v){this.statusCode=v;return this},
    json(v){this.body=v;return this}
  };
}
function qcStore(options={}){
  const source={id:'QC1',tipo:'carga',dia:15,partida:'PART1'};
  const state={doc:null,revision:0,puts:0};
  const fetcher=async (url,opts={})=>{
    const m=opts.method||'GET',p=String(url);
    assert.equal(opts.headers.Authorization,'Bearer fake-service');
    if(p.includes('/lasala-control-items-v2-carga-q0/QC1.json')){
      assert.equal(m,'GET');return reply(200,source);
    }
    if(p.includes('/lasala-qc-mediciones-v1/QC1.json')){
      if(m==='GET')return reply(200,state.doc,
        options.missingEtag?undefined:'"q'+state.revision+'"');
      if(m==='PUT'){
        state.puts++;
        assert.equal(opts.headers['if-match'],'"q'+state.revision+'"');
        if(options.forceConflict)return reply(412,state.doc,'"q1"');
        state.doc=JSON.parse(opts.body);state.revision++;
        return reply(200,null);
      }
    }
    throw Error('Unexpected QC request '+m+' '+p);
  };
  return {state,fetcher};
}
test('QC v6 first write succeeds without persisting old bandejas/scoring',async()=>{
  actorState.role='TECNICO';
  const {state,fetcher}=qcStore();
  const res=responseSink();
  await withFetch(fetcher,()=>qc(qcRequest(),res));
  assert.equal(res.statusCode,200);
  assert.equal(res.body.version,1);
  assert.equal(state.doc.schemaVersion,6);
  assert.equal(state.doc.resultadoQC,null);
  assert.ok(!Object.hasOwn(state.doc,'bandejasInspeccionadas'));
  assert.equal(state.puts,1);
});
test('QC version mismatch 409 does not overwrite previously stored inspection',async()=>{
  actorState.role='TECNICO';
  const {state,fetcher}=qcStore();
  await withFetch(fetcher,async()=>{
    await qc(qcRequest(),responseSink());
    const prior=JSON.stringify(state.doc);
    const response=responseSink();
    await qc(qcRequest(),response);
    assert.equal(response.statusCode,409);
    assert.equal(response.body.error,'CONCURRENT_MODIFICATION');
    assert.equal(JSON.stringify(state.doc),prior);
    assert.equal(state.puts,1);
  });
});
test('QC ETag 412 returns 409 and does not overwrite',async()=>{
  actorState.role='TECNICO';
  const {state,fetcher}=qcStore({forceConflict:true});
  const res=responseSink();
  await withFetch(fetcher,()=>qc(qcRequest(),res));
  assert.equal(res.statusCode,409);
  assert.equal(res.body.error,'CONCURRENT_MODIFICATION');
  assert.equal(state.doc,null);
  assert.equal(state.puts,1);
});
test('QC absent ETag blocks the write and exposes non-sensitive diagnostic',async()=>{
  actorState.role='TECNICO';
  const {state,fetcher}=qcStore({missingEtag:true});
  const res=responseSink();
  await withFetch(fetcher,()=>qc(qcRequest(),res));
  assert.equal(res.statusCode,503);
  assert.equal(res.body.diagnostic,'QC_ETAG_MISSING');
  assert.equal(state.puts,0);
});
test('QC CARGADOR cannot write Tunel, even with a valid token',async()=>{
  actorState.role='CARGADOR';
  const {state,fetcher}=qcStore();
  const res=responseSink();
  await withFetch(fetcher,()=>qc(qcRequest({tipo:'tunel'}),res));
  assert.equal(res.statusCode,403);
  assert.equal(res.body.error,'FORBIDDEN');
  assert.equal(state.puts,0);
});
