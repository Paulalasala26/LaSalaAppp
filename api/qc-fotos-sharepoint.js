'use strict';
const crypto=require('node:crypto');
// API aislada en la rama TEST: contrato de foto + metadatos derivados de Control.
// Escritura aislada y desactivada por defecto. No altera las fotos históricas,
// el guardado Firebase existente ni la cola offline de ViguerAPP.
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
const TYPE_IDS=Object.freeze({
  tunel:'01WYFOB25VQRGN4LJRUNBYJH64ZV6NLQ5C',
  carga:'01WYFOB2YC4C2C65APYVAYBM2ZMYASYUDJ'
});
const PHOTO_INDEX='lasala-qc-fotos-sharepoint-v1';
const UPLOAD_ENABLED=()=>process.env.GRAPH_QC_UPLOAD_ENABLED==='true';
const PHOTO_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONTHS=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
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

function bodyOf(req){
  let b=req.body;
  if(typeof b==='string'){try{b=JSON.parse(b);}catch(_){throw httpError(400,'INVALID_BODY');}}
  if(!b||typeof b!=='object'||Array.isArray(b))throw httpError(400,'INVALID_BODY');
  return b;
}
function photoInput(body){
  const ref=reference(body);
  const photoId=body.photoId;
  if(typeof photoId!=='string'||!PHOTO_RE.test(photoId))throw httpError(400,'INVALID_PHOTO_ID');
  if(typeof body.capturedAt!=='string'||!Number.isFinite(Date.parse(body.capturedAt))||
     !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(body.capturedAt))
    throw httpError(400,'INVALID_CAPTURE_TIME');
  const capturedAt=new Date(body.capturedAt).toISOString();
  const now=Date.now(),captured=Date.parse(capturedAt);
  if(captured>now+300000||captured<now-366*86400000)
    throw httpError(400,'CAPTURE_TIME_OUT_OF_RANGE');
  const data=body.imageData;
  if(typeof data!=='string'||data.length>3700000)throw httpError(413,'PHOTO_TOO_LARGE');
  const match=/^data:(image\/(?:jpeg|png|webp|heic|heif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if(!match||match[2].length%4===1)throw httpError(400,'INVALID_IMAGE');
  const bytes=Buffer.from(match[2],'base64');
  if(bytes.length<100||bytes.length>2700000||
     bytes.toString('base64').replace(/=+$/,'')!==match[2].replace(/=+$/,''))
    throw httpError(400,'INVALID_IMAGE');
  const mime=match[1];
  const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const webp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  const heic=bytes.toString('ascii',4,8)==='ftyp';
  if(!((mime==='image/jpeg'&&jpeg)||(mime==='image/png'&&png)||
       (mime==='image/webp'&&webp)||((mime==='image/heic'||mime==='image/heif')&&heic)))
    throw httpError(400,'IMAGE_FORMAT_MISMATCH');
  const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp',
    'image/heic':'heic','image/heif':'heif'}[mime];
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  return {ref,photoId,capturedAt,bytes,mime,extension,sha256};
}
function photoUrl(ref,photoId){
  return DB+'/'+PHOTO_INDEX+'/'+encodeURIComponent(ref.id)+'/'+encodeURIComponent(photoId)+'.json';
}
async function firebaseGet(url,token,withEtag){
  const res=await fetch(url,{headers:{Authorization:'Bearer '+token,
    ...(withEtag?{'X-Firebase-ETag':'true'}:{})},cache:'no-store',
    signal:AbortSignal.timeout(12000)});
  if(!res.ok)throw httpError(503,'PHOTO_INDEX_READ_FAILED');
  return {value:await res.json(),etag:res.headers.get('ETag')};
}
function verifyPrior(old,photo){
  if(!old)return null;
  if(old.schemaVersion!==1||old.photoId!==photo.photoId||
     old.registroId!==photo.ref.id||old.tipo!==photo.ref.tipo||
     old.dia!==photo.ref.dia||old.sha256!==photo.sha256||old.capturedAt!==photo.capturedAt)
    throw httpError(409,'PHOTO_ID_CONFLICT');
  return old;
}
function localParts(iso){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
    timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
  }).formatToParts(new Date(iso)).map(x=>[x.type,x.value]));
  return {year:p.year,month:p.month,
    label:p.year+p.month+p.day+'_'+p.hour+p.minute+p.second};
}
function safePart(str,fallback){
  const normal=String(str||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^A-Za-z0-9_-]/g,'').slice(0,55);
  return normal||fallback;
}
async function graphCall(token,verb,path,body,contentType){
  const response=await fetch(GRAPH+path,{
    method:verb,headers:{Authorization:'Bearer '+token,
      ...(body?{'Content-Type':contentType||'application/json'}:{})},
    ...(body?{body}:{}),cache:'no-store',signal:AbortSignal.timeout(20000)
  });
  if(response.status===401||response.status===403)
    throw httpError(403,'GRAPH_SELECTED_PERMISSION_DENIED');
  return response;
}
const graphItem=id=>'/drives/'+encodeURIComponent(DRIVE_ID)+'/items/'+encodeURIComponent(id);
async function graphFolder(token,id,name,parentId){
  const r=await graphCall(token,'GET',graphItem(id)+'?$select=id,name,folder,parentReference');
  if(!r.ok)throw httpError(502,'GRAPH_FOLDER_READ_FAILED');
  const entry=await r.json();
  if(entry.id!==id||entry.name!==name||!entry.folder||
     (parentId&&entry.parentReference?.id!==parentId))
    throw httpError(409,'GRAPH_FOLDER_MISMATCH');
  return id;
}
async function childFolder(token,parentId,name){
  const path=graphItem(parentId)+':/'+encodeURIComponent(name);
  let r=await graphCall(token,'GET',path);
  if(r.status===404){
    r=await graphCall(token,'POST',graphItem(parentId)+'/children',
      JSON.stringify({name,folder:{},'@microsoft.graph.conflictBehavior':'fail'}),'application/json');
    if(r.status===409)r=await graphCall(token,'GET',path);
  }
  if(!r.ok)throw httpError(502,'GRAPH_CHILD_FOLDER_FAILED');
  const entry=await r.json();
  if(entry.name!==name||!entry.folder||
     (entry.parentReference?.id&&entry.parentReference.id!==parentId))
    throw httpError(409,'GRAPH_CHILD_FOLDER_MISMATCH');
  return entry.id;
}
async function photoFolder(token,ref,capturedAt){
  await graphFolder(token,FOLDER_ID,FOLDER_NAME);
  await graphFolder(token,TYPE_IDS[ref.tipo],TYPES[ref.tipo],FOLDER_ID);
  const dt=localParts(capturedAt);
  const year=await childFolder(token,TYPE_IDS[ref.tipo],dt.year);
  const month=dt.month+' - '+MONTHS[Number(dt.month)-1];
  const id=await childFolder(token,year,month);
  return {id,path:'Recursos/10 - ViguerAPP/10 - Fotos QC/'+
    TYPES[ref.tipo]+'/'+dt.year+'/'+month,local:dt};
}
async function existingFile(token,folderId,name){
  const r=await graphCall(token,'GET',graphItem(folderId)+':/'+encodeURIComponent(name));
  if(r.status===404)return null;
  if(!r.ok)throw httpError(502,'GRAPH_FILE_LOOKUP_FAILED');
  const item=await r.json();
  if(item.name!==name||!item.file||item.parentReference?.id!==folderId)
    throw httpError(409,'GRAPH_FILE_MISMATCH');
  return item;
}
async function putImmutable(token,folderId,name,content,mime,verifyBytes){
  // Antes de subir, recuperar cualquier foto de un intento anterior.
  // Nunca sobrescribir el archivo de otra captura, aunque Graph no aplique
  // un encabezado condicional en una petición PUT de contenido.
  const prior=await existingFile(token,folderId,name);
  if(prior){
    if(prior.size!==content.length)throw httpError(409,'PHOTO_FILENAME_CONFLICT');
    const back=await graphCall(token,'GET',graphItem(prior.id)+'/content');
    if(!back.ok)throw httpError(502,'GRAPH_READBACK_FAILED');
    const actual=Buffer.from(await back.arrayBuffer());
    if(!actual.equals(content))throw httpError(409,'PHOTO_FILENAME_CONFLICT');
    return prior;
  }
  const path=graphItem(folderId)+':/'+encodeURIComponent(name)+':/content';
  const response=await fetch(GRAPH+path,{
    method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':mime,
      'If-None-Match':'*'},body:content,cache:'no-store',signal:AbortSignal.timeout(25000)
  });
  if(response.status===401||response.status===403)
    throw httpError(403,'GRAPH_SELECTED_PERMISSION_DENIED');
  if(response.ok){
    const item=await response.json();
    if(item.name!==name||!item.id||!item.file)throw httpError(502,'GRAPH_UPLOAD_UNCONFIRMED');
    return item;
  }
  // Reintentos: recuperar el archivo existente sin sobrescribirlo.
  if(response.status!==409&&response.status!==412)throw httpError(502,'GRAPH_UPLOAD_FAILED');
  const existing=await existingFile(token,folderId,name);
  if(!existing||existing.size!==content.length)throw httpError(409,'PHOTO_FILENAME_CONFLICT');
  const back=await graphCall(token,'GET',graphItem(existing.id)+'/content');
  if(!back.ok)throw httpError(502,'GRAPH_READBACK_FAILED');
  const actual=Buffer.from(await back.arrayBuffer());
  if(!actual.equals(content))throw httpError(409,'PHOTO_FILENAME_CONFLICT');
  return existing;
}
async function storePhoto(session,photo,source){
  const uri=photoUrl(photo.ref,photo.photoId);
  const found=await firebaseGet(uri,session.firebaseToken,true);
  const previous=verifyPrior(found.value,photo);
  if(previous)return {created:false,record:previous};
  if(!found.etag)throw httpError(503,'PHOTO_INDEX_ETAG_MISSING');
  const token=await graphToken();
  const folder=await photoFolder(token,photo.ref,photo.capturedAt);
  const attrs=metadata(photo.ref,source,session.actor);
  const stem=safePart(source.partida,'SINPARTIDA')+'_'+photo.ref.tipo.toUpperCase()+
    '_'+folder.local.label+'_INV'+safePart(attrs.invernadero,'NA')+
    '_'+photo.photoId+'_'+photo.sha256.slice(0,10);
  const filename=stem+'.'+photo.extension;
  const image=await putImmutable(token,folder.id,filename,photo.bytes,photo.mime);
  // Usar la fecha persistente de Graph: un reintento no cambia el sidecar.
  const uploadedAt=image.createdDateTime;
  if(typeof uploadedAt!=='string'||!Number.isFinite(Date.parse(uploadedAt)))
    throw httpError(502,'GRAPH_CREATED_AT_MISSING');
  const record={
    schemaVersion:1,photoId:photo.photoId,
    registroId:photo.ref.id,tipo:photo.ref.tipo,dia:photo.ref.dia,
    capturedAt:photo.capturedAt,uploadedAt,sha256:photo.sha256,
    metadata:attrs,
    sharepoint:{driveId:DRIVE_ID,itemId:image.id,
      webUrl:image.webUrl||null,name:filename,folder:folder.path}
  };
  const sidecar=Buffer.from(JSON.stringify(record,null,2)+'\n','utf8');
  await putImmutable(token,folder.id,filename+'.json',sidecar,'application/json');
  const update=await fetch(uri,{
    method:'PUT',headers:{Authorization:'Bearer '+session.firebaseToken,
      'Content-Type':'application/json','if-match':found.etag},
    body:JSON.stringify(record),signal:AbortSignal.timeout(12000)
  });
  if(update.status===412){
    const fresh=await firebaseGet(uri,session.firebaseToken,false);
    return {created:false,record:verifyPrior(fresh.value,photo)};
  }
  if(!update.ok)throw httpError(503,'PHOTO_INDEX_WRITE_FAILED');
  return {created:true,record};
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'&&req.method!=='POST'){
    res.setHeader('Allow','GET, POST');
    return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  }
  // Nunca escribir si la bandera explícita de TEST no está activada.
  if(req.method==='POST'&&!UPLOAD_ENABLED())
    return res.status(423).json({error:'SHAREPOINT_UPLOAD_NOT_ENABLED'});
  try{
    const body=req.method==='POST'?bodyOf(req):null;
    const diagnostic=req.method==='GET'&&req.query?.action==='check';
    const photo=req.method==='POST'?photoInput(body):null;
    const ref=diagnostic?null:(photo?.ref||reference(req.query));
    const session=await authorize(req,ref?.tipo||null);
    // Piloto: solo ADMIN puede subir fotos; técnicos siguen en flujo legado.
    if(photo&&session.role!=='ADMIN')throw httpError(403,'PILOT_ADMIN_ONLY');
    if(diagnostic&&session.role!=='ADMIN')throw httpError(403,'FORBIDDEN');
    const source=ref?await sourceFor(ref,session.firebaseToken):null;
    if(photo){
      const outcome=await storePhoto(session,photo,source);
      if(!outcome.record)throw httpError(409,'PHOTO_INDEX_CONFLICT');
      return res.status(outcome.created?201:200).json({
        ok:true,created:outcome.created,photoId:photo.photoId,
        record:outcome.record
      });
    }
    await verifyFolder();
    return res.status(200).json({
      ok:true,graphRead:'CONFIRMED',
      uploadEnabled:UPLOAD_ENABLED(),
      ...(ref?{metadata:metadata(ref,source,session.actor),
        carpetaTipo:TYPES[ref.tipo]}:{})
    });
  }catch(e){
    const status=e.httpStatus||503;
    if(status===503||status===502)console.error('QC_SP_READ_TEST',e.code||e.message);
    return res.status(status).json({error:e.code||'SERVICE_UNAVAILABLE'});
  }
};
