'use strict';
// Backoffice: consulta Específicos por INV/día/calle. No escribe ni concatena orígenes distintos.
const DB='https://la-sala-app-dev-default-rtdb.europe-west1.firebasedatabase.app';
const ORIGIN=Date.UTC(2026,5,15),DAY_MS=86400000,MAX_CELLS=30000,LIMIT=400;
const plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const error=(status,code)=>Object.assign(new Error(code),{httpStatus:status,code});
function toDay(v){
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return null;
  const [y,m,d]=v.split('-').map(Number),utc=Date.UTC(y,m-1,d);
  if(new Date(utc).toISOString().slice(0,10)!==v)return null;
  return 15+Math.round((utc-ORIGIN)/DAY_MS);
}
const toISO=d=>new Date(ORIGIN+(d-15)*DAY_MS).toISOString().slice(0,10);
function parseQuery(q){
  const from=toDay(q?.from),to=toDay(q?.to),inv=q?.inv??'';
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<15||to<from||to-from>365)
    throw error(400,'INVALID_DATES');
  if(typeof inv!=='string'||!/^[A-Za-z0-9-]{1,16}$/.test(inv))
    throw error(400,'INVALID_INV');
  const buscar=q?.buscar??'';
  if(typeof buscar!=='string'||buscar.length>80||/[\x00-\x1f]/.test(buscar))
    throw error(400,'INVALID_FILTER');
  return {from,to,inv,buscar:buscar.trim().toLocaleUpperCase('es')};
}
async function readNode(key,token){
  const r=await fetch(DB+'/'+encodeURIComponent(key)+'.json',{
    headers:{Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(10000)
  });
  if(!r.ok)throw error(503,'ESP_READ_FAILED');
  let obj=await r.json();
  if(typeof obj==='string'){
    try{obj=JSON.parse(obj)}catch(_){throw error(503,'ESP_INVALID_JSON')}
  }
  return obj;
}
async function readData(token,filter){
  const index=await readNode('lasala-especificos-v2-index',token);
  if(!Array.isArray(index)||index.length>150)throw error(503,'ESP_INVALID_INDEX');
  const ids=index.map(x=>typeof x==='string'?x:
    Number.isSafeInteger(x)&&x>=0?String(x):null);
  if(ids.some(x=>typeof x!=='string'||!/^[A-Za-z0-9-]{1,16}$/.test(x)))
    throw error(503,'ESP_INVALID_INDEX');
  if(new Set(ids.map(x=>x.toLocaleUpperCase('es'))).size!==ids.length)
    throw error(503,'ESP_DUPLICATE_INV');
  const canonical=ids.find(x=>x.toLocaleUpperCase('es')===filter.inv.toLocaleUpperCase('es'));
  if(!canonical)return {inv:filter.inv,data:{}};
  const data=await readNode('lasala-especificos-v2-'+canonical,token);
  if(!plain(data))throw error(503,'ESP_INVALID_SHARD');
  return {inv:canonical,data};
}
function buildReport(shard,filter){
  if(!shard||!plain(shard.data))throw error(503,'ESP_INVALID_SHARD');
  const rows=[];let scanned=0,invalidas=0,linkedCells=0;
  const cut=(v,len=200)=>typeof v==='string'?v.slice(0,len):'';
  for(const [dayKey,streets] of Object.entries(shard.data)){
    if(!/^\d{1,5}$/.test(dayKey)||!Number.isSafeInteger(Number(dayKey)))continue;
    const day=Number(dayKey);
    if(day<filter.from||day>filter.to)continue;
    if(!plain(streets))throw error(503,'ESP_INVALID_DAY');
    for(const [streetKey,raw] of Object.entries(streets)){
      if(++scanned>MAX_CELLS)throw error(503,'ESP_TOO_MANY_CELLS');
      if(!/^\d{1,4}$/.test(streetKey)){invalidas++;continue}
      if(raw==null||raw==='')continue;
      if(typeof raw!=='string'&&!plain(raw)){invalidas++;continue}
      const data=typeof raw==='string'?{}:raw;
      const texto=typeof raw==='string'?raw:data.texto;
      if(typeof texto!=='string'||!texto.trim()){invalidas++;continue}
      const links=data.partidaRegistros;
      if(links!=null&&!plain(links)){invalidas++;continue}
      const entries=links?Object.entries(links):[];
      if(entries.length>500)throw error(503,'ESP_TOO_MANY_LINKS');
      if(entries.some(([k,v])=>!k||!plain(v))){invalidas++;continue}
      const partidas=[...new Set(entries.map(([,v])=>cut(v.partida,100)).filter(Boolean))];
      const linked=entries.length>0;
      // Una celda asociada a N partidas sigue siendo UNA celda guardada.
      if(linked)linkedCells++;
      const text=cut(texto,2000);
      const match=[text,...partidas].join(' ').toLocaleUpperCase('es');
      if(filter.buscar&&!match.includes(filter.buscar))continue;
      rows.push({
        fecha:toISO(day),dia:day,calle:Number(streetKey),
        texto:text,caldoLitros:typeof data.caldoLitros==='number'&&Number.isFinite(data.caldoLitros)?
          data.caldoLitros:typeof data.caldoLitros==='string'?cut(data.caldoLitros,35):null,
        caldoLabel:cut(data.caldoLabel,100),vinculadaPartidas:linked,
        numeroVinculos:entries.length,partidas:partidas.slice(0,100)
      });
    }
  }
  rows.sort((a,b)=>b.dia-a.dia||a.calle-b.calle);
  return {
    source:'especificos-v2',readonly:true,ejecucionConfirmada:false,inv:shard.inv,
    from:toISO(filter.from),to:toISO(filter.to),
    totals:{celdas:rows.length,mostradas:Math.min(rows.length,LIMIT),
      invalidas,vinculadas:rows.filter(r=>r.vinculadaPartidas).length},
    rows:rows.slice(0,LIMIT),limit:LIMIT
  };
}
async function query(token,query){const filter=parseQuery(query);return buildReport(await readData(token,filter),filter);}
module.exports={query,_test:{toDay,toISO,parseQuery,readNode,readData,buildReport}};
