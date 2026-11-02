'use strict';
// Backoffice: consulta de los avisos retenidos por usuario; no marca leídos ni resuelve.
const {readKey}=require('../api/admin-users')._adminCatalogHelpers;
const MAX_USERS=300,MAX_ROWS=300,MAX_SCANNED=12000;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const err=(httpStatus,code)=>Object.assign(new Error(code),{httpStatus,code});
const clean=(v,max=400)=>typeof v==='string'?v.slice(0,max):'';
const upper=v=>String(v||'').toLocaleUpperCase('es');
function parseFilters(q){
  const destinatario=q?.destinatario??'',estado=q?.estado??'todos',
    tipo=q?.tipo??'todos',buscar=q?.buscar??'';
  if(typeof destinatario!=='string'||destinatario.length>60||
    !/^[A-Za-z0-9._-]*$/.test(destinatario))throw err(400,'INVALID_USER');
  if(!['todos','sin_leer','leidos','pendiente_solucion','resueltos','evaluados'].includes(estado))
    throw err(400,'INVALID_STATUS');
  if(!['todos','problema_ejecucion','otros'].includes(tipo))throw err(400,'INVALID_TYPE');
  if(typeof buscar!=='string'||buscar.length>80||/[\x00-\x1f]/.test(buscar))
    throw err(400,'INVALID_SEARCH');
  return {destinatario:upper(destinatario.trim()),estado,tipo,buscar:upper(buscar.trim())};
}
function dateSortValue(text){
  const match=/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
  if(!match)return '';
  const [,d,m,y,h='00',min='00',s='00']=match;
  const iso=y+'-'+m.padStart(2,'0')+'-'+d.padStart(2,'0');
  const date=new Date(iso+'T00:00:00Z');
  if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==iso)return '';
  return iso+'T'+h.padStart(2,'0')+':'+min+':'+s;
}
function buildReport(cloud,filters){
  if(!plain(cloud))throw err(503,'INVALID_ALERTS');
  const users=Object.entries(cloud);
  if(users.length>MAX_USERS)throw err(503,'TOO_MANY_USERS');
  const chosen=[],seenIds=new Set();let scanned=0,invalidos=0,recipientCount=0;
  for(const [usuario,avisos] of users){
    if(!/^[A-Za-z0-9._-]{1,60}$/.test(usuario)||!Array.isArray(avisos)||avisos.length>500)
      throw err(503,'INVALID_ALERTS');
    if(!avisos.length)continue;
    recipientCount++;
    if(filters.destinatario&&upper(usuario)!==filters.destinatario)continue;
    for(let i=0;i<avisos.length;i++){
      if(++scanned>MAX_SCANNED)throw err(503,'TOO_MANY_ALERTS');
      const a=avisos[i];
      if(!plain(a)){invalidos++;continue;}
      const id=clean(a.id,140);
      if(!id){invalidos++;continue;}
      const key=usuario+'\u0000'+id;
      if(seenIds.has(key))throw err(503,'DUPLICATE_ALERT_ID');
      seenIds.add(key);
      const problema=a.tipo==='problema_ejecucion';
      const leido=a.leido===true;
      const resuelto=problema&&a.resuelto===true;
      const evaluado=a.evaluacion==='bien'||a.evaluacion==='mal';
      if(filters.tipo==='problema_ejecucion'&&!problema||
         filters.tipo==='otros'&&problema)continue;
      if(filters.estado==='sin_leer'&&leido||
         filters.estado==='leidos'&&!leido||
         filters.estado==='pendiente_solucion'&&(!problema||resuelto)||
         filters.estado==='resueltos'&&(!problema||!resuelto)||
         filters.estado==='evaluados'&&!evaluado)continue;
      const title=clean(a.titulo,160),message=clean(a.mensaje,1000),
        date=clean(a.fecha,80),solution=clean(a.solucion,700),obs=clean(a.observaciones,700);
      if(filters.buscar&&!upper([usuario,title,message,solution,obs].join(' ')).
        includes(filters.buscar))continue;
      chosen.push({
        id,destinatario:usuario,fecha:date,titulo:title,mensaje:message,
        tipo:problema?'problema_ejecucion':'otro',visto:a.visto===true,leido,
        evaluacion:evaluado?a.evaluacion:null,resuelto:problema?resuelto:null,
        solucion:problema?solution:'',observaciones:obs,
        fechaEvaluacion:clean(a.fechaEvaluacion,80),
        __sort:dateSortValue(date),__sourceIndex:i
      });
    }
  }
  chosen.sort((a,b)=>b.__sort.localeCompare(a.__sort)||
    a.destinatario.localeCompare(b.destinatario,'es')||b.__sourceIndex-a.__sourceIndex);
  const reportRows=chosen.slice(0,MAX_ROWS).map(({__sort,__sourceIndex,...r})=>r);
  return {
    source:'avisos-usuario-v1',readonly:true,completo:false,retencionPorUsuario:30,
    filters:{...filters},
    totals:{avisos:chosen.length,mostrados:reportRows.length,
      sinLeer:chosen.filter(x=>!x.leido).length,
      problemasPendientes:chosen.filter(x=>x.tipo==='problema_ejecucion'&&!x.resuelto).length,
      destinatariosConAvisos:recipientCount,invalidos},
    rows:reportRows,limit:MAX_ROWS
  };
}
async function query(token,rawQuery){
  const filters=parseFilters(rawQuery);
  return buildReport(await readKey('lasala-avisos-usuario-v1',token),filters);
}
module.exports={query,_test:{parseFilters,dateSortValue,buildReport}};
