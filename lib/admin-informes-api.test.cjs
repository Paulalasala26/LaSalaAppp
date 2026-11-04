'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../api/admin-qc-dashboard.js'),'utf8');
const exporter=require('./admin-informes-export');
const sampleTasks={source:'tareas-v1',readonly:true,rows:[
  {id:'T-001',titulo:'Revisar invernadero',estado:'pendiente',origen:'manual'}
],totals:{registros:1}};
function setup(){
  const calls={db:[],queries:0,jwt:0};
  const controls={
    'ctrl1':{
      id:'ctrl1',tipo:'carga',partida:'26X001',dia:157,
      color:{ok:true},tamano:{ok:true},sanidad:{ok:true},
      flores:{ok:true},raices:{ok:true}
    }
  };
  const helpers={
    verifyFirebaseIdToken:async token=>{
      calls.jwt++;
      if(token==='good')return 'ADMIN';
      if(token==='regante')return 'REGANTE1';
      throw Object.assign(new Error('UNAUTHORIZED'),{code:'UNAUTHORIZED',httpStatus:401});
    },
    serviceAccount:()=>({}),
    serviceAccessToken:async()=> 'service',
    readKey:async key=>{
      calls.db.push(key);
      if(key==='lasala-roles-v1')return {ADMIN:'ADMIN',REGANTE1:'REGANTE'};
      if(key==='lasala-users-v1')return {ADMIN:{},REGANTE1:{}};
      if(key==='lasala-control-items-v2-index')return {shards:{
        'carga|10':{key:'lasala-control-items-v2-carga-q10',tipo:'carga',q:10}
      }};
      if(key==='lasala-control-items-v2-carga-q10')return controls;
      if(key==='lasala-qc-mediciones-v1')return {};
      throw Error('Unexpected database read: '+key);
    },
    validHash:()=>true,
    httpError:(httpStatus,code)=>Object.assign(new Error(code),{httpStatus,code})
  };
  function fakeRequire(id){
    if(id==='./admin-users')return {_adminCatalogHelpers:helpers};
    if(id==='../lib/admin-informes-export')return exporter;
    if(id==='../lib/admin-tareas-read')return {query:async()=>{
      calls.queries++;return sampleTasks;
    }};
    throw Error('Unexpected require '+id);
  }
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,require:fakeRequire,console},
    {filename:'api/admin-qc-dashboard.js',timeout:2000});
  const handler=module.exports;
  const run=async(method,query={},token='good')=>{
    const res={
      headers:{},statusCode:200,body:undefined,
      setHeader(k,v){this.headers[k.toLowerCase()]=v;},
      status(n){this.statusCode=n;return this;},
      json(x){this.body=x;return this;},
      send(x){this.body=x;return this;}
    };
    await handler({method,query,headers:token?{authorization:'Bearer '+token}:{}},res);
    return res;
  };
  return {calls,run};
}
test('GET ADMIN: CSV seguro sin nueva API y sin escrituras',async()=>{
  const {run,calls}=setup();
  const r=await run('GET',{modo:'informes',seccion:'tareas',formato:'csv'});
  assert.equal(r.statusCode,200);
  assert.match(r.headers['content-type'],/text\/csv/);
  assert.match(r.headers['content-disposition'],/^attachment;/);
  assert.equal(r.headers['cache-control'],'no-store');
  assert.match(r.body,/Revisar invernadero/);
  assert.equal(calls.queries,1);
  assert.deepEqual(calls.db,['lasala-roles-v1','lasala-users-v1']);
});
test('HTML imprimible usa CSP estricta y salida inline',async()=>{
  const {run}=setup();
  const r=await run('GET',{modo:'informes',seccion:'tareas',formato:'html'});
  assert.equal(r.statusCode,200);
  assert.match(r.headers['content-security-policy'],/default-src 'none'/);
  assert.match(r.headers['content-disposition'],/^inline;/);
  assert.match(r.body,/<table>/);
  assert.doesNotMatch(r.body,/<script/);
});
test('403 rol no ADMIN y 401 sin autenticación, sin consultar datos de informes',async()=>{
  const {run,calls}=setup();
  const notAdmin=await run('GET',{modo:'informes',seccion:'tareas',formato:'csv'},'regante');
  assert.equal(notAdmin.statusCode,403);
  assert.equal(notAdmin.body.error,'FORBIDDEN');
  const noLogin=await run('GET',{modo:'informes',seccion:'tareas',formato:'csv'},'');
  assert.equal(noLogin.statusCode,401);
  assert.equal(calls.queries,0);
});
test('405 POST sin auth ni lecturas, incluso para exportaciones',async()=>{
  const {run,calls}=setup();
  const r=await run('POST',{modo:'informes',seccion:'tareas',formato:'csv'});
  assert.equal(r.statusCode,405);
  assert.equal(r.headers.allow,'GET');
  assert.equal(calls.jwt,0);
  assert.deepEqual(calls.db,[]);
});
test('400 selección desconocida antes de acceder a Firebase',async()=>{
  const {run,calls}=setup();
  const r=await run('GET',{modo:'informes',seccion:'desconocida',formato:'csv'});
  assert.equal(r.statusCode,400);
  assert.equal(calls.jwt,0);
  assert.deepEqual(calls.db,[]);
});
test('conserva la respuesta JSON preexistente para modo tareas',async()=>{
  const {run}=setup();
  const r=await run('GET',{modo:'tareas'});
  assert.equal(r.statusCode,200);
  assert.equal(r.body.ok,true);
  assert.equal(r.body.rows[0].id,'T-001');
});
test('QC y Partidas leen la misma fuente, sin escrituras ni scoring',async()=>{
  const {run,calls}=setup();
  const common={modo:'informes',tipo:'carga',from:'2026-11-04',to:'2026-11-04',formato:'csv'};
  const qc=await run('GET',{...common,seccion:'qc'});
  assert.equal(qc.statusCode,200);
  assert.match(qc.body,/26X001/);
  assert.doesNotMatch(qc.body,/Scoring|Puntuación|Media/i);
  const partidas=await run('GET',{...common,seccion:'partidas'});
  assert.equal(partidas.statusCode,200);
  assert.match(partidas.body,/26X001/);
  assert.equal(calls.db.filter(x=>x==='lasala-qc-mediciones-v1').length,1);
});
