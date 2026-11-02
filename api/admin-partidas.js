'use strict';
// Backoffice TEST: consulta ADMIN de referencias de partida presentes en QC Túnel/Carga.
// No es maestro de partidas, no determina stock ni ocupación actual y no escribe datos.
const {verifyFirebaseIdToken,serviceAccount,serviceAccessToken,readKey,validHash,httpError}
  =require('./admin-users')._adminCatalogHelpers;
const ORIGIN=Date.UTC(2026,5,15),DAY_MS=86400000,MAX_DAYS=91,MAX_GROUPS=200;
const plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keyOf=value=>String(value??'').trim().toLocaleUpperCase('es');
const clean=value=>typeof value==='string'?value.trim().slice(0,160):'';
function toDay(iso){
  if(typeof iso!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(iso))return null;
  const [y,m,d]=iso.split('-').map(Number),utc=Date.UTC(y,m-1,d);
  if(new Date(utc).toISOString().slice(0,10)!==iso)return null;
  return 15+Math.round((utc-ORIGIN)/DAY_MS);
}
const toISO=day=>new Date(ORIGIN+(day-15)*DAY_MS).toISOString().slice(0,10);
function parseFilters(query){
  const from=toDay(query?.from),to=toDay(query?.to);
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<15||to<from||to-from>=MAX_DAYS)
    throw httpError(400,'INVALID_DATES');
  const tipo=query?.tipo??'todos';
  if(!['todos','tunel','carga'].includes(tipo))throw httpError(400,'INVALID_STAGE');
  const partida=query?.partida??'';
  if(typeof partida!=='string'||partida.length>40||!/^[A-Za-z0-9._-]*$/.test(partida))
    throw httpError(400,'INVALID_FILTER');
  return {from,to,tipo,partida:keyOf(partida)};
}
async function fetchRecords(token,filters){
  const index=await readKey('lasala-control-items-v2-index',token);
  if(!plain(index)||!plain(index.shards))throw httpError(503,'INVALID_CONTROL_INDEX');
  const types=filters.tipo==='todos'?['tunel','carga']:[filters.tipo],wanted=[];
  const qMin=Math.max(0,Math.floor((filters.from-15)/14)),qMax=Math.floor((filters.to-15)/14);
  for(const type of types)for(let q=qMin;q<=qMax;q++){
    const meta=index.shards[type+'|'+q];
    if(meta==null)continue;
    const key='lasala-control-items-v2-'+type+'-q'+q;
    if(!plain(meta)||meta.key!==key||meta.tipo!==type||Number(meta.q)!==q)
      throw httpError(503,'INVALID_CONTROL_INDEX');
    wanted.push({type,key});
  }
  const rows=[],ids=new Set();
  for(let i=0;i<wanted.length;i+=4){
    const pack=await Promise.all(wanted.slice(i,i+4).map(async item=>({
      ...item,data:await readKey(item.key,token)
    })));
    for(const {type,data} of pack){
      if(!plain(data))throw httpError(503,'INVALID_CONTROL_SHARD');
      for(const [id,rec] of Object.entries(data)){
        if(!plain(rec)||rec.id!==id||rec.tipo!==type||
           !Number.isInteger(rec.dia)||rec.dia<filters.from||rec.dia>filters.to)continue;
        if(ids.has(id))throw httpError(503,'DUPLICATE_CONTROL_ID');
        ids.add(id);
        rows.push(rec);
        if(rows.length>50000)throw httpError(503,'TOO_MANY_RECORDS');
      }
    }
  }
  return rows;
}
function location(rec){
  const inv=clean(rec.tipo==='carga'?(rec.invernadero||rec.invId):rec.invId);
  const ranges=Array.isArray(rec.tramos)?rec.tramos.slice(0,40):[];
  const streets=ranges.length?ranges.filter(plain).map(t=>{
    const a=String(t.desde??''),b=String(t.hasta??'');
    return a===b?a:a+'–'+b;
  }).join(', '):
    rec.calleDesde!=null?String(rec.calleDesde)+(rec.calleHasta!=null&&rec.calleHasta!==rec.calleDesde?'–'+rec.calleHasta:''):'';
  return (inv?'INV '+inv:'Ubicación no indicada')+(streets?' · C/ '+streets.slice(0,180):'');
}
function buildSummary(records,filters){
  if(!Array.isArray(records))throw Error('INVALID_RECORDS');
  const groups=new Map();let excluded=0;
  for(const rec of records){
    const part=keyOf(rec.partida);
    if(!/^[A-Z0-9._-]{1,60}$/.test(part)){excluded++;continue}
    if(filters.partida&&!part.includes(filters.partida))continue;
    if(!groups.has(part))groups.set(part,{partida:part,tunel:0,carga:0,registros:[]});
    const g=groups.get(part);
    g[rec.tipo]++;
    g.registros.push({
      id:clean(rec.id),fecha:toISO(rec.dia),tipo:rec.tipo,
      clienteVariedad:clean(rec.tipo==='tunel'?rec.clienteVariedad:
        [rec.cliente,rec.variedad].filter(Boolean).join(' — ')),
      ubicacion:location(rec)
    });
  }
  const sorted=[...groups.values()].sort((a,b)=>{
    const ad=a.registros.reduce((v,r)=>r.fecha>v?r.fecha:v,'');
    const bd=b.registros.reduce((v,r)=>r.fecha>v?r.fecha:v,'');
    return bd.localeCompare(ad)||a.partida.localeCompare(b.partida,'es',{numeric:true});
  });
  for(const g of sorted)g.registros.sort((a,b)=>b.fecha.localeCompare(a.fecha)||a.id.localeCompare(b.id));
  return {source:'qc-registros',stock:false,integracionGS:false,
    from:toISO(filters.from),to:toISO(filters.to),filterType:filters.tipo,
    filterPartida:filters.partida,
    totals:{partidas:sorted.length,registros:sorted.reduce((n,g)=>n+g.registros.length,0),
      sinPartida:excluded,mostrar:Math.min(sorted.length,MAX_GROUPS)},
    partidas:sorted.slice(0,MAX_GROUPS),limit:MAX_GROUPS};
}
async function authorize(req){
  const raw=req.headers?.authorization||'';
  if(!raw.startsWith('Bearer '))throw httpError(401,'UNAUTHORIZED');
  const actor=await verifyFirebaseIdToken(raw.slice(7).trim());
  const token=await serviceAccessToken(serviceAccount());
  const [roles,users]=await Promise.all([
    readKey('lasala-roles-v1',token),readKey('lasala-users-v1',token)
  ]);
  if(roles?.[actor]!=='ADMIN'||!validHash(users?.[actor]))throw httpError(403,'FORBIDDEN');
  return token;
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  }
  try{
    const filters=parseFilters(req.query),token=await authorize(req);
    const rows=await fetchRecords(token,filters);
    return res.status(200).json({ok:true,...buildSummary(rows,filters)});
  }catch(e){
    const code=e.httpStatus||503;
    if(code===503)console.error('ADMIN_PARTIDAS_READ',e.message);
    return res.status(code).json({error:code===503?'SERVICE_UNAVAILABLE':e.code});
  }
};
module.exports._test={toDay,toISO,parseFilters,location,buildSummary,fetchRecords};
