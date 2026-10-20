'use strict';
// TEST únicamente. Mediciones QC cuantitativas en un nodo ADITIVO:
// - Jamás actualiza lasala-control-items-v1 ni los segmentos v2.
// - Escribe por registro con control de versión + ETag (sin sobrescritura silenciosa).
// - Solo ADMIN activo y autenticado.
const {
  verifyFirebaseIdToken,serviceAccount,serviceAccessToken,readKey,validHash,httpError
}=require('./admin-users')._adminCatalogHelpers;
const DB='https://la-sala-app-test-default-rtdb.europe-west1.firebasedatabase.app';
const PREFIX='lasala-qc-mediciones-v1';
const OPTIONS=Object.freeze({
  color:['verde','amarillo','verdeClaro','ok'],
  tamano:['grande','pequeno','ok'],
  sanidad:['ok','enferma'],
  flores:['si','no'],
  raices:['pocaRaiz','raizVariedad','ok']
});
function categoryIssue(category,values,total){
  const notEvaluated=values.noEvaluada||0;
  if(category!=='raices'){
    const sum=Object.values(values).reduce((a,b)=>a+b,0);
    if(sum!==total)return sum<total?'Faltan '+(total-sum)+' bandejas.':'Sobran '+(sum-total)+' bandejas.';
    return '';
  }
  // Los dos defectos de raíces pueden coexistir en una bandeja.
  // OK y No evaluada no se solapan con bandejas defectuosas.
  const evaluated=total-notEvaluated,ok=values.ok||0;
  if(ok>evaluated)return 'OK supera las evaluadas en '+(ok-evaluated)+' bandejas.';
  const affected=evaluated-ok;
  const low=values.pocaRaiz||0,inVariety=values.raizVariedad||0;
  const minimum=Math.max(low,inVariety),maximum=low+inVariety;
  if(affected<minimum)return 'Sobran '+(minimum-affected)+' bandejas con defectos respecto a las evaluadas.';
  if(affected>maximum)return 'Faltan '+(affected-maximum)+' bandejas por clasificar.';
  return '';
}
  const TYPES=new Set(['tunel','carga']);
