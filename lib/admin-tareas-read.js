'use strict';
// Consulta ADMIN de Tareas Operativas/Archivo. No lee Mantenimiento ni expone firmas.
const DB='https://la-sala-app-dev-default-rtdb.europe-west1.firebasedatabase.app';
const MAX_TASKS=50000,MAX_ROWS=250;
const plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const error=(status,code)=>Object.assign(new Error(code),{httpStatus:status,code});
const short=(value,max=250)=>typeof value==='string'?value.slice(0,max):'';
const isDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&
  Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const executionDate=t=>{
  if(isDate(t.completadoISO))return t.completadoISO;
  const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t.horaFin||'');
  if(m){const iso=m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
    if(isDate(iso))return iso;}
  return isDate(t.fechaISO)?t.fechaISO:null;
};
function archived(t,today){
  if(t.archivadaEn||t.estado==='anulada')return true;
  if(t.estado!=='completada')return false;
  const day=executionDate(t);
  if(!day)return false;
  return Math.round((Date.parse(today+'T00:00:00Z')-Date.parse(day+'T00:00:00Z'))/86400000)>=2;
}
function origin(t){
  if(t.categoria==='mantenimiento')return 'mantenimiento';
  if(t.origenFito?.serieId||t.categoria==='fumigacion')return 'pistola';
  if(t.categoria==='especifico')return 'especificos';
  if(t.categoria==='riego'||t.origenTarea==='riego')return 'riego';
  if(t.categoria==='manual'||t.origenTarea==='manual')return 'manual';
  return 'sin_origen';
}
function parseQuery(q){
  const vista=q?.vista??'operativas',estado=q?.estado??'todos',origen=q?.origen??'todos',
    asignado=q?.asignado??'',buscar=q?.buscar??'',from=q?.from??'',to=q?.to??'';
  if(!['operativas','archivo'].includes(vista))throw error(400,'INVALID_VIEW');
  if(!['todos','pendiente','iniciada','en_proceso','completada','anulada'].includes(estado))
    throw error(400,'INVALID_STATUS');
  if(!['todos','manual','riego','especificos','pistola','sin_origen'].includes(origen))
    throw error(400,'INVALID_ORIGIN');
  if(typeof asignado!=='string'||asignado.length>60||/[\x00-\x1f]/.test(asignado)||
     typeof buscar!=='string'||buscar.length>80||/[\x00-\x1f]/.test(buscar))
    throw error(400,'INVALID_SEARCH');
  if((from&&!to)||(!from&&to))throw error(400,'INVALID_DATES');
  if(from&&(!isDate(from)||!isDate(to)||to<from||
    (Date.parse(to)-Date.parse(from))/86400000>365))throw error(400,'INVALID_DATES');
  return {vista,estado,origen,asignado:asignado.trim().toLocaleUpperCase('es'),
    buscar:buscar.trim().toLocaleUpperCase('es'),from,to};
}
function todayInMadrid(at=new Date()){
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid',
    year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
}
async function readTasks(token){
  const response=await fetch(DB+'/lasala-tareas-v1.json',{
    headers:{Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(10000)
  });
  if(!response.ok)throw error(503,'TASKS_READ_FAILED');
  let data=await response.json();
  if(typeof data==='string'){
    try{data=JSON.parse(data)}catch(_){throw error(503,'TASKS_INVALID_JSON');}
  }
  if(!Array.isArray(data)||data.length>MAX_TASKS)throw error(503,'TASKS_INVALID_DATA');
  return data;
}
function outputLocation(t){
  const objectives=Array.isArray(t.objetivos)?t.objetivos.slice(0,30):[];
  const parts=objectives.filter(plain).map(x=>{
    const inv=short(x.inv,24),streets=short(x.calles,150);
    return (inv?'INV '+inv:'')+(streets?' · '+streets:'');
  }).filter(Boolean);
  return parts.length?parts.join('; ').slice(0,1000):
    (t.inv?'INV '+short(t.inv,24):'')+(t.calles?' · '+short(t.calles,220):'');
}
function report(items,filters,today){
  if(!Array.isArray(items)||!isDate(today))throw error(503,'TASKS_INVALID_DATA');
  const selected=[],ids=new Set();let invalidas=0,excluidasMantenimiento=0;
  for(const t of items){
    if(!plain(t)||typeof t.id!=='string'||!t.id||t.id.length>130){
      invalidas++;continue;
    }
    if(ids.has(t.id))throw error(503,'TASKS_DUPLICATE_ID');
    ids.add(t.id);
    const src=origin(t);
    if(src==='mantenimiento'){excluidasMantenimiento++;continue;}
    const archivedFlag=archived(t,today);
    if((filters.vista==='archivo')!==archivedFlag)continue;
    if(filters.estado!=='todos'&&t.estado!==filters.estado)continue;
    if(filters.origen!=='todos'&&src!==filters.origen)continue;
    const assigned=short(t.asignadoA,60);
    if(filters.asignado&&assigned.toLocaleUpperCase('es')!==filters.asignado)continue;
    const date=isDate(t.fechaISO)?t.fechaISO:'';
    if(filters.from&&(!date||date<filters.from||date>filters.to))continue;
    const title=short(t.titulo,400),description=short(t.descripcion,1200);
    const location=outputLocation(t);
    if(filters.buscar&&![title,description,location,assigned,short(t.id,130),src,date].
      join(' ').toLocaleUpperCase('es').includes(filters.buscar))continue;
    selected.push({
      id:t.id,titulo:title,descripcion:description,estado:short(t.estado,40)||'sin_estado',
      origen:src,fechaISO:date||null,fechaEjecucionISO:executionDate(t),
      asignadoA:assigned,asignadoPor:short(t.asignadoPor,60),
      ubicacion:location,horario:short(t.horario,80),
      prioridad:short(t.prioridad,30),archivada:archivedFlag,
      archivadaEn:short(t.archivadaEn,80),motivoAnulacion:short(t.motivoAnulacion,300),
      horaInicio:short(t.horaInicio,80),horaFin:short(t.horaFin,80)
      // No enviar firmante, firmaPreparador, firmaAplicador ni contraseñas/hashes.
    });
  }
  selected.sort((a,b)=>(b.fechaISO||b.fechaEjecucionISO||'').localeCompare(
    a.fechaISO||a.fechaEjecucionISO||'')||a.id.localeCompare(b.id,'es',{numeric:true}));
  return {source:'tareas-v1',readonly:true,mantenimientoIncluido:false,
    vista:filters.vista,fechaCorteArchivo:today,
    totals:{registros:selected.length,mostrados:Math.min(selected.length,MAX_ROWS),
      invalidos:invalidas,mantenimientoExcluido:excluidasMantenimiento},
    rows:selected.slice(0,MAX_ROWS),limit:MAX_ROWS};
}
async function query(token,rawQuery){
  const filters=parseQuery(rawQuery);
  return report(await readTasks(token),filters,todayInMadrid());
}
module.exports={query,_test:{parseQuery,todayInMadrid,archived,origin,executionDate,readTasks,report}};
