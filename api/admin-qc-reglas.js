'use strict';
// Reglas QC por estadio. CONFIGURACIÓN, sin aplicación automática a inspecciones.
// Conserva histórico de revisiones y rechaza ediciones concurrentes (ETag + versión).
const {
  verifyFirebaseIdToken,serviceAccount,serviceAccessToken,readKey,validHash,httpError
}=require('./admin-users')._adminCatalogHelpers;
const DB='https://la-sala-app-test-default-rtdb.europe-west1.firebasedatabase.app';
const BASE=DB+'/lasala-qc-reglas-v1';
const CATEGORIES=Object.freeze({
  color:['verde','amarillo','verdeClaro','ok'],
  tamano:['grande','pequeno','ok'],
  sanidad:['ok','enferma'],
  flores:['si','no','ok'],
  raices:['pocaRaiz','raizVariedad','ok']
});
const STAGES=new Set(['tunel','carga']);
const BEHAVIORS=new Set(['pendiente','informativo','incidencia','critico']);
function parseBody(req){
  let body=req.body;
  if(typeof body==='string'){try{body=JSON.parse(body)}catch(_){throw httpError(400,'INVALID_BODY')}}
  if(!body||typeof body!=='object'||Array.isArray(body))throw httpError(400,'INVALID_BODY');
  return body;
}
function stageOf(value){
  if(!STAGES.has(value))throw httpError(400,'INVALID_STAGE');
  return value;
}
function baseRules(stage){
  const criterios={};
  for(const [category,options] of Object.entries(CATEGORIES)){
    criterios[category]={};
    for(const option of options)criterios[category][option]={tratamiento:'pendiente',toleranciaPct:null};
  }
  return {schemaVersion:1,stage,version:0,umbralAptitudPct:null,criterios,
    updatedAt:null,updatedBy:null};
}
function exactKeys(obj,keys){
  return obj&&typeof obj==='object'&&!Array.isArray(obj)&&
    Object.keys(obj).sort().join('|')===keys.slice().sort().join('|');
}
function percent(value){
  return value===null||(typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100&&Math.abs(Math.round(value*100)-value*100)<1e-7);
}
function validateRules(source,stage){
  if(!source||typeof source!=='object'||Array.isArray(source)||
     !percent(source.umbralAptitudPct)||!exactKeys(source.criterios,Object.keys(CATEGORIES)))
    throw httpError(400,'INVALID_RULES');
  const criterios={};
  for(const [category,options] of Object.entries(CATEGORIES)){
    const provided=source.criterios[category];
    // Compatibilidad: configuraciones anteriores de Flores solo tenían Sí/No.
    // Ampliar el modelo NO debe invalidar ni modificar el histórico existente.
    const legacyFlores=category==='flores'&&exactKeys(provided,['si','no']);
    if(!exactKeys(provided,options)&&!legacyFlores)
      throw httpError(400,'INVALID_RULES');
    criterios[category]={};
    for(const option of options){
      const rule=legacyFlores&&option==='ok'?
        {tratamiento:'pendiente',toleranciaPct:null}:provided[option];
      if(!exactKeys(rule,['tratamiento','toleranciaPct'])||
         !BEHAVIORS.has(rule.tratamiento)||!percent(rule.toleranciaPct)||
         (rule.tratamiento==='pendiente'&&rule.toleranciaPct!==null))
        throw httpError(400,'INVALID_RULES');
      criterios[category][option]={tratamiento:rule.tratamiento,toleranciaPct:rule.toleranciaPct};
    }
  }
  return {umbralAptitudPct:source.umbralAptitudPct,criterios};
}
async function access(req,stage){
  const header=req.headers.authorization||'';
  if(!header.startsWith('Bearer '))throw httpError(401,'UNAUTHORIZED');
  const actor=await verifyFirebaseIdToken(header.slice(7).trim());
  const token=await serviceAccessToken(serviceAccount());
  const [roles,users]=await Promise.all([
    readKey('lasala-roles-v1',token),readKey('lasala-users-v1',token)
  ]);
  const role=roles[actor];
  const allowed=role==='ADMIN'||
    (req.method==='GET'&&
      (role==='TECNICO'||(role==='CARGADOR'&&stage==='carga')));
  if(!allowed||!validHash(users[actor]))throw httpError(403,'FORBIDDEN');
  return {actor,token};
}
async function read(url,token,withETag){
  const res=await fetch(url,{
    headers:{Authorization:'Bearer '+token,...(withETag?{'X-Firebase-ETag':'true'}:{})},
    cache:'no-store',signal:AbortSignal.timeout(10000)
  });
  if(!res.ok)throw new Error('Firebase read failed: '+res.status);
  const raw=await res.json();
  if(raw!==null&&(typeof raw!=='object'||Array.isArray(raw)))throw new Error('Invalid Firebase rule document');
  return {value:raw,etag:res.headers.get('ETag')};
}
function stored(raw,stage){
  if(raw==null)return {rules:baseRules(stage),history:[]};
  if(raw.schemaVersion!==1||raw.stage!==stage||
     !Number.isSafeInteger(raw.version)||raw.version<1||
     !Array.isArray(raw.history)||raw.history.length>100||
     typeof raw.updatedBy!=='string'||typeof raw.updatedAt!=='string')
    throw httpError(409,'RULES_CONFLICT');
  const validated=validateRules(raw,stage);
  return {rules:{...baseRules(stage),...validated,version:raw.version,
    updatedAt:raw.updatedAt,updatedBy:raw.updatedBy},history:raw.history};
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'&&req.method!=='POST'){
    res.setHeader('Allow','GET, POST');
    return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  }
  try{
    const input=req.method==='GET'?req.query:parseBody(req);
    const stage=stageOf(input.stage);
    const {actor,token}=await access(req,stage);
    const url=BASE+'/'+stage+'.json';
    if(req.method==='GET'){
      const {value}=await read(url,token,false);
      const current=stored(value,stage);
      return res.status(200).json({ok:true,stage,rules:current.rules,
        revisions:current.history.length,operationalIntegration:false});
    }
    if(!Number.isSafeInteger(input.version)||input.version<0)
      throw httpError(400,'INVALID_VERSION');
    const config=validateRules(input,stage);
    const snapshot=await read(url,token,true);
    if(!snapshot.etag)throw new Error('Firebase ETag missing');
    const prev=stored(snapshot.value,stage);
    if(prev.rules.version!==input.version)
      throw httpError(409,'CONCURRENT_MODIFICATION');
    const now=new Date().toISOString();
    const history=prev.history.slice(-49);
    if(prev.rules.version>0)history.push({
      version:prev.rules.version,umbralAptitudPct:prev.rules.umbralAptitudPct,
      criterios:prev.rules.criterios,updatedAt:prev.rules.updatedAt,updatedBy:prev.rules.updatedBy
    });
    const next={schemaVersion:1,stage,version:prev.rules.version+1,
      umbralAptitudPct:config.umbralAptitudPct,criterios:config.criterios,
      updatedAt:now,updatedBy:actor,history};
    const response=await fetch(url+'?print=silent',{
      method:'PUT',headers:{Authorization:'Bearer '+token,
        'Content-Type':'application/json','if-match':snapshot.etag},
      body:JSON.stringify(next),signal:AbortSignal.timeout(10000)
    });
    if(response.status===412)throw httpError(409,'CONCURRENT_MODIFICATION');
    if(!response.ok)throw new Error('Firebase write failed: '+response.status);
    console.info('QC_RULES_SAVED',stage,'v'+next.version,actor);
    return res.status(200).json({ok:true,stage,version:next.version,
      updatedAt:now,updatedBy:actor,operationalIntegration:false});
  }catch(e){
    const status=e.httpStatus||503;
    if(status===503)console.error('QC_RULES_ERROR',e.message);
    return res.status(status).json({error:status===503?'SERVICE_UNAVAILABLE':e.code});
  }
};
