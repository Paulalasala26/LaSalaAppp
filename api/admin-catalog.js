'use strict';

// TEST: catálogo administrativo de salas e invernaderos. Sin DELETE.
// Conserva los IDs; el catálogo se configura sin reescribir datos históricos.
// El enlace a los módulos operativos se realizará después de validar la configuración.
const {
  verifyFirebaseIdToken,serviceAccount,serviceAccessToken,readKey,
  updateKey,validHash,httpError
}=require('./admin-users')._adminCatalogHelpers;

const KEY='lasala-config-infra-v1';
const ROLES_KEY='lasala-roles-v1',USERS_KEY='lasala-users-v1';
const BASE={
  sala1:['0A','0B','1A','1B','2A','2B','3A','3B','4A','4B','7A','7B','28','29','30','8','5'],
  sala2:['10A','10B','11A','11B','12','15','16','17','18','19','20','21','22'],
  sala3:['31','32','33','34','35','36','37'],
  sala4:['40','41','42','43','44','45'],
  sala5:['51','52','53','54','55','56']
};
const ROOM_RE=/^sala[0-9]{1,3}$/;
const GREENHOUSE_RE=/^[A-Z0-9][A-Z0-9-]{0,11}$/;
const OBJECT_RE=/^[a-zA-Z0-9._ -]{1,60}$/;
function bodyOf(req){
  let obj=req.body;
  if(typeof obj==='string') {try{obj=JSON.parse(obj);}catch(_){throw httpError(400,'INVALID_BODY');}}
  if(!obj || Array.isArray(obj) || typeof obj!=='object')throw httpError(400,'INVALID_BODY');
  return obj;
}
function roomId(raw){
  if(typeof raw!=='string'||!ROOM_RE.test(raw))throw httpError(400,'INVALID_ID');
  return raw;
}
function greenhouseId(raw){
  if(typeof raw!=='string'||!GREENHOUSE_RE.test(raw))throw httpError(400,'INVALID_ID');
  return raw;
}
function label(raw){
  if(typeof raw!=='string'||raw!==raw.trim()||
    raw.length<1||raw.length>60||/[\x00-\x1f<>]/.test(raw))throw httpError(400,'INVALID_LABEL');
  return raw;
}
function version(raw){
  if(!Number.isSafeInteger(raw)||raw<0)throw httpError(400,'INVALID_VERSION');
  return raw;
}
function makeBase(){
  const rooms={},greenhouses={};
  for(const [room,ids] of Object.entries(BASE)){
    rooms[room]={id:room,label:'Sala '+room.slice(4),active:true,version:0};
    for(const id of ids)greenhouses[id]={id,roomId:room,label:'INV '+id,active:true,version:0};
  }
  return {rooms,greenhouses};
}
function catalog(map){
  if(!map||typeof map!=='object'||Array.isArray(map))throw new Error('Catálogo inválido');
  const base=makeBase();
  for(const type of ['rooms','greenhouses']){
    const records=map[type];
    if(records==null)continue;
    if(typeof records!=='object'||Array.isArray(records))throw new Error('Catálogo inválido');
    for(const [id,entry] of Object.entries(records)){
      if(!entry||typeof entry!=='object'||Array.isArray(entry)||entry.id!==id)
        throw new Error('Catálogo inválido');
      if(type==='rooms')roomId(id);else greenhouseId(id);
      if(entry.active!==true&&entry.active!==false)throw new Error('Catálogo inválido');
      if(!Number.isSafeInteger(entry.version)||entry.version<0)throw new Error('Catálogo inválido');
      if(typeof entry.label!=='string')throw new Error('Catálogo inválido');
      if(type==='greenhouses'&&!entry.roomId)throw new Error('Catálogo inválido');
      base[type][id]={...entry};
    }
  }
  for(const inv of Object.values(base.greenhouses)){
    if(!base.rooms[inv.roomId])throw new Error('Invernadero sin sala');
  }
  return base;
}
function safeList(map){
  const config=catalog(map);
  return {
    rooms:Object.values(config.rooms).sort((a,b)=>a.id.localeCompare(b.id,'es', {numeric:true})),
    greenhouses:Object.values(config.greenhouses).sort((a,b)=>a.id.localeCompare(b.id,'es',{numeric:true}))
  };
}
function actionWrite(map,input,actor){
  const current=catalog(map);
  const kind=input.kind;
  const operation=input.action;
  if(!['rooms','greenhouses'].includes(kind))throw httpError(400,'INVALID_KIND');
  if(!['create','edit','deactivate','activate'].includes(operation))throw httpError(400,'INVALID_ACTION');
  const id=kind==='rooms'?roomId(input.id):greenhouseId(input.id);
  const entries=current[kind];
  const existing=entries[id];
  if(operation==='create'){
    if(existing)throw httpError(409,'ITEM_EXISTS');
    if(Object.keys(entries).length>=(kind==='rooms'?200:500))throw httpError(409,'CATALOG_LIMIT');
    const name=label(input.label);
    let roomIdValue;
    if(kind==='greenhouses'){
      roomIdValue=roomId(input.roomId);
      if(!current.rooms[roomIdValue]||!current.rooms[roomIdValue].active)
        throw httpError(409,'ROOM_INACTIVE');
    }
    entries[id]={id,label:name,active:true,version:1,
      ...(kind==='greenhouses'?{roomId:roomIdValue}:{}),
      updatedAt:new Date().toISOString(),updatedBy:actor};
  }else{
    if(!existing)throw httpError(404,'ITEM_NOT_FOUND');
    if(version(input.version)!==existing.version)throw httpError(409,'CONCURRENT_MODIFICATION');
    if(operation==='edit'){
      existing.label=label(input.label);
      // La sala asignada es inmutable para evitar cambios retrospectivos.
      if(kind==='greenhouses'&&input.roomId!==existing.roomId)
        throw httpError(409,'ROOM_CHANGE_NOT_ALLOWED');
    }else{
      const nextState=operation==='activate';
      if(existing.active===nextState)throw httpError(409,'CONCURRENT_MODIFICATION');
      if(nextState&&kind==='greenhouses'&&!current.rooms[existing.roomId].active)
        throw httpError(409,'ROOM_INACTIVE');
      if(!nextState&&kind==='rooms'&&
        Object.values(current.greenhouses).some(g=>g.roomId===id&&g.active))
        throw httpError(409,'ROOM_HAS_ACTIVE_GREENHOUSES');
      existing.active=nextState;
    }
    existing.version++;
    existing.updatedAt=new Date().toISOString();
    existing.updatedBy=actor;
  }
  // Toda escritura parte del catálogo completo: ningún registro desaparece.
  map.rooms=current.rooms;
  map.greenhouses=current.greenhouses;
  return {kind,action:operation,id};
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(!['GET','POST','PATCH'].includes(req.method)){
    res.setHeader('Allow','GET, POST, PATCH');
    return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  }
  const auth=req.headers.authorization||'';
  if(!auth.startsWith('Bearer '))return res.status(401).json({error:'UNAUTHORIZED'});
  try{
    const actor=await verifyFirebaseIdToken(auth.slice(7).trim());
    const accessToken=await serviceAccessToken(serviceAccount());
    const [roles,accounts]=await Promise.all([
      readKey(ROLES_KEY,accessToken),readKey(USERS_KEY,accessToken)
    ]);
    if(roles[actor]!=='ADMIN'||!validHash(accounts[actor]))
      throw httpError(403,'FORBIDDEN');
    if(req.method==='GET'){
      const stored=await readKey(KEY,accessToken);
      return res.status(200).json({...safeList(stored),currentUser:actor,
        operationalIntegration:false});
    }
    const input=bodyOf(req);
    let outcome;
    await updateKey(KEY,accessToken,map=>{
      outcome=actionWrite(map,input,actor);
    });
    console.info('ADMIN_CATALOG_TEST',actor,outcome.kind,outcome.action,outcome.id);
    return res.status(200).json({ok:true,...outcome});
  }catch(err){
    const status=err.httpStatus||503;
    if(status===503)console.error('admin-catalog TEST:',err.message);
    return res.status(status).json({error:status===503?'SERVICE_UNAVAILABLE':err.code});
  }
};
