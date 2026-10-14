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
