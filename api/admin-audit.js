'use strict';
// TEST — lectura y registro de auditoría administrativa desde servidor.
// No expone credenciales, contraseñas, hashes ni tokens.
const {
  verifyFirebaseIdToken,serviceAccount,serviceAccessToken,readKey,validHash,httpError
}=require('./admin-users')._adminCatalogHelpers;
const DB='https://la-sala-app-test-default-rtdb.europe-west1.firebasedatabase.app';
const KEY='lasala-admin-audit-v1';
const AREAS=new Set(['users','infrastructure','riego_options']);
const ACTIONS=new Set(['create','edit','changeRole','resetPassword','deactivate','activate']);
const MAX_EVENTS=300;
const clean=(s,max)=>typeof s==='string'?s.slice(0,max):'';
async function writeAudit(token,{actor,area,action,target,detail}){
  if(!AREAS.has(area)||!ACTIONS.has(action)||!actor||!target)
    throw new Error('Auditoría: evento inválido');
  const event={
    at:new Date().toISOString(),
    actor:clean(actor,80),
    area,action,
    target:clean(target,130),
    detail:clean(detail,160)
  };
  const r=await fetch(DB+'/'+KEY+'.json',{
    method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify(event),
    signal:AbortSignal.timeout(10000)
  });
  if(!r.ok)throw new Error('Auditoría Firebase: '+r.status);
  const result=await r.json();
  if(!result||typeof result.name!=='string')throw new Error('Auditoría sin confirmación');
  return true;
}
async function safeRecordAdminAudit(token,entry){
  try{return await writeAudit(token,entry);}
  catch(err){console.error('ADMIN_AUDIT_TEST_FAILED',entry.area,entry.action,entry.target,err.message);return false;}
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  }
  const authorization=req.headers.authorization||'';
  if(!authorization.startsWith('Bearer '))return res.status(401).json({error:'UNAUTHORIZED'});
  try{
    const actor=await verifyFirebaseIdToken(authorization.slice(7).trim());
    const token=await serviceAccessToken(serviceAccount());
    const [roles,accounts]=await Promise.all([
      readKey('lasala-roles-v1',token),readKey('lasala-users-v1',token)
    ]);
    if(roles[actor]!=='ADMIN'||!validHash(accounts[actor]))
      throw httpError(403,'FORBIDDEN');
    const q=new URLSearchParams({orderBy:'"$key"',limitToLast:String(MAX_EVENTS)});
    const r=await fetch(DB+'/'+KEY+'.json?'+q,{
      headers:{Authorization:'Bearer '+token},
      signal:AbortSignal.timeout(10000),cache:'no-store'
    });
    if(!r.ok)throw new Error('Lectura de auditoría fallida: '+r.status);
    const raw=await r.json();
    if(raw!=null&&(!raw||typeof raw!=='object'||Array.isArray(raw)))
      throw new Error('Formato de auditoría inválido');
    const events=Object.entries(raw||{}).filter(([id,x])=>
      id && x && typeof x==='object'&&!Array.isArray(x)&&
      typeof x.at==='string'&&AREAS.has(x.area)&&ACTIONS.has(x.action)
    ).map(([id,x])=>({
      id,at:clean(x.at,40),actor:clean(x.actor,80),area:x.area,
      action:x.action,target:clean(x.target,130),detail:clean(x.detail,160)
    })).sort((a,b)=>b.at.localeCompare(a.at)||b.id.localeCompare(a.id));
    return res.status(200).json({events,currentUser:actor,limit:MAX_EVENTS});
  }catch(err){
    const status=err.httpStatus||503;
    if(status===503)console.error('ADMIN_AUDIT_TEST_READ_FAILED',err.message);
    return res.status(status).json({error:status===503?'SERVICE_UNAVAILABLE':err.code});
  }
};
module.exports.safeRecordAdminAudit=safeRecordAdminAudit;
module.exports.pruneExpiredAudit=pruneExpiredAudit;

// Retención de un año natural (UTC). Sólo opera sobre las entradas de este nodo.
// Se ejecuta mediante Cron TEST diariamente; en caso de error no toca otros datos.
function cutoffOneYear(now=new Date()){
  const cutoff=new Date(now.getTime());
  cutoff.setUTCFullYear(cutoff.getUTCFullYear()-1);
  return cutoff.getTime();
}
async function pruneExpiredAudit(accessToken,now=new Date()){
  const rootUrl=DB+'/'+KEY+'.json';
  const result=await fetch(rootUrl,{
    headers:{Authorization:'Bearer '+accessToken},
    cache:'no-store',signal:AbortSignal.timeout(12000)
  });
  if(!result.ok)throw new Error('No se pudo leer el histórico: HTTP '+result.status);
  const raw=await result.json();
  if(raw==null)return {deleted:0,candidates:0,remaining:0};
  if(typeof raw!=='object'||Array.isArray(raw))
    throw new Error('Estructura de auditoría inválida; no se elimina nada');
  const cutoff=cutoffOneYear(now);
  const validTime=at=>typeof at==='string'&&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(at)&&
    Number.isFinite(Date.parse(at));
  const old=Object.entries(raw).filter(([id,item])=>
    /^[-A-Za-z0-9_]{5,120}$/.test(id)&&item&&typeof item==='object'&&
    !Array.isArray(item)&&validTime(item.at)&&Date.parse(item.at)<cutoff
  );
  // Trabajo acotado: cualquier acumulación se drena gradualmente, sin
  // saturar RTDB ni agotar la duración máxima de la función.
  const batch=old.slice(0,100);
  let deleted=0;
  for(let i=0;i<batch.length;i+=4){
    const results=await Promise.all(batch.slice(i,i+4).map(async ([id])=>{
      const url=DB+'/'+KEY+'/'+encodeURIComponent(id)+'.json';
      // ETag protege frente a escrituras concurrentes o cambios entre lecturas.
      const r=await fetch(url,{
        headers:{Authorization:'Bearer '+accessToken,'X-Firebase-ETag':'true'},
        cache:'no-store',signal:AbortSignal.timeout(10000)
      });
      if(!r.ok)throw new Error('Lectura ETag fallida: HTTP '+r.status);
      const etag=r.headers.get('etag');
      if(!etag)throw new Error('Firebase no devolvió ETag');
      const entry=await r.json();
      if(!entry||!validTime(entry.at)||Date.parse(entry.at)>=cutoff)return false;
      const del=await fetch(url,{
        method:'DELETE',headers:{Authorization:'Bearer '+accessToken,'if-match':etag},
        signal:AbortSignal.timeout(10000)
      });
      if(del.status===412)return false; // otro proceso modificó el registro
      if(!del.ok)throw new Error('Borrado fallido: HTTP '+del.status);
      return true;
    }));
    deleted+=results.filter(Boolean).length;
  }
  return {deleted,candidates:old.length,remaining:Math.max(0,old.length-deleted)};
}
