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
    const choices=new Set(allowed);
    clean[cat]={};
    for(const [key,qty] of entries){
      if(!choices.has(key)||!validQty(qty)||qty>input.bandejasInspeccionadas)
        throw httpError(400,'INVALID_QUANTITY');
      clean[cat][key]=qty;
    }
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
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'&&req.method!=='POST'){
    res.setHeader('Allow','GET, POST');
    return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  }
  try{
    const request=req.method==='GET'?req.query:inputOf(req);
    const ref=validRef(request);
    const {actor,token}=await checkQCActor(req,ref);
    const source=await legacyRecord(ref,token);
    if(req.method==='GET'){
      const {value}=await getJson(pathFor(ref.id),token,false);
      const stored=validateStored(value,ref,source.partida);
      return res.status(200).json({ok:true,record:value?{
        version:stored.version,updatedAt:stored.updatedAt,
        updatedBy:stored.updatedBy,bandejasInspeccionadas:stored.bandejasInspeccionadas,
        mediciones:stored.mediciones
      }:null,sourcePartida:source.partida});
    }
    if(request.partida!==source.partida)throw httpError(409,'SOURCE_CHANGED');
    if(!Number.isSafeInteger(request.version)||request.version<0)
      throw httpError(400,'INVALID_VERSION');
    const mediciones=validateMeasurements(request);
    const stored=await getJson(pathFor(ref.id),token,true);
    if(!stored.etag)throw new Error('Firebase ETag unavailable');
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
    const write=await fetch(pathFor(ref.id)+'?print=silent',{
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
    if(status===503)console.error('QC_MEASUREMENTS_TEST_ERROR',e.message);
    return res.status(status).json({error:status===503?'SERVICE_UNAVAILABLE':e.code});
  }
};
