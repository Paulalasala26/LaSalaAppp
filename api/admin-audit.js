'use strict';
// TEST — lectura y registro de auditoría administrativa desde servidor.
// No expone credenciales, contraseñas, hashes ni tokens.
const {
  verifyFirebaseIdToken,serviceAccount,serviceAccessToken,readKey,validHash,httpError
}=require('./admin-users')._adminCatalogHelpers;
const DB='https://la-sala-app-dev-default-rtdb.europe-west1.firebasedatabase.app';
const KEY='lasala-admin-audit-v1';
const AREAS=new Set(['users','infrastructure','riego_options']);
const ACTIONS=new Set(['create','edit','changeRole','resetPassword','deactivate','activate']);
const MAX_EVENTS=300;
const clean=(s,max)=>typeof s==='string'?s.slice(0,max):'';

const LEGACY_HISTORY_KEY='lasala-historial-v1';
const MAX_LEGACY_EVENTS=1000;
function operationalDate(fecha,hora){
  const f=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(fecha||'');
  const h=/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(hora||'');
  if(!f||!h)return null;
  const [day,month,year]=[+f[1],+f[2],+f[3]];
  const [hour,minute,second]=[+h[1],+h[2],+(h[3]||0)];
  const d=new Date(Date.UTC(year,month-1,day,hour,minute,second));
  if(d.getUTCFullYear()!==year||d.getUTCMonth()+1!==month||
     d.getUTCDate()!==day||d.getUTCHours()!==hour||
     d.getUTCMinutes()!==minute||d.getUTCSeconds()!==second)return null;
  // El registro antiguo guarda hora local peninsular, no UTC.
  const zone=new Intl.DateTimeFormat('en-GB',{
    timeZone:'Europe/Madrid',timeZoneName:'shortOffset'
  }).formatToParts(d).find(x=>x.type==='timeZoneName')?.value||'';
  const offset=/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(zone);
  if(!offset)throw new Error('Zona horaria operativa no reconocida');
  const z=offset[1]+offset[2].padStart(2,'0')+':'+(offset[3]||'00');
  const pad=x=>String(x).padStart(2,'0');
  return year+'-'+pad(month)+'-'+pad(day)+'T'+pad(hour)+':'+pad(minute)+':'+pad(second)+z;
}
function operationalArea(action){
  if(/riego|hojas marcadas|hojas corregidas/i.test(action))return 'riego';
  if(/\bcheck\b|calidad|partida/i.test(action))return 'control';
  return 'operations';
}
function normalizeLegacyEvents(raw,cutoff){
  if(raw==null)return [];
  const parsed=typeof raw==='string'?JSON.parse(raw):raw;
  if(!Array.isArray(parsed))throw new Error('Formato histórico operativo inválido');
  return parsed.slice(-MAX_LEGACY_EVENTS).map((item,i)=>{
    if(!item||typeof item!=='object'||Array.isArray(item))return null;
    const at=operationalDate(item.fecha,item.hora);
    const detail=clean(item.accion,240);
    if(!at||!detail||Date.parse(at)<cutoff)return null;
    const inv=/\bINV\.?\s*([A-Z0-9-]+)/i.exec(detail);
    const part=/\bpartida\s+([A-Z0-9-]+)/i.exec(detail);
    return {
      id:'operational-'+i,at,actor:clean(item.usuario,80),role:clean(item.rol,60),
      area:operationalArea(detail),action:'operation',
      target:inv?'INV '+inv[1]:part?'Partida '+part[1]:'',
      detail
    };
  }).filter(Boolean);
}

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
    const [r,legacyResponse]=await Promise.all([
      fetch(DB+'/'+KEY+'.json?'+q,{
        headers:{Authorization:'Bearer '+token},
        signal:AbortSignal.timeout(10000),cache:'no-store'
      }),
      fetch(DB+'/'+LEGACY_HISTORY_KEY+'.json',{
        headers:{Authorization:'Bearer '+token},
        signal:AbortSignal.timeout(10000),cache:'no-store'
      })
    ]);
    if(!r.ok||!legacyResponse.ok)
      throw new Error('Lectura histórico fallida: '+r.status+'/'+legacyResponse.status);
    const [raw,legacyRaw]=await Promise.all([r.json(),legacyResponse.json()]);
    if(raw!=null&&(!raw||typeof raw!=='object'||Array.isArray(raw)))
      throw new Error('Formato de auditoría inválido');
    const administrativeEvents=Object.entries(raw||{}).filter(([id,x])=>
      id && x && typeof x==='object'&&!Array.isArray(x)&&
      typeof x.at==='string'&&AREAS.has(x.area)&&ACTIONS.has(x.action)
    ).map(([id,x])=>({
      id,at:clean(x.at,40),actor:clean(x.actor,80),area:x.area,
      action:x.action,target:clean(x.target,130),detail:clean(x.detail,160)
    }));
    const cutoff=cutoffOneYear();
    const events=[
      ...administrativeEvents.filter(e=>Date.parse(e.at)>=cutoff),
      ...normalizeLegacyEvents(legacyRaw,cutoff)
    ].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)||b.id.localeCompare(a.id));
    return res.status(200).json({events,currentUser:actor,limit:MAX_EVENTS+MAX_LEGACY_EVENTS});
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
