'use strict';

// Backoffice TEST: opciones de Riego. Catálogo aditivo y no destructivo.
// No sustituye los catálogos del módulo operativo hasta que se valide la integración.
const crypto=require('node:crypto');
const {
  verifyFirebaseIdToken,serviceAccount,serviceAccessToken,readKey,
  updateKey,validHash,httpError
}=require('./admin-users')._adminCatalogHelpers;
const KEY='lasala-config-riego-opciones-v1';
const ROLES_KEY='lasala-roles-v1',USERS_KEY='lasala-users-v1';
const GROUPS=[
  {id:'agua_minutos',label:'Tiempos de agua',numeric:true,values:['5','10','15','20','25','30','35','45']},
  {id:'abono_minutos',label:'Tiempos de abono',numeric:true,values:['10','15','20','25','30','35','45']},
  {id:'abono_tinj',label:'Abonos TINJ',values:['T31','T35','T35 SAL','T41','T41 SAL','T5','T6','T7','T8']},
  {id:'abono_sinj',label:'Abonos SINJ',values:['ISO3','ISO2','ISO2 SAL','ISO1','I0','I1']},
  {id:'abono_minj',label:'Abonos MINJ',values:['M14','M14 SAL','M15','M15 SAL','M16','M17','M18']},
  {id:'fitosanitarios',label:'Fitosanitarios',values:['PROPLANT','PREVICUR ENERGY','DAGONIS','NIMROD','LALSTOP','RAZORMIN','RIDOMIL','VERIMARK','LYRUL']},
  {id:'horarios_riego',label:'Horarios rápidos de riego',values:['PROGRAMADO','1º HORA','UH FIN CHICAS','UH FIN TÚNELES','UH','POR LA TARDE','?']},
  {id:'tipos_trabajo',label:'Tipos de trabajo',values:['SUAVE','SECAS','NORMAL']},
  {id:'horarios_trabajo',label:'Horarios de trabajo',values:['1º HORA','MEDIA MAÑANA','POR LA TARDE','UH']}
];
const GROUP_BY_ID=new Map(GROUPS.map(x=>[x.id,x]));
function bodyOf(req){
  let b=req.body;
  if(typeof b==='string'){try{b=JSON.parse(b);}catch(_){throw httpError(400,'INVALID_BODY');}}
  if(!b||typeof b!=='object'||Array.isArray(b))throw httpError(400,'INVALID_BODY');
  return b;
}
function labelOf(v){
  if(typeof v!=='string'||!v.trim()||v!==v.trim()||v.length>80||/[\x00-\x1f<>]/.test(v))
    throw httpError(400,'INVALID_LABEL');
  return v;
}
function groupOf(v){
  const g=GROUP_BY_ID.get(v);
  if(!g)throw httpError(400,'INVALID_GROUP');
  return g;
}
function valueOf(raw,g){
  // El texto del riego separa conceptos con " + ": impedir códigos ambiguos.
  if(typeof raw!=='string'||raw!==raw.trim()||!raw||raw.length>60||raw.includes('+'))
    throw httpError(400,'INVALID_VALUE');
  if(g.numeric){
    if(!/^\d{1,4}$/.test(raw)||Number(raw)<1||Number(raw)>1440||
      String(Number(raw))!==raw)throw httpError(400,'INVALID_VALUE');
  }else if(!/^[\p{L}\p{N}º? +._-]+$/u.test(raw)){
    throw httpError(400,'INVALID_VALUE');
  }
  return raw;
}
function orderedValue(group,value,order,version=0,id){
  return {id:id||group.id+'_'+String(order+1).padStart(3,'0'),group:group.id,
    value,label:group.numeric?value+' min':value,active:true,order,version};
}
function baseline(){
  const map={};
  for(const group of GROUPS){
    group.values.forEach((value,i)=>{
      const e=orderedValue(group,value,i*10);
      // Stable ID based on original index, independent of current order.
      e.id=group.id+'_'+String(i+1).padStart(3,'0');
      map[e.id]=e;
    });
  }
  return map;
}
function readCatalog(raw){
  if(raw==null)raw={};
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Catálogo inválido');
  const base=baseline();
  const stored=raw.items==null?{}:raw.items;
  if(!stored||typeof stored!=='object'||Array.isArray(stored))
    throw new Error('Opciones guardadas inválidas');
  for(const [id,e] of Object.entries(stored)){
    if(!e||typeof e!=='object'||Array.isArray(e)||e.id!==id||
       !/^[a-z0-9_]{3,100}$/.test(id))throw new Error('Opción guardada inválida');
    const g=groupOf(e.group);
    valueOf(e.value,g);labelOf(e.label);
    if(typeof e.active!=='boolean'||!Number.isInteger(e.version)||e.version<0||
       !Number.isInteger(e.order)||e.order<0||e.order>9999)
      throw new Error('Opción guardada inválida');
    // Los registros preexistentes no pueden cambiar su grupo ni valor técnico.
    if(base[id]&&(base[id].group!==e.group||base[id].value!==e.value))
      throw new Error('Valor técnico original modificado');
    base[id]={...e};
  }
  const seen=new Set();
  for(const e of Object.values(base)){
    const identity=e.group+'\u0000'+e.value.toLocaleUpperCase('es');
    if(seen.has(identity))throw new Error('Valores técnicos duplicados');
    seen.add(identity);
  }
  return base;
}
function list(raw){
  const records=Object.values(readCatalog(raw))
    .sort((a,b)=>GROUPS.findIndex(g=>g.id===a.group)-GROUPS.findIndex(g=>g.id===b.group)||
      a.order-b.order||a.value.localeCompare(b.value,'es',{numeric:true}));
  return {groups:GROUPS.map(({id,label,numeric})=>({id,label,numeric:!!numeric})),options:records,operationalIntegration:false};
}
function positiveOrder(order,alt){
  if(order===undefined||order===null)return alt;
  if(!Number.isInteger(order)||order<0||order>9999)throw httpError(400,'INVALID_ORDER');
  return order;
}
function write(map,input,actor){
  const group=groupOf(input.group);
  const options=readCatalog(map);
  const action=input.action;
  if(!['create','edit','deactivate','activate'].includes(action))
    throw httpError(400,'INVALID_ACTION');
  if(action==='create'){
    if(Object.keys(options).length>=400)throw httpError(409,'CATALOG_LIMIT');
    const value=valueOf(input.value,group);
    labelOf(input.label);
    if(Object.values(options).some(x=>x.group===group.id&&
      x.value.toLocaleUpperCase('es')===value.toLocaleUpperCase('es')))
      throw httpError(409,'OPTION_EXISTS');
    const groupItems=Object.values(options).filter(x=>x.group===group.id);
    const order=positiveOrder(input.order,Math.min(9999,Math.max(0,...groupItems.map(x=>x.order))+10));
    const id='option_'+crypto.randomBytes(12).toString('hex');
    options[id]={id,group:group.id,value,label:input.label,order,
      active:true,version:1,updatedAt:new Date().toISOString(),updatedBy:actor};
    map.items=options;
    return {action,id};
  }
  if(typeof input.id!=='string'||!/^[a-z0-9_]{3,100}$/.test(input.id))
    throw httpError(400,'INVALID_ID');
  const entry=options[input.id];
  if(!entry)throw httpError(404,'OPTION_NOT_FOUND');
  if(entry.group!==group.id)throw httpError(409,'GROUP_IMMUTABLE');
  if(!Number.isInteger(input.version)||input.version!==entry.version)
    throw httpError(409,'CONCURRENT_MODIFICATION');
  if(input.value!==undefined&&input.value!==entry.value)throw httpError(409,'VALUE_IMMUTABLE');
  if(action==='edit'){
    entry.label=labelOf(input.label);
    entry.order=positiveOrder(input.order,entry.order);
  }else{
    const next=action==='activate';
    if(entry.active===next)throw httpError(409,'CONCURRENT_MODIFICATION');
    entry.active=next;
  }
  entry.version++;
  entry.updatedAt=new Date().toISOString();
  entry.updatedBy=actor;
  // Save complete merged list including original disabled records. No deletion.
  map.items=options;
  return {action,id:entry.id};
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(!['GET','POST','PATCH'].includes(req.method)){
    res.setHeader('Allow','GET, POST, PATCH');
    return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  }
  const header=req.headers.authorization||'';
  if(!header.startsWith('Bearer '))return res.status(401).json({error:'UNAUTHORIZED'});
  try{
    const actor=await verifyFirebaseIdToken(header.slice(7).trim());
    const accessToken=await serviceAccessToken(serviceAccount());
    const [roles,accounts]=await Promise.all([
      readKey(ROLES_KEY,accessToken),readKey(USERS_KEY,accessToken)
    ]);
    if(roles[actor]!=='ADMIN'||!validHash(accounts[actor]))
      throw httpError(403,'FORBIDDEN');
    if(req.method==='GET')
      return res.status(200).json({...list(await readKey(KEY,accessToken)),currentUser:actor});
    const input=bodyOf(req);
    let result;
    await updateKey(KEY,accessToken,map=>{result=write(map,input,actor);});
    console.info('ADMIN_RIEGO_OPTIONS_TEST',actor,result.action,result.id);
    return res.status(200).json({ok:true,...result});
  }catch(e){
    const status=e.httpStatus||503;
    if(status===503)console.error('admin-riego-options TEST:',e.message);
    return res.status(status).json({error:status===503?'SERVICE_UNAVAILABLE':e.code});
  }
};
