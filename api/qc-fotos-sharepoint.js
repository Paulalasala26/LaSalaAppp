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
const NEW_LIBRARY_ENABLED=()=>process.env.GRAPH_QC_NEW_LIBRARY_ENABLED==='true';
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
// Datos espaciales normalizados del registro. No inferir A/B, sala ni calle
// cuando la fuente solo indica un número de invernadero.
function nCalle(v){
  if(v===null||v===undefined||v==='')return null;
  const n=Number(v);
  return Number.isSafeInteger(n)&&n>=0&&n<=1000?n:null;
}
function nTramos(registro){
  const list=Array.isArray(registro.tramos)&&registro.tramos.length?
    registro.tramos:[{desde:registro.calleDesde,hasta:registro.calleHasta}];
  return list.map(t=>{
    const a=nCalle(t?.desde),b=nCalle(t?.hasta??t?.desde);
    return a!==null&&b!==null?{desde:Math.min(a,b),hasta:Math.max(a,b)}:null;
  }).filter(Boolean).slice(0,30).sort((a,b)=>a.desde-b.desde||a.hasta-b.hasta);
}
function ubicacionDirecta(registro){
  const invRaw=value(registro.invId,50)||value(registro.invernadero,50);
  const parsed=/^(\d{1,2})-(\d{1,3})-(\d{1,3})$/.exec(invRaw||'');
  if(parsed){
    const a=nCalle(parsed[2]),b=nCalle(parsed[3]);
    if(a!==null&&b!==null){
      const t={desde:Math.min(a,b),hasta:Math.max(a,b)};
      return {invernadero:String(Number(parsed[1])),tramos:[t],
        calleDesde:t.desde,calleHasta:t.hasta};
    }
  }
  const tramos=nTramos(registro);
  return {invernadero:invRaw,tramos,
    calleDesde:tramos.length?Math.min(...tramos.map(x=>x.desde)):null,
    calleHasta:tramos.length?Math.max(...tramos.map(x=>x.hasta)):null};
}
function compatInv(directo,tunel){
  if(!directo)return true;
  if(directo===tunel)return true;
  // Carga puede tener INV 11 sin especificar lado; 11A/11B no son
  // intercambiables entre sí.
  const short=/^\d+$/.test(directo),n=tunel?.match(/^(\d+)[A-Za-z]$/);
  return !!(short&&n&&Number(directo)===Number(n[1]));
}
async function leerTunelParaPartida(ref,record,token){
  // Solo buscar si la propia ficha de Carga no trae una ubicación completa.
  if(ref.tipo!=='carga')return [];
  const q=Math.floor((ref.dia-15)/14);
  const idx=await fetch(DB+'/lasala-control-items-v2-index.json',{
    headers:{Authorization:'Bearer '+token},cache:'no-store',
    signal:AbortSignal.timeout(12000)
  });
  if(!idx.ok)throw httpError(503,'TUNEL_INDEX_READ_FAILED');
  const catalog=await idx.json();
  if(!catalog||typeof catalog!=='object'||!catalog.shards)
    throw httpError(503,'TUNEL_INDEX_MISSING');
  // Ventana de seguridad de 16 quincenas anteriores (hasta 224 días).
  // El caso piloto de octubre de 2026 incluye toda la historia desde junio.
  // No se busca en registros posteriores a la ficha de Carga.
  const candidates=Object.values(catalog.shards).filter(x=>
    x&&x.tipo==='tunel'&&Number.isInteger(Number(x.q))&&
    Number(x.q)<=q&&Number(x.q)>=Math.max(0,q-15)&&
    x.key==='lasala-control-items-v2-tunel-q'+Number(x.q)
  ).sort((a,b)=>Number(b.q)-Number(a.q));
  const found=[];
  for(let i=0;i<candidates.length;i+=5){
    const batch=await Promise.all(candidates.slice(i,i+5).map(async meta=>{
      const response=await fetch(DB+'/'+encodeURIComponent(meta.key)+'.json',{
        headers:{Authorization:'Bearer '+token},cache:'no-store',
        signal:AbortSignal.timeout(12000)
      });
      if(!response.ok)throw httpError(503,'TUNEL_SHARD_READ_FAILED');
      const obj=await response.json();
      if(obj!==null&&(!obj||typeof obj!=='object'||Array.isArray(obj)))
        throw httpError(503,'TUNEL_SHARD_INVALID');
      return Object.values(obj||{}).filter(r=>
        r&&r.tipo==='tunel'&&r.partida===record.partida&&
        Number.isInteger(r.dia)&&r.dia<=ref.dia&&
        typeof r.id==='string'&&RE_ID.test(r.id)&&
        value(r.invId));
    }));
    found.push(...batch.flat());
  }
  return found;
}
function resolverUbicacion(ref,record,tuneles){
  const own=ubicacionDirecta(record);
  const base={...own,sala:value(record.sala),origen:'registro',
    registroTunelOrigen:null,estado:'directa'};
  if(ref.tipo!=='carga'||(own.invernadero&&own.tramos.length))
    return base;
  const pool=(tuneles||[]).map(r=>({record:r,loc:ubicacionDirecta(r)}))
    .filter(x=>x.loc.invernadero&&
      compatInv(own.invernadero,x.loc.invernadero));
  if(!pool.length)return {...base,estado:'sin_coincidencia_tunel'};
  const amount=String(record.numBandejas??'').trim();
  const byQty=amount?pool.filter(x=>String(x.record.numBandejas??'').trim()===amount):[];
  // Coincidencia de número de bandejas es más fuerte que solo partida.
  // Pero dos ubicaciones incompatibles con las mismas bandejas son ambiguas.
  const options=byQty.length?byQty:pool;
  const invs=new Set(options.map(x=>x.loc.invernadero));
  if(invs.size!==1){
    // No escoger arbitrariamente un invernadero si la partida está repartida.
    return {...base,estado:'tunel_ambiguo'};
  }
  const withStreet=options.filter(x=>x.loc.tramos.length);
  const streets=new Set(withStreet.map(x=>JSON.stringify(x.loc.tramos)));
  if(streets.size>1){
    // Invernadero inequívoco, calles distintas: conservar el primero
    // y dejar la calle en blanco hasta conocer a qué línea corresponde.
    return {...base,invernadero:own.invernadero||options[0].loc.invernadero,
      origen:'tunel',estado:'tunel_calle_ambigua'};
  }
  const winner=(withStreet.length?withStreet:options).slice()
    .sort((a,b)=>b.record.dia-a.record.dia||a.record.id.localeCompare(b.record.id))[0];
  return {invernadero:own.invernadero||winner.loc.invernadero,
    tramos:own.tramos.length?own.tramos:winner.loc.tramos,
    calleDesde:own.tramos.length?own.calleDesde:winner.loc.calleDesde,
    calleHasta:own.tramos.length?own.calleHasta:winner.loc.calleHasta,
    sala:value(record.sala)||value(winner.record.sala),
    origen:'tunel',registroTunelOrigen:winner.record.id,
    estado:!winner.loc.tramos.length?'tunel_sin_calle':
      (byQty.length?'partida_y_bandejas':'partida_ubicacion_unica')};
}
async function metadata(ref,record,actor,token,tunelesOverride){
  // Solo datos confirmados en Firebase; jamás confiar en la ubicación
  // recibida del dispositivo. Los registros guardados son instantáneas.
  const own=ubicacionDirecta(record);
  const needTunnel=ref.tipo==='carga'&&(!own.invernadero||!own.tramos.length);
  const matches=needTunnel?
    (tunelesOverride||await leerTunelParaPartida(ref,record,token)):[];
  const loc=resolverUbicacion(ref,record,matches);
  return {
    registroId:ref.id,partida:record.partida,tipo:ref.tipo,
    diaInterno:ref.dia,cliente:value(record.cliente),
    variedad:value(record.variedad),clienteVariedad:value(record.clienteVariedad),
    sala:loc.sala,invernadero:loc.invernadero,
    calleDesde:loc.calleDesde,calleHasta:loc.calleHasta,tramos:loc.tramos,
    numBandejas:record.numBandejas??null,usuario:actor,
    ubicacionOrigen:loc.origen,ubicacionEstado:loc.estado,
    registroTunelOrigen:loc.registroTunelOrigen
  };
}
// Diagnóstico explícito y solo lectura para ADMIN. No se adjunta a fotos ni
// se persiste: permite entender una coincidencia ambigua antes de decidir.
function diagnosticoCandidatosTunel(record,tuneles){
  const direct=ubicacionDirecta(record);
  const valid=(tuneles||[]).map(r=>({source:r,loc:ubicacionDirecta(r)}))
    .filter(x=>x.loc.invernadero&&compatInv(direct.invernadero,x.loc.invernadero));
  const qty=String(record.numBandejas??'').trim();
  const matched=qty?valid.filter(x=>String(x.source.numBandejas??'').trim()===qty):[];
  const used=matched.length?matched:valid;
  const considered=new Set(used.map(x=>x.source.id));
  const ordered=valid.slice().sort((a,b)=>
    Number(considered.has(b.source.id))-Number(considered.has(a.source.id))||
    b.source.dia-a.source.dia||a.source.id.localeCompare(b.source.id));
  return {
    totalCoincidencias:valid.length,
    coincidenciasMismasBandejas:matched.length,
    consideradas:used.length,
    criterio:matched.length?'partida_y_bandejas':'solo_partida',
    candidatos:ordered.slice(0,16).map(x=>({
      id:x.source.id,dia:x.source.dia,
      invernadero:x.loc.invernadero,tramos:x.loc.tramos,
      numBandejas:x.source.numBandejas??null,
      mismasBandejas:qty!==''&&String(x.source.numBandejas??'').trim()===qty,
      considerado:considered.has(x.source.id)
    }))
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

const QC_LIBRARY_ID='bac69068-31e2-4df6-8734-8c42049600d7';
const QC_LIBRARY_DRIVE='b!ltDlxMPStUSPKosa8hjEBT4XEdc922lLvESLlmS3tQxokMa64jH2TYc0jEIElgDX';
const QC_SITE='viveroslasala.sharepoint.com,c4e5d096-d2c3-44b5-8f2a-8b1af218c405,d711173e-db3d-4b69-bc44-8b9664b7b50c';
const QC_REQUIRED_COLUMNS=Object.freeze([
  'QCRegistroId','QCFotoId','QCPartida','QCTipo','QCFechaControl',
  'QCCliente','QCVariedad','QCClienteVariedad','QCSala','QCInvernadero',
  'QCCalleDesde','QCCalleHasta','QCTramos','QCBandejas','QCUsuario',
  'QCCapturadaUTC','QCSubidaUTC','QCUbicacionOrigen',
  'QCUbicacionEstado','QCRegistroTunelOrigen'
]);
// Diagnóstico sin escritura. No afecta a la carpeta antigua ni al circuito
// de captura; valida los permisos app-only sobre la biblioteca independiente.
async function verifyNewLibrary(){
  let token;
  try{token=await graphToken();}
  catch(e){return {estado:'ERROR_TOKEN',codigo:e.code||'GRAPH_TOKEN_FAILED'};}
  const check=async path=>{
    try{
      const r=await fetch(GRAPH+path,{
        headers:{Authorization:'Bearer '+token},cache:'no-store',
        signal:AbortSignal.timeout(15000)
      });
      if(!r.ok)return {ok:false,status:r.status};
      return {ok:true,status:r.status,json:await r.json()};
    }catch(e){return {ok:false,status:0};}
  };
  const [list,drive]=await Promise.all([
    check('/sites/'+encodeURIComponent(QC_SITE)+'/lists/'+encodeURIComponent(QC_LIBRARY_ID)+'/columns?$top=200'),
    check('/drives/'+encodeURIComponent(QC_LIBRARY_DRIVE)+'/root?$select=id,name,folder,webUrl')
  ]);
  const response={estado:'PENDIENTE',columnas:0,esperadas:QC_REQUIRED_COLUMNS.length,
    faltantes:[],tiposIncorrectos:[],lecturaColumnas:list.status,lecturaArchivos:drive.status,
    destinoActivo:NEW_LIBRARY_ENABLED()};
  if(list.ok&&Array.isArray(list.json?.value)){
    const entries=new Map(list.json.value.map(x=>[x?.name,x]).filter(x=>x[0]));
    response.columnas=QC_REQUIRED_COLUMNS.filter(x=>entries.has(x)).length;
    response.faltantes=QC_REQUIRED_COLUMNS.filter(x=>!entries.has(x));
    const numbers=new Set(['QCCalleDesde','QCCalleHasta','QCBandejas']);
    const dates=new Set(['QCFechaControl','QCCapturadaUTC','QCSubidaUTC']);
    const bad=QC_REQUIRED_COLUMNS.filter(name=>{
      const col=entries.get(name);if(!col)return false;
      if(numbers.has(name))return !col.number;
      if(dates.has(name)){
        if(!col.dateTime)return true;
        if(name==='QCFechaControl')return col.dateTime.format!=='dateOnly';
        return col.dateTime.format!=='dateTime';
      }
      if(!col.text)return true;
      if(name==='QCTramos')return col.text.allowMultipleLines!==true;
      return col.text.allowMultipleLines===true;
    });
    response.tiposIncorrectos=bad;
  }
  if(!list.ok)response.estado=list.status===403?'SIN_PERMISO_COLUMNAS':'ERROR_COLUMNAS';
  else if(!drive.ok)response.estado=drive.status===403?'SIN_PERMISO_ARCHIVOS':'ERROR_ARCHIVOS';
  else if(drive.json?.id==='01WYFOB256Y2GOVW7725BZO354PWSELRRZ'&&drive.json?.folder&&
       response.columnas===QC_REQUIRED_COLUMNS.length&&
       response.tiposIncorrectos.length===0)
    response.estado='LECTURA_CONFIRMADA';
  else response.estado='REVISAR_COLUMNAS_O_BIBLIOTECA';
  return response;
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

// NUEVO ALMACENAMIENTO V2: biblioteca independiente con columnas en SharePoint.
// Aislado del circuito histórico, desactivado si falta flag o una columna.
// Se almacenan imagen + referencia Firebase; JAMÁS un JSON sidecar.
const qcGraphItem=id=>'/drives/'+encodeURIComponent(QC_LIBRARY_DRIVE)+'/items/'+encodeURIComponent(id);
async function qcNewFolder(token,parentId,name){
  const endpoint=qcGraphItem(parentId)+':/'+encodeURIComponent(name);
  let r=await graphCall(token,'GET',endpoint);
  if(r.status===404){
    r=await graphCall(token,'POST',qcGraphItem(parentId)+'/children',
      JSON.stringify({name,folder:{},'@microsoft.graph.conflictBehavior':'fail'}));
    if(r.status===409)r=await graphCall(token,'GET',endpoint);
  }
  if(!r.ok)throw httpError(502,'QC_NEW_FOLDER_ERROR');
  const folder=await r.json();
  if(folder.name!==name||!folder.folder||
    (folder.parentReference?.id&&folder.parentReference.id!==parentId))
    throw httpError(409,'QC_NEW_FOLDER_MISMATCH');
  return folder.id;
}
async function qcNewPhotoFolder(token,ref,capturedAt){
  const root=await graphCall(token,'GET','/drives/'+encodeURIComponent(QC_LIBRARY_DRIVE)+
    '/root?$select=id,name,folder');
  if(!root.ok)throw httpError(502,'QC_NEW_ROOT_UNAVAILABLE');
  const base=await root.json();
  if(base.id!=='01WYFOB256Y2GOVW7725BZO354PWSELRRZ'||!base.folder)
    throw httpError(409,'QC_NEW_ROOT_MISMATCH');
  const typ=await qcNewFolder(token,base.id,TYPES[ref.tipo]);
  const date=localParts(capturedAt);
  const year=await qcNewFolder(token,typ,date.year);
  const month=date.month+' - '+MONTHS[Number(date.month)-1];
  return {id:await qcNewFolder(token,year,month),
    path:TYPES[ref.tipo]+'/'+date.year+'/'+month,local:date};
}
async function qcExistingFile(token,folderId,name){
  const r=await graphCall(token,'GET',qcGraphItem(folderId)+':/'+encodeURIComponent(name));
  if(r.status===404)return null;
  if(!r.ok)throw httpError(502,'QC_NEW_PHOTO_LOOKUP_FAILED');
  const file=await r.json();
  if(file.name!==name||!file.file||file.parentReference?.id!==folderId)
    throw httpError(409,'QC_NEW_PHOTO_FILE_MISMATCH');
  return file;
}
async function qcPutPhotoImmutable(token,folderId,name,bytes,mime){
  const prior=await qcExistingFile(token,folderId,name);
  if(prior){
    if(prior.size!==bytes.length)throw httpError(409,'QC_NEW_FILENAME_CONFLICT');
    const read=await graphCall(token,'GET',qcGraphItem(prior.id)+'/content');
    if(!read.ok)throw httpError(502,'QC_NEW_PHOTO_READBACK_FAILED');
    const actual=Buffer.from(await read.arrayBuffer());
    if(!actual.equals(bytes))throw httpError(409,'QC_NEW_FILENAME_CONFLICT');
    return prior;
  }
  const r=await fetch(GRAPH+qcGraphItem(folderId)+':/'+encodeURIComponent(name)+':/content',{
    method:'PUT',
    headers:{Authorization:'Bearer '+token,'Content-Type':mime,'If-None-Match':'*'},
    body:bytes,cache:'no-store',signal:AbortSignal.timeout(25000)
  });
  if(r.status===401||r.status===403)throw httpError(403,'QC_NEW_PERMISSION_DENIED');
  if(r.ok){
    const uploaded=await r.json();
    if(!uploaded.id||uploaded.name!==name||!uploaded.file)
      throw httpError(502,'QC_NEW_UPLOAD_NOT_CONFIRMED');
    return uploaded;
  }
  if(r.status!==409&&r.status!==412)throw httpError(502,'QC_NEW_UPLOAD_FAILED');
  const existing=await qcExistingFile(token,folderId,name);
  if(!existing||existing.size!==bytes.length)
    throw httpError(409,'QC_NEW_FILENAME_CONFLICT');
  const read=await graphCall(token,'GET',qcGraphItem(existing.id)+'/content');
  if(!read.ok)throw httpError(502,'QC_NEW_PHOTO_READBACK_FAILED');
  if(!Buffer.from(await read.arrayBuffer()).equals(bytes))
    throw httpError(409,'QC_NEW_FILENAME_CONFLICT');
  return existing;
}
function qcDateOfDia(dia){
  // La numeración QC parte del 15/06/2026, con diaInterno=15.
  return new Date(Date.UTC(2026,5,15)+(dia-15)*86400000).toISOString().slice(0,10);
}
function qcNumber(v){
  if(v===undefined||v===null||v==='')return null;
  const n=Number(v);
  return Number.isSafeInteger(n)&&n>=0?n:null;
}
function qcPhotoFields(photo,source,attrs,uploadedAt){
  const fields={
    QCRegistroId:photo.ref.id,
    QCFotoId:photo.photoId,
    QCPartida:source.partida,
    QCTipo:photo.ref.tipo,
    QCFechaControl:qcDateOfDia(photo.ref.dia)+'T00:00:00Z',
    QCCapturadaUTC:photo.capturedAt,
    QCSubidaUTC:uploadedAt
  };
  const simple={
    QCCliente:attrs.cliente,QCVariedad:attrs.variedad,
    QCClienteVariedad:attrs.clienteVariedad,QCSala:attrs.sala,
    QCInvernadero:attrs.invernadero,QCUsuario:attrs.usuario,
    QCUbicacionOrigen:attrs.ubicacionOrigen,
    QCUbicacionEstado:attrs.ubicacionEstado,
    QCRegistroTunelOrigen:attrs.registroTunelOrigen
  };
  for(const [key,val] of Object.entries(simple)){
    if(typeof val==='string'&&val.trim())fields[key]=val.slice(0,255);
  }
  for(const [key,val] of Object.entries({
    QCCalleDesde:attrs.calleDesde,QCCalleHasta:attrs.calleHasta,
    QCBandejas:attrs.numBandejas
  })){
    const num=qcNumber(val);
    if(num!==null)fields[key]=num;
  }
  if(Array.isArray(attrs.tramos)&&attrs.tramos.length)
    fields.QCTramos=JSON.stringify(attrs.tramos);
  return fields;
}
async function qcAssignFields(token,image,fields){
  let listItemId=image.sharepointIds?.listItemId;
  if(!/^[1-9]\d{0,19}$/.test(String(listItemId||''))){
    const lookup=await graphCall(token,'GET',qcGraphItem(image.id)+
      '?$select=id,sharepointIds,parentReference');
    if(!lookup.ok)throw httpError(502,'QC_NEW_ITEM_IDENTIFIERS_FAILED');
    const fresh=await lookup.json();
    if(fresh.id!==image.id||fresh.parentReference?.driveId!==QC_LIBRARY_DRIVE)
      throw httpError(409,'QC_NEW_ITEM_DRIVE_MISMATCH');
    listItemId=fresh.sharepointIds?.listItemId;
  }
  if(!/^[1-9]\d{0,19}$/.test(String(listItemId||'')))
    throw httpError(502,'QC_NEW_LIST_ITEM_ID_MISSING');
  const url='/sites/'+encodeURIComponent(QC_SITE)+'/lists/'+
    encodeURIComponent(QC_LIBRARY_ID)+'/items/'+encodeURIComponent(String(listItemId))+'/fields';
  const update=await graphCall(token,'PATCH',url,JSON.stringify(fields));
  if(!update.ok){
    // La foto puede existir en SP tras este fallo. Un reintento recupera
    // exactamente sus mismos bytes antes de volver a escribir metadatos.
    throw httpError(update.status===403?403:502,'QC_NEW_METADATA_WRITE_FAILED');
  }
  const check=await graphCall(token,'GET',url);
  if(!check.ok)throw httpError(502,'QC_NEW_METADATA_VERIFY_FAILED');
  const current=await check.json();
  for(const key of ['QCRegistroId','QCFotoId','QCPartida','QCTipo']){
    if(current[key]!==fields[key])throw httpError(502,'QC_NEW_METADATA_INCOMPLETE');
  }
  return {listItemId:String(listItemId)};
}
async function qcStoreNewPhoto(session,photo,source,attrs,found,token,uri){
  const check=await verifyNewLibrary();
  if(check.estado!=='LECTURA_CONFIRMADA'||check.columnas!==QC_REQUIRED_COLUMNS.length)
    throw httpError(423,'QC_NEW_LIBRARY_NOT_READY');
  const folder=await qcNewPhotoFolder(token,photo.ref,photo.capturedAt);
  // Filename independiente de la ubicación y la partida, que pueden cambiar
  // entre una captura y su reintento. La partida es columna de SharePoint.
  const filename='QC_'+photo.ref.tipo.toUpperCase()+'_'+folder.local.label+
    '_'+photo.photoId+'_'+photo.sha256.slice(0,10)+'.'+photo.extension;
  const image=await qcPutPhotoImmutable(token,folder.id,filename,photo.bytes,photo.mime);
  const uploadedAt=image.createdDateTime;
  if(typeof uploadedAt!=='string'||!Number.isFinite(Date.parse(uploadedAt)))
    throw httpError(502,'QC_NEW_CREATED_AT_MISSING');
  const fields=qcPhotoFields(photo,source,attrs,uploadedAt);
  const {listItemId}=await qcAssignFields(token,image,fields);
  if(typeof image.webUrl!=='string'||
     !image.webUrl.startsWith('https://viveroslasala.sharepoint.com/sites/Tecnologia/ViguerAPP%20Fotos%20QC/'))
    throw httpError(502,'QC_NEW_FILE_URL_UNAVAILABLE');
  const record={
    schemaVersion:1,photoId:photo.photoId,
    registroId:photo.ref.id,tipo:photo.ref.tipo,dia:photo.ref.dia,
    capturedAt:photo.capturedAt,uploadedAt,sha256:photo.sha256,
    metadata:attrs,
    sharepoint:{driveId:QC_LIBRARY_DRIVE,itemId:image.id,
      listId:QC_LIBRARY_ID,listItemId,
      webUrl:image.webUrl,name:filename,folder:folder.path}
  };
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

async function storePhoto(session,photo,source){
  const uri=photoUrl(photo.ref,photo.photoId);
  const found=await firebaseGet(uri,session.firebaseToken,true);
  const previous=verifyPrior(found.value,photo);
  if(previous)return {created:false,record:previous};
  if(!found.etag)throw httpError(503,'PHOTO_INDEX_ETAG_MISSING');
  const token=await graphToken();
  const attrs=await metadata(photo.ref,source,session.actor,session.firebaseToken);
  if(NEW_LIBRARY_ENABLED())
    return qcStoreNewPhoto(session,photo,source,attrs,found,token,uri);
  const folder=await photoFolder(token,photo.ref,photo.capturedAt);
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
    const candidatesRequested=req.method==='GET'&&req.query?.details==='1';
    const photo=req.method==='POST'?photoInput(body):null;
    const ref=diagnostic?null:(photo?.ref||reference(req.query));
    const session=await authorize(req,ref?.tipo||null);
    // Túnel: ADMIN/TÉCNICO. Carga: ADMIN/TÉCNICO/CARGADOR.\n    // authorize() valida rol ACTIVO contra Firebase, además de ID token.\n    // Los diagnósticos de biblioteca y candidatos siguen solo ADMIN.
    if(diagnostic&&session.role!=='ADMIN')throw httpError(403,'FORBIDDEN');
    if(candidatesRequested&&session.role!=='ADMIN')throw httpError(403,'FORBIDDEN');
    const source=ref?await sourceFor(ref,session.firebaseToken):null;
    // Consulta puntual por foto: sirve para resolver cortes/red sin reenviar
    // bytes o duplicar escrituras en SharePoint. No devuelve datos sensibles.
    if(req.method==='GET'&&req.query?.action==='photo-status'){
      const photoId=req.query?.photoId;
      if(typeof photoId!=='string'||!PHOTO_RE.test(photoId))
        throw httpError(400,'INVALID_PHOTO_ID');
      const read=await firebaseGet(photoUrl(ref,photoId),session.firebaseToken,false);
      if(read.value===null)return res.status(200).json({ok:true,exists:false});
      const record=read.value;
      if(record.schemaVersion!==1||record.photoId!==photoId||
         record.registroId!==ref.id||record.tipo!==ref.tipo||
         record.dia!==ref.dia||typeof record.sha256!=='string'||
         !/^[0-9a-f]{64}$/.test(record.sha256)||
         typeof record.capturedAt!=='string'||
         !record.sharepoint?.itemId||!record.sharepoint?.driveId)
        throw httpError(409,'PHOTO_INDEX_CONFLICT');
      return res.status(200).json({ok:true,exists:true,
        photoId:record.photoId,sha256:record.sha256,capturedAt:record.capturedAt,
        sharepointConfirmed:true});
    }
    if(photo){
      const outcome=await storePhoto(session,photo,source);
      if(!outcome.record)throw httpError(409,'PHOTO_INDEX_CONFLICT');
      return res.status(outcome.created?201:200).json({
        ok:true,created:outcome.created,photoId:photo.photoId,
        record:outcome.record
      });
    }
    // Solo cargar Túnel una vez y exclusivamente cuando falten datos en Carga.
    const own=source?ubicacionDirecta(source):null;
    const needTunnel=ref?.tipo==='carga'&&(!own.invernadero||!own.tramos.length);
    const matches=(needTunnel&&candidatesRequested)?
      await leerTunelParaPartida(ref,source,session.firebaseToken):null;
    const attrs=ref?await metadata(ref,source,session.actor,session.firebaseToken,matches):null;
    await verifyFolder();
    const bibliotecaNueva=diagnostic?await verifyNewLibrary():undefined;
    return res.status(200).json({
      ok:true,graphRead:'CONFIRMED',
      ...(diagnostic?{bibliotecaNueva}:{}),
      uploadEnabled:UPLOAD_ENABLED(),
      nuevoDestinoHabilitado:NEW_LIBRARY_ENABLED(),
      ...(ref?{metadata:attrs,carpetaTipo:TYPES[ref.tipo]}:{}),
      ...(candidatesRequested&&ref?.tipo==='carga'?
        {diagnosticoTunel:needTunnel?diagnosticoCandidatosTunel(source,matches):
          {totalCoincidencias:0,coincidenciasMismasBandejas:0,consideradas:0,
            criterio:'ubicacion_carga_directa',candidatos:[]}}:{})
    });
  }catch(e){
    const status=e.httpStatus||503;
    if(status===503||status===502)console.error('QC_SP_READ_TEST',e.code||e.message);
    return res.status(status).json({error:e.code||'SERVICE_UNAVAILABLE'});
  }
};