const RE_ID=/^[A-Za-z0-9_-]{1,180}$/;
const PART_RE=/^[A-Za-z0-9._-]{1,100}$/;
function inputOf(req){
  let b=req.body;
  if(typeof b==='string'){try{b=JSON.parse(b);}catch(_){throw httpError(400,'INVALID_BODY');}}
  if(!b||typeof b!=='object'||Array.isArray(b))throw httpError(400,'INVALID_BODY');
  return b;
}
function validRef(source){
  const day=typeof source?.dia==='string'&&/^\d+$/.test(source.dia)?Number(source.dia):source?.dia;
  if(!source||!RE_ID.test(source.id)||!TYPES.has(source.tipo)||
    !Number.isInteger(day)||day<15||day>4000)
    throw httpError(400,'INVALID_REFERENCE');
  return {id:source.id,tipo:source.tipo,dia:day};
}
function validQty(v){
  return Number.isSafeInteger(v)&&v>0&&v<=10000000;
}
function validateMeasurements(input){
  if(!validQty(input.bandejasInspeccionadas))throw httpError(400,'INVALID_INSPECTED');
  const value=input.mediciones;
  if(!value||typeof value!=='object'||Array.isArray(value))throw httpError(400,'INVALID_MEASUREMENTS');
  if(Object.keys(value).sort().join('|')!==Object.keys(OPTIONS).sort().join('|'))
    throw httpError(400,'INVALID_MEASUREMENTS');
  const clean={};
  for(const [cat,allowed] of Object.entries(OPTIONS)){
    const source=value[cat];
    if(!source||typeof source!=='object'||Array.isArray(source)||Object.keys(source).length===0)
      throw httpError(400,'MISSING_CATEGORY');
    const entries=Object.entries(source);
    const choices=new Set([...allowed,'noEvaluada']);
    clean[cat]={};
    for(const [key,qty] of entries){
      if(!choices.has(key)||!validQty(qty)||qty>input.bandejasInspeccionadas)
        throw httpError(400,'INVALID_QUANTITY');
      clean[cat][key]=qty;
    }
    if(categoryIssue(cat,clean[cat],input.bandejasInspeccionadas))throw httpError(400,'CATEGORY_TOTAL_MISMATCH');
  }
  return clean;
}
function pathFor(id){return DB+'/'+PREFIX+'/'+encodeURIComponent(id)+'.json';}
function sourcePath(ref){
  const q=Math.floor((ref.dia-15)/14);
  const key='lasala-control-items-v2-'+ref.tipo+'-q'+q;
  return DB+'/'+encodeURIComponent(key)+'/'+encodeURIComponent(ref.id)+'.json';
}
async function getJson(url,token,etag){
  const r=await fetch(url,{headers:{
    Authorization:'Bearer '+token,...(etag?{'X-Firebase-ETag':'true'}:{})
  },cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error('Firebase read failed: '+r.status);
  let val=await r.json();
  if(typeof val==='string'){try{val=JSON.parse(val);}catch(_){throw new Error('INVALID_STORED_JSON');}}
  return {value:val,etag:r.headers.get('ETag')};
}
async function legacyRecord(ref,token){
  const {value}=await getJson(sourcePath(ref),token,false);
  if(!value||typeof value!=='object'||Array.isArray(value)||
     value.id!==ref.id||value.tipo!==ref.tipo||value.dia!==ref.dia||
     typeof value.partida!=='string'||!PART_RE.test(value.partida))
    throw httpError(409,'SOURCE_NOT_FOUND_OR_CHANGED');
  return value;
}
function validateStored(entry,ref,partida){
  if(entry===null)return {version:0};
  if(!entry||typeof entry!=='object'||Array.isArray(entry)||
     entry.schemaVersion!==1||!Number.isInteger(entry.version)||entry.version<1||
     entry.legacy?.id!==ref.id||entry.legacy?.tipo!==ref.tipo||
     entry.legacy?.dia!==ref.dia||entry.legacy?.partida!==partida)
    throw httpError(409,'SAVED_CONFLICT');
  return entry;
}
async function checkQCActor(req,ref){
  const raw=req.headers.authorization||'';
  if(!raw.startsWith('Bearer '))throw httpError(401,'UNAUTHORIZED');
  const actor=await verifyFirebaseIdToken(raw.slice(7).trim());
  const token=await serviceAccessToken(serviceAccount());
  const [roles,accounts]=await Promise.all([
    readKey('lasala-roles-v1',token),readKey('lasala-users-v1',token)
  ]);
  const role=roles[actor];
  const authorized=role==='ADMIN'||role==='TECNICO'||
    (role==='CARGADOR'&&ref.tipo==='carga');
  if(!authorized||!validHash(accounts[actor]))throw httpError(403,'FORBIDDEN');
  return {actor,token};
}
// Búsqueda forense PUNTUAL, SOLO LECTURA, para identificar un dato ficticio en TEST.
// Devuelve únicamente referencias, usuario, instante y patrón de cantidades.
// ADMIN autenticado y activo; no permite consultar usuarios, ni escribir o borrar.
async function buscarQCSeptiembreHoy(req,res){
  const raw=req.headers.authorization||'';
  if(!raw.startsWith('Bearer '))throw httpError(401,'UNAUTHORIZED');
  const actor=await verifyFirebaseIdToken(raw.slice(7).trim());
  const token=await serviceAccessToken(serviceAccount());
  const [roles,accounts]=await Promise.all([
    readKey('lasala-roles-v1',token),readKey('lasala-users-v1',token)
  ]);
  if(roles[actor]!=='ADMIN'||!validHash(accounts[actor]))
    throw httpError(403,'FORBIDDEN');
  const all=await readKey(PREFIX,token);
  // 20/10/2026 en hora peninsular = desde el 19/10 22:00Z hasta el 20/10 22:00Z.
  const first=Date.parse('2026-10-19T22:00:00.000Z');
  const last=Date.parse('2026-10-20T22:00:00.000Z');
  // Día QC 15 = 15/06/2026; septiembre corresponde a días 93 a 122.
  const matches=[];
  for(const [id,v] of Object.entries(all)){
    if(!RE_ID.test(id)||!v||typeof v!=='object'||Array.isArray(v))continue;
    const ref=v.legacy||{},changed=Date.parse(v.updatedAt);
    if(ref.id!==id||!TYPES.has(ref.tipo)||!Number.isInteger(ref.dia)||
      ref.dia<93||ref.dia>122||!PART_RE.test(ref.partida)||
      !Number.isFinite(changed)||changed<first||changed>=last)continue;
    const patternFive=v.bandejasInspeccionadas===5&&Object.keys(OPTIONS).every(cat=>{
      const parts=v.mediciones?.[cat];
      return parts&&typeof parts==='object'&&!Array.isArray(parts)&&
        Object.values(parts).length===1&&Object.values(parts)[0]===5;
    });
    matches.push({
      id,partida:ref.partida,tipo:ref.tipo,dia:ref.dia,
      updatedAt:v.updatedAt,updatedBy:v.updatedBy||'',version:v.version,
      bandejasInspeccionadas:v.bandejasInspeccionadas,patronCinco:!!patternFive
    });
  }
  matches.sort((a,b)=>Number(b.patronCinco)-Number(a.patronCinco)||
    b.updatedAt.localeCompare(a.updatedAt));
  return res.status(200).json({
    ok:true,scope:'TEST',actualizadoDia:'2026-10-20',
    inspeccionesMes:'2026-09',total:matches.length,
    resultados:matches.slice(0,100),truncado:matches.length>100
  });
}
// ÚNICA retirada autorizada de una medición ficticia, sin tocar control legacy.
// Bloqueada para cualquier ID o contenido distinto al identificado el 20/10.
const QC_TEST_CLEANUP=Object.freeze({
 id:'control_1790060109011_1_7s2ztv',
 tipo:'tunel',partida:'26X01254',
 updatedAt:'2026-10-20T08:19:08.922Z',updatedBy:'PILAR'
});
// Diagnóstico estricto SOLO LECTURA de la retirada autorizada.
// No permite consultar otras partidas; no cambia ningún dato.
async function diagnosticarRetiradaFicticiaQC(req,res){
 const raw=req.headers.authorization||'';
 if(!raw.startsWith('Bearer '))throw httpError(401,'UNAUTHORIZED');
 const actor=await verifyFirebaseIdToken(raw.slice(7).trim());
 const token=await serviceAccessToken(serviceAccount());
 const [roles,accounts]=await Promise.all([
  readKey('lasala-roles-v1',token),readKey('lasala-users-v1',token)
 ]);
 if(roles[actor]!=='ADMIN'||!validHash(accounts[actor]))
  throw httpError(403,'FORBIDDEN');
 const prior=await getJson(pathFor(QC_TEST_CLEANUP.id),token,true);
 if(prior.value===null)return res.status(200).json({ok:true,exists:false,checks:{absent:true}});
 const v=prior.value,meta=v?.legacy;
 const cats=Object.keys(OPTIONS);
 const checks={
  etagPresent:!!prior.etag,
  id:meta?.id===QC_TEST_CLEANUP.id,
  tipo:meta?.tipo===QC_TEST_CLEANUP.tipo,
  partida:meta?.partida===QC_TEST_CLEANUP.partida,
  diaSeptiembre:Number.isInteger(meta?.dia)&&meta.dia>=93&&meta.dia<=122,
  schemaVersion:v?.schemaVersion===1,
  version:v?.version===1,
  updatedAt:v?.updatedAt===QC_TEST_CLEANUP.updatedAt,
  updatedBy:v?.updatedBy===QC_TEST_CLEANUP.updatedBy,
  bandejas:v?.bandejasInspeccionadas===5,
  resultadoQCVacio:v?.resultadoQC==null,
  cincoCategorias:!!v?.mediciones&&typeof v.mediciones==='object'&&
   !Array.isArray(v.mediciones)&&Object.keys(v.mediciones).length===cats.length&&
   cats.every(cat=>{
    const qty=v.mediciones[cat];
    const entries=qty&&typeof qty==='object'&&!Array.isArray(qty)?Object.entries(qty):[];
    return entries.length===1&&[...OPTIONS[cat],'noEvaluada'].includes(entries[0][0])&&entries[0][1]===5;
   })
 };
 const differences=Object.keys(checks).filter(k=>!checks[k]);
 return res.status(200).json({ok:true,exists:true,
  id:QC_TEST_CLEANUP.id,partida:QC_TEST_CLEANUP.partida,
  versionActual:Number.isInteger(v.version)?v.version:null,
  updatedAtActual:typeof v.updatedAt==='string'?v.updatedAt:null,
  updatedByActual:typeof v.updatedBy==='string'?v.updatedBy:null,
  resultadoQCEstado:v.resultadoQC===null?'NULL':
   Object.prototype.hasOwnProperty.call(v,'resultadoQC')?'NO_NULL':'NO_PRESENTE',
  checks,diferencias:differences
 });
}
async function retirarSoloMedicionFicticiaQC(req,res){
 const raw=req.headers.authorization||'';
 if(!raw.startsWith('Bearer '))throw httpError(401,'UNAUTHORIZED');
 const actor=await verifyFirebaseIdToken(raw.slice(7).trim());
 const token=await serviceAccessToken(serviceAccount());
 const [roles,accounts]=await Promise.all([
  readKey('lasala-roles-v1',token),readKey('lasala-users-v1',token)
 ]);
 if(roles[actor]!=='ADMIN'||!validHash(accounts[actor]))
  throw httpError(403,'FORBIDDEN');
 const ref={id:QC_TEST_CLEANUP.id,tipo:'tunel',dia:0};
 // Leer con ETag antes de cualquier cambio; nunca tomar el ID del cliente.
 const prior=await getJson(pathFor(ref.id),token,true);
 if(prior.value===null)return res.status(200).json({ok:true,alreadyAbsent:true});
 const v=prior.value,meta=v?.legacy;
 if(!prior.etag||!meta||meta.id!==QC_TEST_CLEANUP.id||
    meta.tipo!==QC_TEST_CLEANUP.tipo||meta.partida!==QC_TEST_CLEANUP.partida||
    !Number.isInteger(meta.dia)||meta.dia<93||meta.dia>122||
    v.schemaVersion!==1||v.version!==1||
    v.updatedAt!==QC_TEST_CLEANUP.updatedAt||
    v.updatedBy!==QC_TEST_CLEANUP.updatedBy||
    v.bandejasInspeccionadas!==5||v.resultadoQC!=null)
  throw httpError(409,'TEST_MEASUREMENT_CHANGED');
 const cats=Object.keys(OPTIONS);
 if(!v.mediciones||typeof v.mediciones!=='object'||Array.isArray(v.mediciones)||
    Object.keys(v.mediciones).length!==cats.length||
    !cats.every(cat=>{
      const qty=v.mediciones[cat],entries=qty&&typeof qty==='object'&&!Array.isArray(qty)?
       Object.entries(qty):[];
      return entries.length===1&&([...OPTIONS[cat],'noEvaluada'].includes(entries[0][0]))&&entries[0][1]===5;
    }))
  throw httpError(409,'TEST_MEASUREMENT_CONTENT_CHANGED');
 ref.dia=meta.dia;
 // Verificar que la inspección ORIGINAL todavía existe y coincide.
 const source=await legacyRecord(ref,token);
 if(source.partida!==QC_TEST_CLEANUP.partida)
  throw httpError(409,'SOURCE_CHANGED');
 const del=await fetch(pathFor(ref.id),{
  method:'DELETE',
  headers:{Authorization:'Bearer '+token,'if-match':prior.etag},
  cache:'no-store',signal:AbortSignal.timeout(10000)
 });
 if(del.status===412)throw httpError(409,'CONCURRENT_MODIFICATION');
 if(!del.ok)throw new Error('Firebase cleanup delete failed: '+del.status);
 const after=await getJson(pathFor(ref.id),token,false);
 if(after.value!==null)throw new Error('Firebase cleanup not verified');
 console.info('QC_TEST_MEASUREMENT_REMOVED',actor,ref.tipo,ref.id);
 return res.status(200).json({ok:true,deleted:true,
  id:QC_TEST_CLEANUP.id,partida:QC_TEST_CLEANUP.partida,
  originalControlPreserved:true});
}
// Consulta agrupada de estados cuantitativos: comparte despliegue con QC.
// Solo lectura, validación por ID/tipo/día/partida; nunca escribe Firebase.
function validarConsultaEstados(req){
  if(req.modo!=='estados'||!TYPES.has(req.tipo)||
     !Number.isInteger(req.dia)||req.dia<15||req.dia>4000||
     !Array.isArray(req.registros)||req.registros.length<1||req.registros.length>60)
    throw httpError(400,'INVALID_STATUS_QUERY');
  const vistos=new Set();
  for(const x of req.registros){
    if(!x||typeof x!=='object'||!RE_ID.test(x.id)||
       typeof x.partida!=='string'||!PART_RE.test(x.partida)||vistos.has(x.id))
      throw httpError(400,'INVALID_STATUS_REFERENCE');
    vistos.add(x.id);
  }
  return req;
}
async function consultarEstadosQC(req,res,data){
  const q=validarConsultaEstados(data);
  const {token}=await checkQCActor(req,{tipo:q.tipo});
  const estados=Object.create(null);
  for(let i=0;i<q.registros.length;i+=8){
    const refs=q.registros.slice(i,i+8);
    const loaded=await Promise.all(refs.map(async ref=>{
      const {value}=await getJson(pathFor(ref.id),token,false);
      if(value===null)return false;
      try{
        const stored=validateStored(value,{id:ref.id,tipo:q.tipo,dia:q.dia},ref.partida);
        if(stored.version<1)return false;
        validateMeasurements(stored);
        return true;
      }catch(_){return false;}
    }));
    refs.forEach((r,index)=>{estados[r.id]=loaded[index]});
  }
  return res.status(200).json({ok:true,tipo:q.tipo,dia:q.dia,estados});
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'&&req.method!=='POST'){
    res.setHeader('Allow','GET, POST');
    return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  }
  let phase='REQUEST';
  try{
    const request=req.method==='GET'?req.query:inputOf(req);
    if(req.method==='GET'&&request?.modo==='diagnosticar-medicion-ficticia-20oct'){
      phase='TEST_CLEANUP_DIAGNOSTIC';
      return await diagnosticarRetiradaFicticiaQC(req,res);
    }
    if(req.method==='GET'&&request?.modo==='buscar-qc-septiembre-hoy'){
      phase='DIAGNOSTIC_READ';
      return await buscarQCSeptiembreHoy(req,res);
    }
    if(req.method==='POST' && request?.modo==='retirar-medicion-ficticia-20oct'){
      phase='TEST_CLEANUP';
      return await retirarSoloMedicionFicticiaQC(req,res);
    }
    if(req.method==='POST' && request?.modo==='estados'){
      phase='STATUS_READ';
      return await consultarEstadosQC(req,res,request);
    }
    const ref=validRef(request);
    phase='AUTH';
    const {actor,token}=await checkQCActor(req,ref);
    phase='SOURCE';
    const source=await legacyRecord(ref,token);
    if(req.method==='GET'){
      const probe=request.probe==='etag';
      phase='MEASUREMENT_READ';
      const {value,etag}=await getJson(pathFor(ref.id),token,probe);
      const stored=validateStored(value,ref,source.partida);
      return res.status(200).json({ok:true,record:value?{
        version:stored.version,updatedAt:stored.updatedAt,
        updatedBy:stored.updatedBy,bandejasInspeccionadas:stored.bandejasInspeccionadas,
        mediciones:stored.mediciones
      }:null,sourcePartida:source.partida,
      ...(probe?{diagnostic:{etagAvailable:!!etag}}:{})});
    }
    phase='VALIDATION';
    if(request.partida!==source.partida)throw httpError(409,'SOURCE_CHANGED');
    if(!Number.isSafeInteger(request.version)||request.version<0)
      throw httpError(400,'INVALID_VERSION');
    const mediciones=validateMeasurements(request);
    phase='ETAG_READ';
    const stored=await getJson(pathFor(ref.id),token,true);
    if(!stored.etag)throw new Error('Firebase ETag unavailable');
    phase='ETAG_COMPARE';
    const before=validateStored(stored.value,ref,source.partida);
    if(before.version!==request.version)throw httpError(409,'CONCURRENT_MODIFICATION');
    const now=new Date().toISOString();
    const next={
      schemaVersion:1,version:before.version+1,
      legacy:{...ref,partida:source.partida},
      bandejasInspeccionadas:request.bandejasInspeccionadas,
      mediciones,
      createdAt:before.createdAt||now,
      updatedAt:now,updatedBy:actor,
      resultadoQC:null
    };
    phase='WRITE';
    const write=await fetch(pathFor(ref.id),{
      method:'PUT',
      headers:{
        Authorization:'Bearer '+token,
        'Content-Type':'application/json',
        'if-match':stored.etag
      },
      body:JSON.stringify(next),
      signal:AbortSignal.timeout(10000)
    });
    if(write.status===412)throw httpError(409,'CONCURRENT_MODIFICATION');
    if(!write.ok)throw new Error('Firebase write failed: '+write.status);
    console.info('QC_MEASUREMENTS_TEST',actor,ref.tipo,ref.id,'v'+next.version);
    return res.status(200).json({ok:true,version:next.version,updatedAt:now,updatedBy:actor});
  }catch(e){
    const status=e.httpStatus||503;
    if(status===503){
      console.error('QC_MEASUREMENTS_TEST_ERROR',e.message);
      // Diagnóstico de lista cerrada, sin datos personales, URLs ni credenciales.
      const msg=String(e.message||'');
      const failedRead=/^Firebase read failed: (\d{3})$/.exec(msg);
      const failedWrite=/^Firebase write failed: (\d{3})$/.exec(msg);
      const diagnostic=failedWrite?'QC_WRITE_HTTP_'+failedWrite[1]:
        failedRead?'QC_'+phase+'_HTTP_'+failedRead[1]:
        msg==='Firebase ETag unavailable'?'QC_ETAG_MISSING':
        e.name==='TimeoutError'||e.name==='AbortError'?'QC_'+phase+'_TIMEOUT':
        'QC_'+phase+'_SERVICE_ERROR';
      return res.status(503).json({error:'SERVICE_UNAVAILABLE',diagnostic});
    }
    return res.status(status).json({error:e.code});
  }
};
