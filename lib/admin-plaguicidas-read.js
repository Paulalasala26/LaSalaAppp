'use strict';
// Consulta administrativa de Fito v2. No crea, modifica ni valida aplicaciones ejecutadas.
const DB='https://la-sala-app-test-default-rtdb.europe-west1.firebasedatabase.app';
const ORIGIN=Date.UTC(2026,5,15),DAY_MS=86400000;
const LIMIT=400,MAX_CELLS=30000;
const plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const error=(status,code)=>Object.assign(new Error(code),{httpStatus:status,code});
function toDay(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const [y,m,d]=value.split('-').map(Number),utc=Date.UTC(y,m-1,d);
  if(new Date(utc).toISOString().slice(0,10)!==value)return null;
  return 15+Math.round((utc-ORIGIN)/DAY_MS);
}
const toISO=day=>new Date(ORIGIN+(day-15)*DAY_MS).toISOString().slice(0,10);
function parseQuery(query){
  const from=toDay(query?.from),to=toDay(query?.to),inv=query?.inv??'';
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<15||to<from||to-from>365)
    throw error(400,'INVALID_DATES');
  if(typeof inv!=='string'||!/^[A-Za-z0-9-]{1,16}$/.test(inv))
    throw error(400,'INVALID_INV');
  const search=query?.buscar??'';
  if(typeof search!=='string'||search.length>80||/[\x00-\x1f]/.test(search))
    throw error(400,'INVALID_FILTER');
  return {from,to,inv,buscar:search.trim().toLocaleUpperCase('es')};
}
async function readNode(key,token){
  const r=await fetch(DB+'/'+encodeURIComponent(key)+'.json',{
    headers:{Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(10000)
  });
  if(!r.ok)throw error(503,'FITO_READ_FAILED');
  let data=await r.json();
  if(typeof data==='string'){
    try{data=JSON.parse(data)}catch(_){throw error(503,'FITO_INVALID_JSON')}
  }
  return data;
}
async function readData(token,filter){
  const idx=await readNode('lasala-fito-v2-index',token);
  if(!Array.isArray(idx)||idx.length>150)
    throw error(503,'FITO_INVALID_INDEX');
  // La app operativa admite IDs numéricos antiguos mediante ids.map(String).
  const names=idx.map(x=>typeof x==='string'?x:
    Number.isSafeInteger(x)&&x>=0?String(x):null);
  if(names.some(x=>typeof x!=='string'||!/^[A-Za-z0-9-]{1,16}$/.test(x)))
    throw error(503,'FITO_INVALID_INDEX');
  if(new Set(names.map(x=>x.toLocaleUpperCase('es'))).size!==names.length)
    throw error(503,'FITO_DUPLICATE_INV');
  const canonical=names.find(x=>x.toLocaleUpperCase('es')===filter.inv.toLocaleUpperCase('es'));
  if(!canonical)return {inv:filter.inv,data:{}};
  const data=await readNode('lasala-fito-v2-'+canonical,token);
  if(!plain(data))throw error(503,'FITO_INVALID_SHARD');
  return {inv:canonical,data};
}
function buildReport(shard,filter){
  if(!shard||!plain(shard.data))throw error(503,'FITO_INVALID_SHARD');
  const results=[];let scanned=0,invalid=0;
  for(const [dayKey,streets] of Object.entries(shard.data)){
    if(!/^\d{1,5}$/.test(dayKey)||!Number.isSafeInteger(Number(dayKey)))continue;
    const day=Number(dayKey);
    if(day<filter.from||day>filter.to)continue;
    if(!plain(streets))throw error(503,'FITO_INVALID_DAY');
    for(const [streetKey,raw] of Object.entries(streets)){
      if(++scanned>MAX_CELLS)throw error(503,'FITO_TOO_MANY_CELLS');
      if(!/^\d{1,4}$/.test(streetKey)){invalid++;continue}
      if(raw===null||raw==='')continue;
      if(typeof raw!=='string'&&!plain(raw)){invalid++;continue}
      const texto=typeof raw==='string'?raw:raw.texto;
      if(typeof texto!=='string'||!texto.trim()){invalid++;continue}
      const data=typeof raw==='string'?{}:raw;
      const textoLimpio=texto.slice(0,2000);
      const fields=[textoLimpio,String(data.tipoTrat??''),String(data.serieId??''),
        String(data.jornadaId??'')].join(' ').toLocaleUpperCase('es');
      if(filter.buscar&&!fields.includes(filter.buscar))continue;
      const name=x=>typeof x==='string'?x.slice(0,100):null;
      results.push({
        fecha:toISO(day),dia:day,calle:Number(streetKey),texto:textoLimpio,
        tipoTrat:name(data.tipoTrat),caldoLitros:
          typeof data.caldoLitros==='number'&&Number.isFinite(data.caldoLitros)?data.caldoLitros:
          typeof data.caldoLitros==='string'?data.caldoLitros.slice(0,35):null,
        caldoLabel:name(data.caldoLabel),serieId:name(data.serieId),
        jornadaId:name(data.jornadaId),fechaJornadaISO:name(data.fechaJornadaISO),
        inicioSerieISO:name(data.inicioSerieISO),estadoRegistro:name(data.estadoRegistro),
        primerDia:data.primerDia===true
      });
    }
  }
  results.sort((a,b)=>b.dia-a.dia||a.calle-b.calle);
  return {
    source:'fito-v2',readonly:true,ejecucionConfirmada:false,
    inv:shard.inv,from:toISO(filter.from),to:toISO(filter.to),
    totals:{celdas:results.length,mostradas:Math.min(results.length,LIMIT),invalidas:invalid},
    rows:results.slice(0,LIMIT),limit:LIMIT
  };
}
async function query(token,rawQuery){
  const filters=parseQuery(rawQuery);
  const shard=await readData(token,filters);
  return buildReport(shard,filters);
}
module.exports={query,_test:{toDay,toISO,parseQuery,readNode,readData,buildReport}};
