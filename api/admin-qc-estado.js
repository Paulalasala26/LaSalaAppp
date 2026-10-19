'use strict';
// Lectura por lote y solo del estado cuantitativo QC; no modifica Firebase.
const {verifyFirebaseIdToken,serviceAccount,serviceAccessToken,readKey,validHash,httpError}
  =require('./admin-users')._adminCatalogHelpers;
const DB='https://la-sala-app-test-default-rtdb.europe-west1.firebasedatabase.app';
const BASE=DB+'/lasala-qc-mediciones-v1/';
const TYPES=new Set(['carga','tunel']);
const ID=/^[A-Za-z0-9_-]{1,180}$/,PART=/^[A-Za-z0-9._-]{1,100}$/;
const CATS=['color','tamano','sanidad','flores','raices'];
function payload(req){
  const b=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(!b||typeof b!=='object'||Array.isArray(b)||!TYPES.has(b.tipo)||
      !Number.isInteger(b.dia)||b.dia<15||b.dia>4000||
      !Array.isArray(b.registros)||b.registros.length<1||b.registros.length>60)
    throw httpError(400,'INVALID_REQUEST');
  const seen=new Set();
  for(const x of b.registros){
    if(!x||typeof x!=='object'||!ID.test(x.id)||!PART.test(x.partida)||seen.has(x.id))
      throw httpError(400,'INVALID_REFERENCE');
    seen.add(x.id);
  }
  return b;
}
function validSaved(raw,ref,tipo,dia){
  if(typeof raw==='string'){try{raw=JSON.parse(raw)}catch(_){return false}}
  if(!raw||typeof raw!=='object'||raw.schemaVersion!==1||
     !Number.isInteger(raw.version)||raw.version<1||
     raw.legacy?.id!==ref.id||raw.legacy?.tipo!==tipo||
     raw.legacy?.dia!==dia||raw.legacy?.partida!==ref.partida||
     !Number.isSafeInteger(raw.bandejasInspeccionadas)||raw.bandejasInspeccionadas<1)
    return false;
  return CATS.every(k=>raw.mediciones?.[k] &&
    typeof raw.mediciones[k]==='object' && Object.keys(raw.mediciones[k]).length>0 &&
    Object.values(raw.mediciones[k]).every(v=>Number.isSafeInteger(v)&&v>0&&v<=raw.bandejasInspeccionadas));
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  }
  try{
    const b=payload(req);
    const auth=req.headers.authorization||'';
    if(!auth.startsWith('Bearer '))throw httpError(401,'UNAUTHORIZED');
    const actor=await verifyFirebaseIdToken(auth.slice(7).trim());
    const token=await serviceAccessToken(serviceAccount());
    const [roles,users]=await Promise.all([
      readKey('lasala-roles-v1',token),readKey('lasala-users-v1',token)
    ]);
    const role=roles[actor];
    if(!(role==='ADMIN'||role==='TECNICO'||(role==='CARGADOR'&&b.tipo==='carga'))||
       !validHash(users[actor]))throw httpError(403,'FORBIDDEN');
    const estados=Object.create(null);
    for(let i=0;i<b.registros.length;i+=8){
      const batch=b.registros.slice(i,i+8);
      const values=await Promise.all(batch.map(async ref=>{
        const response=await fetch(BASE+encodeURIComponent(ref.id)+'.json',{
          headers:{Authorization:'Bearer '+token},cache:'no-store',
          signal:AbortSignal.timeout(10000)
        });
        if(!response.ok)throw Error('QC_STATUS_READ_FAILED');
        return validSaved(await response.json(),ref,b.tipo,b.dia);
      }));
      batch.forEach((ref,j)=>{estados[ref.id]=values[j]});
    }
    return res.status(200).json({ok:true,tipo:b.tipo,dia:b.dia,estados});
  }catch(err){
    const status=err.httpStatus||503;
    if(status===503)console.error('QC_STATUS_TEST_ERROR',err.message);
    return res.status(status).json({error:status===503?'SERVICE_UNAVAILABLE':err.code});
  }
};
