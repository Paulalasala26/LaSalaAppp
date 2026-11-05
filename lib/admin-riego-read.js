'use strict';
// Backoffice: listado de celdas de Riego v2, exclusivo de lectura y sin deducir ejecuciones.
// Reutiliza el origen y las fechas de admin/registros.js; no lee las colas offline.
const DB='https://la-sala-app-test-default-rtdb.europe-west1.firebasedatabase.app';
const ORIGIN=Date.UTC(2026,5,15),DAY_MS=86400000;
const LIMIT=400,MAX_CELLS=30000,MAX_INV=150;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const error=(httpStatus,code)=>Object.assign(new Error(code),{httpStatus,code});
function toDay(text){
  if(typeof text!=='string'||! /^\d{4}-\d{2}-\d{2}$/.test(text))return null;
  const [y,m,d]=text.split('-').map(Number);
  const date=Date.UTC(y,m-1,d);
  if(new Date(date).toISOString().slice(0,10)!==text)return null;
  return 15+Math.round((date-ORIGIN)/DAY_MS);
}
const toISO=day=>new Date(ORIGIN+(day-15)*DAY_MS).toISOString().slice(0,10);
function parseQuery(q){
  const from=toDay(q?.from),to=toDay(q?.to),inv=q?.inv??'',buscar=q?.buscar??'';
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<15||to<from||to-from>90)
    throw error(400,'INVALID_DATES');
  if(typeof inv!=='string'||!/^[A-Za-z0-9-]{1,16}$/.test(inv))
    throw error(400,'INVALID_INV');
  if(typeof buscar!=='string'||buscar.length>80||/[\x00-\x1f]/.test(buscar))
    throw error(400,'INVALID_FILTER');
  return {from,to,inv,buscar:buscar.trim().toLocaleUpperCase('es')};
}
async function readNode(name,token){
  const response=await fetch(DB+'/'+encodeURIComponent(name)+'.json',{
    headers:{Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(10000)
  });
  if(!response.ok)throw error(503,'RIEGO_READ_FAILED');
  let data=await response.json();
  if(typeof data==='string'){
    try{data=JSON.parse(data)}catch(_){throw error(503,'RIEGO_INVALID_JSON');}
  }
  return data;
}
async function readShard(token,filters){
  const index=await readNode('lasala-riego-v2-index',token);
  if(!Array.isArray(index)||index.length>MAX_INV)throw error(503,'RIEGO_INVALID_INDEX');
  const ids=index.map(v=>typeof v==='string'?v:
    Number.isSafeInteger(v)&&v>=0?String(v):null);
  if(ids.some(v=>typeof v!=='string'||!/^[A-Za-z0-9-]{1,16}$/.test(v)))
    throw error(503,'RIEGO_INVALID_INDEX');
  if(new Set(ids.map(v=>v.toLocaleUpperCase('es'))).size!==ids.length)
    throw error(503,'RIEGO_DUPLICATE_INV');
  const canonical=ids.find(v=>v.toLocaleUpperCase('es')===filters.inv.toLocaleUpperCase('es'));
  if(!canonical)return {inv:filters.inv,data:{}};
  const data=await readNode('lasala-riego-v2-'+canonical,token);
  if(!plain(data))throw error(503,'RIEGO_INVALID_SHARD');
  return {inv:canonical,data};
}
function buildReport(shard,filters){
  if(!shard||!plain(shard.data))throw error(503,'RIEGO_INVALID_SHARD');
  const rows=[];let scanned=0,invalidos=0;
  for(const [key,streets] of Object.entries(shard.data)){
    if(!/^\d{1,5}$/.test(key))continue;
    const day=Number(key);
    if(day<filters.from||day>filters.to)continue;
    if(!plain(streets))throw error(503,'RIEGO_INVALID_DAY');
    for(const [streetKey,raw] of Object.entries(streets)){
      if(++scanned>MAX_CELLS)throw error(503,'RIEGO_TOO_MANY_CELLS');
      if(!/^\d{1,3}$/.test(streetKey)||!Number.isSafeInteger(Number(streetKey))){
        invalidos++;continue;
      }
      if(raw==null||raw==='')continue;
      if(typeof raw!=='string'&&!plain(raw)){invalidos++;continue;}
      const texto=typeof raw==='string'?raw:raw.texto;
      if(typeof texto!=='string'||!texto.trim()){invalidos++;continue;}
      const user=plain(raw)&&typeof raw.marcadoPor==='string'?raw.marcadoPor:'';
      const clean=texto.trim().slice(0,2000),author=user.slice(0,80);
      if(filters.buscar&&!([clean,author,streetKey].join(' ').toLocaleUpperCase('es')
        .includes(filters.buscar)))continue;
      rows.push({fecha:toISO(day),dia:day,invernadero:shard.inv,
        calle:Number(streetKey),texto:clean,marcadoPor:author});
    }
  }
  rows.sort((a,b)=>b.dia-a.dia||a.calle-b.calle);
  return {source:'riego-v2',readonly:true,ejecucionConfirmada:false,
    inv:shard.inv,from:toISO(filters.from),to:toISO(filters.to),
    totals:{registros:rows.length,mostrados:Math.min(rows.length,LIMIT),
      dias:new Set(rows.map(r=>r.dia)).size,calles:new Set(rows.map(r=>r.calle)).size,
      invalidos},rows:rows.slice(0,LIMIT),limit:LIMIT};
}
async function query(token,q){
  const filters=parseQuery(q);
  return buildReport(await readShard(token,filters),filters);
}
module.exports={query,_test:{toDay,toISO,parseQuery,readNode,readShard,buildReport}};
