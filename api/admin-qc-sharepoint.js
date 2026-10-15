'use strict';
// ViguerAPP QC TEST — diagnóstico Microsoft Graph para carpeta aislada.
// NO cambia el almacenamiento operativo de fotos, NO migra y NO borra fotos.
// Escritura de prueba expresamente deshabilitada hasta configurar y autorizar Graph.
const crypto=require('node:crypto');
const {
  verifyFirebaseIdToken,serviceAccount,serviceAccessToken,readKey,validHash,httpError
}=require('./admin-users')._adminCatalogHelpers;

// Destino TEST inmutable; nunca aceptar rutas, IDs ni URLs suministrados por el cliente.
// SharePoint: Tecnologia / Proyectos / 10 - Vigentes / 70 - APP riego / 50 - QC / Fotos QC - TEST
const DRIVE_ID='b!ltDlxMPStUSPKosa8hjEBT4XEdc922lLvESLlmS3tQy9OIm9vYUbQaLFfZMlWFvb';
const FOLDER_ID='01WYFOB24KFIXYAHKXVVDIPH6H3KGLVMMN';
const FOLDER_NAME='Fotos QC - TEST';
const GRAPH='https://graph.microsoft.com/v1.0';
const ENV=['GRAPH_QC_TENANT_ID','GRAPH_QC_CLIENT_ID','GRAPH_QC_CLIENT_SECRET'];
const active=()=>ENV.every(key=>typeof process.env[key]==='string'&&process.env[key].trim());
const writeEnabled=()=>process.env.GRAPH_QC_PROBE_ENABLED==='true';

async function authorize(req){
  const raw=req.headers.authorization||'';
  if(!raw.startsWith('Bearer '))throw httpError(401,'UNAUTHORIZED');
  const actor=await verifyFirebaseIdToken(raw.slice(7).trim());
  const firebaseToken=await serviceAccessToken(serviceAccount());
  const [roles,accounts]=await Promise.all([
    readKey('lasala-roles-v1',firebaseToken),
    readKey('lasala-users-v1',firebaseToken)
  ]);
  if(roles[actor]!=='ADMIN'||!validHash(accounts[actor]))
    throw httpError(403,'FORBIDDEN');
  return actor;
}
async function graphToken(){
  const tenant=process.env.GRAPH_QC_TENANT_ID;
  const client=process.env.GRAPH_QC_CLIENT_ID;
  const secret=process.env.GRAPH_QC_CLIENT_SECRET;
  if(!active())throw httpError(503,'GRAPH_NOT_CONFIGURED');
  if(!/^[0-9a-f-]{36}$/i.test(tenant)||!/^[0-9a-f-]{36}$/i.test(client))
    throw httpError(503,'GRAPH_IDS_INVALID');
  const response=await fetch('https://login.microsoftonline.com/'+tenant+'/oauth2/v2.0/token',{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({
      client_id:client,
      client_secret:secret,
      grant_type:'client_credentials',
      scope:'https://graph.microsoft.com/.default'
    }).toString(),
    signal:AbortSignal.timeout(12000),
    cache:'no-store'
  });
  if(!response.ok)throw httpError(502,'GRAPH_TOKEN_FAILED');
  const data=await response.json();
  if(typeof data.access_token!=='string')throw httpError(502,'GRAPH_TOKEN_FAILED');
  return data.access_token;
}
async function graphRequest(accessToken,verb,path,body){
  const response=await fetch(GRAPH+path,{
    method:verb,
    headers:{
      Authorization:'Bearer '+accessToken,
      ...(body?{'Content-Type':'application/octet-stream'}:{})
    },
    ...(body?{body}:{}),
    signal:AbortSignal.timeout(15000),
    cache:'no-store',
    redirect:'follow'
  });
  if(response.status===401||response.status===403)
    throw httpError(403,'GRAPH_SELECTED_PERMISSION_DENIED');
  if(!response.ok)throw httpError(502,'GRAPH_HTTP_'+response.status);
  return response;
}
async function checkFolder(token){
  const path='/drives/'+encodeURIComponent(DRIVE_ID)+'/items/'+encodeURIComponent(FOLDER_ID);
  const response=await graphRequest(token,'GET',path+'?$select=id,name,folder,parentReference');
  const item=await response.json();
  // Evitar dar por válidos otros destinos: leer metadatos no prueba escritura.
  if(item.id!==FOLDER_ID||item.name!==FOLDER_NAME||!item.folder)
    throw httpError(409,'GRAPH_TARGET_MISMATCH');
  return path;
}
async function probe(token){
  const folderPath=await checkFolder(token);
  const name='viguerapp-qc-probe-'+crypto.randomUUID()+'.txt';
  const content=Buffer.from('ViguerAPP QC TEST - Graph permissions smoke test\n','utf8');
  let id=null,error=null,matched=false,removed=false;
  try{
    const saved=await graphRequest(token,'PUT',folderPath+':/'+encodeURIComponent(name)+':/content',content);
    const created=await saved.json();
    if(typeof created.id!=='string'||created.name!==name)
      throw httpError(502,'GRAPH_UPLOAD_UNCONFIRMED');
    id=created.id;
    const downloaded=await graphRequest(token,'GET',
      '/drives/'+encodeURIComponent(DRIVE_ID)+'/items/'+encodeURIComponent(id)+'/content');
    const actual=Buffer.from(await downloaded.arrayBuffer());
    matched=actual.length===content.length&&crypto.timingSafeEqual(actual,content);
    if(!matched)throw httpError(502,'GRAPH_READBACK_MISMATCH');
  }catch(e){error=e;}
  finally{
    if(id){
      try{
        await graphRequest(token,'DELETE',
          '/drives/'+encodeURIComponent(DRIVE_ID)+'/items/'+encodeURIComponent(id));
        removed=true;
      }catch(cleanupError){
        console.error('QC_SP_TEST_CLEANUP_FAILED',cleanupError.code||cleanupError.message);
        if(!error)error=httpError(502,'GRAPH_TEST_CLEANUP_FAILED');
      }
    }
  }
  if(error)throw error;
  if(!matched||!removed)throw httpError(502,'GRAPH_PROBE_INCOMPLETE');
  return {read:true,write:true,cleanup:true};
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'&&req.method!=='POST'){
    res.setHeader('Allow','GET, POST');
    return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  }
  try{
    const actor=await authorize(req);
    if(req.method==='GET')return res.status(200).json({
      ok:true,
      target:FOLDER_NAME,
      configured:!!active(),
      probeEnabled:writeEnabled(),
      missing:ENV.filter(k=>!process.env[k]),
      note:'Esto no demuestra todavía que Graph tenga acceso a la carpeta.'
    });
    if(!writeEnabled())throw httpError(423,'GRAPH_PROBE_DISABLED');
    if(!active())throw httpError(503,'GRAPH_NOT_CONFIGURED');
    const input=req.body&&typeof req.body==='object'?req.body:{};
    if(input.action!=='probe'||Object.keys(input).length!==1)
      throw httpError(400,'INVALID_ACTION');
    const result=await probe(await graphToken());
    console.info('QC_SP_TEST_PROBE_OK',actor);
    return res.status(200).json({ok:true,target:FOLDER_NAME,...result});
  }catch(error){
    const status=error.httpStatus||503;
    if(status===503)console.error('QC_SP_TEST_ERROR',error.code||error.message);
    return res.status(status).json({
      error:error.code||'SERVICE_UNAVAILABLE'
    });
  }
};
