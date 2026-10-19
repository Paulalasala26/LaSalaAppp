'use strict';
// ViguerAPP TEST: galería de fotos SharePoint por registro QC.
// Solo lectura, independiente del circuito histórico de fotos Firebase.
const crypto=require('node:crypto');
const {
  verifyFirebaseIdToken,serviceAccount,serviceAccessToken,readKey,validHash,httpError
}=require('./admin-users')._adminCatalogHelpers;
const DB='https://la-sala-app-test-default-rtdb.europe-west1.firebasedatabase.app';
const DRIVE_ID='b!ltDlxMPStUSPKosa8hjEBT4XEdc922lLvESLlmS3tQy9OIm9vYUbQaLFfZMlWFvb';
const PREFIX='lasala-qc-fotos-sharepoint-v1';
const APP_ID='30160dc5-85af-4134-b865-86d1ff8fadbd';
const PHOTO_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REF_ID=/^[A-Za-z0-9_-]{1,180}$/;
const SHA=/^[0-9a-f]{64}$/i;
const GRAPH_ITEM=/^[A-Za-z0-9!_=-]{8,220}$/;
function refOf(q){
  const dia=typeof q?.dia==='string'&&/^\d+$/.test(q.dia)?Number(q.dia):q?.dia;
  if(!REF_ID.test(q?.id)||!['tunel','carga'].includes(q?.tipo)||
    !Number.isInteger(dia)||dia<15||dia>4000)throw httpError(400,'INVALID_REFERENCE');
  return {id:q.id,tipo:q.tipo,dia};
}
async function readDb(path,token){
  const r=await fetch(DB+'/'+path+'.json',{
    headers:{Authorization:'Bearer '+token},cache:'no-store',
    signal:AbortSignal.timeout(12000)
  });
  if(!r.ok)throw httpError(503,'FIREBASE_READ_FAILED');
  const v=await r.json();
  if(typeof v==='string'){try{return JSON.parse(v)}catch(e){throw httpError(503,'FIREBASE_FORMAT_ERROR')}}
  return v;
}
async function authorize(req){
  const auth=req.headers.authorization||'';
  if(!auth.startsWith('Bearer '))throw httpError(401,'UNAUTHORIZED');
  const actor=await verifyFirebaseIdToken(auth.slice(7).trim());
  const token=await serviceAccessToken(serviceAccount());
  const [roles,users]=await Promise.all([
    readKey('lasala-roles-v1',token),readKey('lasala-users-v1',token)
  ]);
  if(roles[actor]!=='ADMIN'||!validHash(users[actor]))
    throw httpError(403,'FORBIDDEN');
  return {actor,token};
}
async function sourceRecord(ref,token){
  const key='lasala-control-items-v2-'+ref.tipo+'-q'+Math.floor((ref.dia-15)/14);
  const item=await readDb(encodeURIComponent(key)+'/'+encodeURIComponent(ref.id),token);
  if(!item||item.id!==ref.id||item.tipo!==ref.tipo||item.dia!==ref.dia)
    throw httpError(409,'SOURCE_NOT_FOUND_OR_CHANGED');
  return item;
}
function sharepointUrl(text){
  try{
    const url=new URL(text);
    if(url.protocol!=='https:'||url.hostname!=='viveroslasala.sharepoint.com')return null;
    const path=decodeURIComponent(url.pathname);
    if(!path.startsWith('/sites/Tecnologia/Documentos compartidos/Recursos/10 - ViguerAPP/10 - Fotos QC/'))
      return null;
    if(url.username||url.password||url.search||url.hash)return null;
    return url.toString();
  }catch(e){return null}
}
function checkedRecord(entry,key,ref){
  if(!entry||typeof entry!=='object'||Array.isArray(entry)||
     entry.schemaVersion!==1||entry.photoId!==key||!PHOTO_ID.test(key)||
     entry.registroId!==ref.id||entry.tipo!==ref.tipo||entry.dia!==ref.dia||
     !SHA.test(entry.sha256)||!GRAPH_ITEM.test(entry.sharepoint?.itemId)||
     entry.sharepoint.driveId!==DRIVE_ID)
    throw httpError(503,'PHOTO_INDEX_INVALID');
  const url=sharepointUrl(entry.sharepoint.webUrl);
  if(!url)throw httpError(503,'PHOTO_LINK_INVALID');
  if(typeof entry.capturedAt!=='string'||!Number.isFinite(Date.parse(entry.capturedAt)))
    throw httpError(503,'PHOTO_DATE_INVALID');
  return {
    photoId:key,capturedAt:entry.capturedAt,uploadedAt:entry.uploadedAt||null,
    name:entry.sharepoint.name||null,webUrl:url,
    tipo:ref.tipo,partida:entry.metadata?.partida||null,
    invernadero:entry.metadata?.invernadero||null,
    ubicacionEstado:entry.metadata?.ubicacionEstado||null,
    usuario:entry.metadata?.usuario||null,
    sha256:entry.sha256,itemId:entry.sharepoint.itemId
  };
}
async function gallery(ref,token){
  const path=encodeURIComponent(PREFIX)+'/'+encodeURIComponent(ref.id);
  const map=await readDb(path,token);
  if(map==null)return [];
  if(typeof map!=='object'||Array.isArray(map))throw httpError(503,'PHOTO_INDEX_INVALID');
  const entries=Object.entries(map);
  if(entries.length>500)throw httpError(503,'PHOTO_INDEX_EXCEEDS_LIMIT');
  return entries.map(([id,item])=>checkedRecord(item,id,ref))
    .sort((a,b)=>b.capturedAt.localeCompare(a.capturedAt)||a.photoId.localeCompare(b.photoId));
}
async function graphToken(){
  const tenant=process.env.GRAPH_QC_TENANT_ID;
  const client=process.env.GRAPH_QC_CLIENT_ID;
  const secret=process.env.GRAPH_QC_CLIENT_SECRET;
  if(!tenant||!secret||client!==APP_ID||!/^[0-9a-f-]{36}$/i.test(tenant))
    throw httpError(503,'GRAPH_NOT_CONFIGURED');
  const r=await fetch('https://login.microsoftonline.com/'+tenant+'/oauth2/v2.0/token',{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'client_credentials',client_id:client,
      client_secret:secret,scope:'https://graph.microsoft.com/.default'}).toString(),
    cache:'no-store',signal:AbortSignal.timeout(12000)
  });
  if(!r.ok)throw httpError(502,'GRAPH_TOKEN_FAILED');
  const value=await r.json();
  if(typeof value.access_token!=='string')throw httpError(502,'GRAPH_TOKEN_FAILED');
  return value.access_token;
}
async function photoBytes(item){
  const token=await graphToken();
  // El ID procede exclusivamente del índice del registro autenticado.
  const url='https://graph.microsoft.com/v1.0/drives/'+
    encodeURIComponent(DRIVE_ID)+'/items/'+encodeURIComponent(item.itemId)+'/content';
  const r=await fetch(url,{
    headers:{Authorization:'Bearer '+token},cache:'no-store',
    signal:AbortSignal.timeout(20000)
  });
  if(r.status===401||r.status===403)throw httpError(403,'GRAPH_READ_DENIED');
  if(!r.ok)throw httpError(502,'GRAPH_PHOTO_READ_FAILED');
  const length=r.headers.get('content-length');
  if(length&&Number(length)>2700000)throw httpError(413,'PHOTO_TOO_LARGE');
  const buffer=Buffer.from(await r.arrayBuffer());
  if(buffer.length<100||buffer.length>2700000)throw httpError(413,'PHOTO_SIZE_INVALID');
  if(crypto.createHash('sha256').update(buffer).digest('hex')!==item.sha256)
    throw httpError(409,'PHOTO_CHECKSUM_MISMATCH');
  let mime=null;
  if(buffer[0]===255&&buffer[1]===216&&buffer[2]===255)mime='image/jpeg';
  else if(buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';
  else if(buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP')mime='image/webp';
  else if(buffer.toString('ascii',4,8)==='ftyp')mime='image/heic';
  if(!mime)throw httpError(503,'PHOTO_MIME_INVALID');
  return {buffer,mime};
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  }
  try{
    const ref=refOf(req.query||{});
    const session=await authorize(req);
    await sourceRecord(ref,session.token);
    const all=await gallery(ref,session.token);
    const requested=req.query?.image;
    if(requested!==undefined){
      if(typeof requested!=='string'||!PHOTO_ID.test(requested))
        throw httpError(400,'INVALID_PHOTO_ID');
      const item=all.find(x=>x.photoId===requested);
      if(!item)throw httpError(404,'PHOTO_NOT_FOUND');
      const photo=await photoBytes(item);
      res.setHeader('Content-Type',photo.mime);
      res.setHeader('Content-Disposition','inline');
      return res.status(200).send(photo.buffer);
    }
    return res.status(200).json({
      ok:true,registroId:ref.id,tipo:ref.tipo,total:all.length,
      fotos:all.map(({itemId,sha256,...safe})=>safe)
    });
  }catch(e){
    const status=e.httpStatus||503;
    if(status>=500)console.error('QC_GALLERY_TEST',e.code||e.message);
    return res.status(status).json({error:e.code||'SERVICE_UNAVAILABLE'});
  }
};
