'use strict';
// API aislada en la rama TEST: contrato de foto + metadatos derivados de Control.
// Solo lectura. Las fotografías históricas y la cola offline NO se modifican.
// La escritura estará bloqueada hasta validar Graph y el almacenamiento definitivo.
const {
  verifyFirebaseIdToken,serviceAccount,serviceAccessToken,readKey,validHash,httpError
}=require('./admin-users')._adminCatalogHelpers;

const DB='https://la-sala-app-test-default-rtdb.europe-west1.firebasedatabase.app';
const GRAPH='https://graph.microsoft.com/v1.0';
const DRIVE_ID='b!ltDlxMPStUSPKosa8hjEBT4XEdc922lLvESLlmS3tQy9OIm9vYUbQaLFfZMlWFvb';
const FOLDER_ID='01WYFOB25JXMOQMUYILFEJSYJZCV3AIV2N';
const FOLDER_NAME='10 - Fotos QC';
const APP_CLIENT_ID='30160dc5-85af-4134-b865-86d1ff8fadbd';
const TYPES=Object.freeze({tunel:'10 - Túnel',carga:'20 - Carga'});
const RE_ID=/^[A-Za-z0-9_-]{1,180}$/;
const RE_PARTIDA=/^[A-Za-z0-9._-]{1,100}$/;

function reference(input){
  const id=input?.id,tipo=input?.tipo;
  const dia=typeof input?.dia==='string'&&/^\d+$/.test(input.dia)?
    Number(input.dia):input?.dia;
  if(!RE_ID.test(id)||!Object.hasOwn(TYPES,tipo)||
     !Number.isInteger(dia)||dia<15||dia>4000)
    throw httpError(400,'INVALID_REFERENCE');
  return {id,tipo,dia};
}
async function authorize(req,tipo){
  const raw=req.headers.authorization||'';
  if(!raw.startsWith('Bearer '))throw httpError(401,'UNAUTHORIZED');
  const actor=await verifyFirebaseIdToken(raw.slice(7).trim());
  const firebaseToken=await serviceAccessToken(serviceAccount());
  const [roles,accounts]=await Promise.all([
    readKey('lasala-roles-v1',firebaseToken),readKey('lasala-users-v1',firebaseToken)
  ]);
  const role=roles[actor];
  const allowed=role==='ADMIN'||role==='TECNICO'||(role==='CARGADOR'&&tipo==='carga');
  if(!allowed||!validHash(accounts[actor]))throw httpError(403,'FORBIDDEN');
  return {actor,role,firebaseToken};
}
async function sourceFor(ref,token){
  const shard='lasala-control-items-v2-'+ref.tipo+'-q'+Math.floor((ref.dia-15)/14);
  const uri=DB+'/'+encodeURIComponent(shard)+'/'+encodeURIComponent(ref.id)+'.json';
  const response=await fetch(uri,{
    headers:{Authorization:'Bearer '+token},cache:'no-store',
    signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)throw httpError(503,'CONTROL_READ_FAILED');
  const record=await response.json();
  if(!record||typeof record!=='object'||record.id!==ref.id||
     record.tipo!==ref.tipo||record.dia!==ref.dia||
     !RE_PARTIDA.test(record.partida))
    throw httpError(409,'CONTROL_RECORD_CHANGED');
  return record;
}
function value(v,max=160){
  return typeof v==='string'&&v.trim()?v.trim().slice(0,max):null;
}
function metadata(ref,record,actor){
  // No confiar en metadatos enviados por el cliente: solo la ficha de Firebase.
  const tramos=Array.isArray(record.tramos)?
    record.tramos.filter(x=>x&&Number.isFinite(Number(x.desde))&&
      Number.isFinite(Number(x.hasta))).map(x=>({
        desde:Number(x.desde),hasta:Number(x.hasta)
      })).slice(0,30):[];
  const inv=value(record.invId)||value(record.invernadero);
  return {
    registroId:ref.id,partida:record.partida,tipo:ref.tipo,
    diaInterno:ref.dia,cliente:value(record.cliente),
    variedad:value(record.variedad),clienteVariedad:value(record.clienteVariedad),
    sala:value(record.sala),invernadero:inv,
    calleDesde:record.calleDesde??null,calleHasta:record.calleHasta??null,
    tramos,numBandejas:record.numBandejas??null,
    usuario:actor
  };
}
async function graphToken(){
  const tenant=process.env.GRAPH_QC_TENANT_ID;
  const client=process.env.GRAPH_QC_CLIENT_ID;
  const secret=process.env.GRAPH_QC_CLIENT_SECRET;
  if(!tenant||!client||!secret)throw httpError(503,'GRAPH_NOT_CONFIGURED');
  if(!/^[0-9a-f-]{36}$/i.test(tenant)||client!==APP_CLIENT_ID)
    throw httpError(503,'GRAPH_ID_MISMATCH');
  const r=await fetch('https://login.microsoftonline.com/'+tenant+'/oauth2/v2.0/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({
      client_id:client,client_secret:secret,
      grant_type:'client_credentials',scope:'https://graph.microsoft.com/.default'
    }).toString(),cache:'no-store',signal:AbortSignal.timeout(12000)
  });
  if(!r.ok)throw httpError(502,'GRAPH_TOKEN_FAILED');
  const payload=await r.json();
  if(typeof payload.access_token!=='string')throw httpError(502,'GRAPH_TOKEN_FAILED');
  return payload.access_token;
}
async function verifyFolder(){
  const accessToken=await graphToken();
  const r=await fetch(GRAPH+'/drives/'+encodeURIComponent(DRIVE_ID)+
    '/items/'+encodeURIComponent(FOLDER_ID)+'?$select=id,name,folder',{
      headers:{Authorization:'Bearer '+accessToken},cache:'no-store',
      signal:AbortSignal.timeout(15000)
    });
  if(r.status===401||r.status===403)throw httpError(403,'GRAPH_FOLDER_PERMISSION_DENIED');
  if(!r.ok)throw httpError(502,'GRAPH_FOLDER_READ_FAILED');
  const item=await r.json();
  if(item.id!==FOLDER_ID||item.name!==FOLDER_NAME||!item.folder)
    throw httpError(409,'GRAPH_FOLDER_MISMATCH');
  return true;
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'&&req.method!=='POST'){
    res.setHeader('Allow','GET, POST');
    return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  }
  // Nunca ejecutar escritura en esta fase.
  if(req.method==='POST')return res.status(423).json({error:'SHAREPOINT_UPLOAD_NOT_ENABLED'});
  try{
    const diagnostic=req.query?.action==='check';
    const ref=diagnostic?null:reference(req.query);
    const session=await authorize(req,ref?.tipo||null);
    if(diagnostic&&session.role!=='ADMIN')throw httpError(403,'FORBIDDEN');
    const source=ref?await sourceFor(ref,session.firebaseToken):null;
    await verifyFolder();
    return res.status(200).json({
      ok:true,graphRead:'CONFIRMED',
      uploadEnabled:false,
      ...(ref?{metadata:metadata(ref,source,session.actor),
        carpetaTipo:TYPES[ref.tipo]}:{})
    });
  }catch(e){
    const status=e.httpStatus||503;
    if(status===503||status===502)console.error('QC_SP_READ_TEST',e.code||e.message);
    return res.status(status).json({error:e.code||'SERVICE_UNAVAILABLE'});
  }
};
