'use strict';
// Backoffice Mantenimiento: lectura de tickets y eventos retenidos. Nunca reinicia recurrencias.
// El helper admin-users.readKey usa parseMap (solo objetos). Mantenimiento es un ARRAY.
const DB='https://la-sala-app-dev-default-rtdb.europe-west1.firebasedatabase.app';
const MAX_TICKETS=20000,MAX_EVENTS=50000,LIMIT=300;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const err=(httpStatus,code)=>Object.assign(new Error(code),{httpStatus,code});
const str=(x,max=400)=>typeof x==='string'?x.slice(0,max):'';
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&
  !Number.isNaN(Date.parse(x+'T00:00:00Z'))&&
  new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const upper=x=>String(x||'').toLocaleUpperCase('es');
function parseFilters(q){
  const vista=q?.vista??'activos',estado=q?.estado??'todos',
    asignado=q?.asignado??'',buscar=q?.buscar??'',from=q?.from??'',to=q?.to??'';
  if(!['activos','archivo'].includes(vista))throw err(400,'INVALID_VIEW');
  if(!['todos','sin_asignar','asignado','en_proceso','cerrado','archivado','completada'].includes(estado))
    throw err(400,'INVALID_STATUS');
  if(typeof asignado!=='string'||asignado.length>60||/[\x00-\x1f]/.test(asignado)||
     typeof buscar!=='string'||buscar.length>80||/[\x00-\x1f]/.test(buscar))
    throw err(400,'INVALID_SEARCH');
  if(Boolean(from)!==Boolean(to))throw err(400,'INVALID_DATES');
  if(from&&(!date(from)||!date(to)||to<from||(Date.parse(to)-Date.parse(from))/86400000>365))
    throw err(400,'INVALID_DATES');
  return {vista,estado,asignado:upper(asignado.trim()),buscar:upper(buscar.trim()),from,to};
}
function sourceDate(t){
  const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t.horaFin||'');
  if(!m)return null;
  const x=m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
  return date(x)?x:null;
}
function report(tickets,filter){
  if(!Array.isArray(tickets)||tickets.length>MAX_TICKETS)throw err(503,'INVALID_MAINTENANCE');
  const ids=new Set(),rows=[];let malformed=0,events=0,ticketMatches=0;
  const add=(t,kind,e,idx)=>{
    const assigned=Array.isArray(e.asignados)?e.asignados.filter(x=>typeof x==='string').map(x=>str(x,60)):
      Array.isArray(t.asignados)?t.asignados.filter(x=>typeof x==='string').map(x=>str(x,60)):[];
    const dateCandidate=kind==='ticket'?t.fechaProgramada:
      kind==='archivo'?(t.fechaArchivoISO||str(t.archivadaEn).slice(0,10)):
      (e.completadoISO||sourceDate(e)||e.fechaProgramada);
    const when=date(dateCandidate)?dateCandidate:null;
    const state=kind==='ticket'?str(t.estado,40):
      kind==='archivo'?'archivado':kind==='cierre'?'cerrado':'completada';
    if(filter.estado!=='todos'&&state!==filter.estado)return;
    if(filter.asignado&&!assigned.some(u=>upper(u)===filter.asignado))return;
    if(filter.from&&(!when||when<filter.from||when>filter.to))return;
    const title=str(t.titulo,400),description=str(t.descripcion,900),id=str(t.id,130);
    const inv=/\bINV\s+([^\s)]+)/i.exec(title);
    const greenhouse=inv?str(inv[1],35):'';
    const recurrence=plain(t.recurrencia)&&Number.isSafeInteger(Number(t.recurrencia.cada))&&
      Number(t.recurrencia.cada)>0&&['dias','semanas','meses','anos'].includes(t.recurrencia.unidad)
      ?String(t.recurrencia.cada)+' '+t.recurrencia.unidad:'';
    const archivedBy=kind==='archivo'?str(t.archivadoPor,60):'';
    const descriptionExtra=kind==='archivo'?str(t.motivoArchivo,200):'';
    if(filter.buscar&&!upper([title,description,id,greenhouse,assigned.join(' '),recurrence,
      descriptionExtra,archivedBy].join(' ')).includes(filter.buscar))return;
    rows.push({
      id:kind==='ticket'?id:id+'@'+kind+'_'+idx,ticketId:id,
      tipoRegistro:kind,titulo:title,descripcion:description,estado:state,
      asignados:assigned,asignadoPor:str(t.asignadoPor,60),
      fecha:when,fechaProgramada:date(t.fechaProgramada)?t.fechaProgramada:null,
      invernadero:greenhouse,prioridad:str(t.prioridad,30),
      proximaFecha:date(t.proximaFecha)?t.proximaFecha:null,
      recurrencia:recurrence,
      archivadoPor:archivedBy,motivoArchivo:descriptionExtra,
      horaInicio:str(e.horaInicio,80),horaFin:str(e.horaFin,80)
      // Excluye firmante, firma, horaInicioTs, horaFinTs, visto y otros campos internos.
    });
  };
  for(const t of tickets){
    if(!plain(t)||typeof t.id!=='string'||!t.id.trim()||t.id.length>130){
      malformed++;continue;
    }
    if(ids.has(t.id))throw err(503,'DUPLICATE_MAINTENANCE_ID');
    ids.add(t.id);
    const history=t.historialEjecuciones??[];
    if(!Array.isArray(history))throw err(503,'INVALID_MAINTENANCE_HISTORY');
    if(events+history.length>MAX_EVENTS)throw err(503,'TOO_MANY_EVENTS');
    events+=history.length;
    if(filter.vista==='activos'){
      if(!t.archivadaEn&&t.estado!=='cerrado'){ticketMatches++;add(t,'ticket',t,0);}
    }else{
      for(let i=0;i<history.length;i++){
        if(!plain(history[i])){malformed++;continue;}
        add(t,'ejecucion',history[i],i);
      }
      if(t.estado==='cerrado')add(t,'cierre',t,0);
      if(t.archivadaEn)add(t,'archivo',t,0);
    }
  }
  rows.sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'')||
    a.ticketId.localeCompare(b.ticketId,'es',{numeric:true})||
    a.tipoRegistro.localeCompare(b.tipoRegistro,'es'));
  return {source:'mantenimiento-v1',readonly:true,recurrenciasProcesadas:false,
    firmasIncluidas:false,archivoPorEventos:true,vista:filter.vista,
    totals:{registros:rows.length,mostrados:Math.min(rows.length,LIMIT),
      ticketsActivos:filter.vista==='activos'?ticketMatches:null,
      malformed,ejecucionesHistoricas:events},
    rows:rows.slice(0,LIMIT),limit:LIMIT};
}
async function readTickets(token){
  const response=await fetch(DB+'/lasala-mantenimiento-v1.json',{
    headers:{Authorization:'Bearer '+token},cache:'no-store',
    signal:AbortSignal.timeout(10000)
  });
  if(!response.ok)throw err(503,'MAINTENANCE_READ_FAILED');
  let value=await response.json();
  if(typeof value==='string'){
    try{value=JSON.parse(value)}catch(_){throw err(503,'MAINTENANCE_INVALID_JSON')}
  }
  if(!Array.isArray(value)||value.length>MAX_TICKETS)
    throw err(503,'INVALID_MAINTENANCE');
  return value;
}
async function query(token,q){
  const filters=parseFilters(q);
  return report(await readTickets(token),filters);
}
module.exports={query,_test:{parseFilters,sourceDate,readTickets,report}};
