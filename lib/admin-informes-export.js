'use strict';
// Exportaciones de Backoffice sobre informes existentes: sin lecturas ni escrituras adicionales.
const CONFIG={
 qc:{title:'Control de calidad',source:'registered-percentages',columns:[['date','Fecha'],['tipo','Tipo'],['partida','Partida'],['id','Control'],['done','Completo'],['porcentajeInvalidasGlobal','Inválidas global (%)'],['enfermedad1','Enfermedad 1 (%)'],['enfermedad2','Enfermedad 2 (%)'],['enfermedad3','Enfermedad 3 (%)'],['enfermedad4','Enfermedad 4 (%)']],note:'Porcentajes registrados por inspección. No se calculan medias, scoring ni alertas.'},
 partidas:{title:'Partidas (controles QC)',source:'qc-registros',columns:[['partida','Partida'],['tunel','Registros túnel'],['carga','Registros carga'],['ultimaFecha','Último control']],note:'Referencias históricas de controles QC; no constituyen inventario ni ubicación actual.'},
 riego:{title:'Registros de riego',source:'riego-v2',columns:[['fecha','Fecha'],['invernadero','Invernadero'],['calle','Calle'],['texto','Riego registrado'],['marcadoPor','Marcado por']],note:'Registros de riego por día y calle. No acreditan que el riego se haya ejecutado.'},
 plaguicidas:{title:'Plaguicidas',source:'fito-v2',columns:[['fecha','Fecha'],['calle','Calle'],['texto','Registro'],['tipoTrat','Método'],['caldoLitros','Caldo (L)'],['serieId','Serie'],['jornadaId','Jornada']],note:'Registros por celda. No acreditan aplicación ejecutada ni consumo de stock.'},
 especificos:{title:'Específicos',source:'especificos-v2',columns:[['fecha','Fecha'],['calle','Calle'],['texto','Registro'],['caldoLitros','Caldo (L)'],['numeroVinculos','Nº vínculos'],['partidas','Partidas']],note:'Registros por celda. No acreditan ejecución.'},
 tareas:{title:'Tareas operativas',source:'tareas-v1',columns:[['id','ID'],['titulo','Trabajo'],['estado','Estado'],['origen','Origen'],['fechaISO','Fecha programada'],['fechaEjecucionISO','Fecha ejecución'],['asignadoA','Asignado'],['ubicacion','Ubicación'],['prioridad','Prioridad']],note:'No incluye Mantenimiento ni datos de firma.'},
 avisos:{title:'Avisos retenidos',source:'avisos-usuario-v1',columns:[['fecha','Fecha'],['id','ID'],['destinatario','Destinatario'],['tipo','Tipo'],['titulo','Título'],['mensaje','Mensaje'],['leido','Leído'],['resuelto','Resuelto'],['evaluacion','Evaluación']],note:'No es un histórico completo; solo avisos actualmente retenidos (hasta 30 por destinatario).'},
 mantenimiento:{title:'Mantenimiento',source:'mantenimiento-v1',columns:[['fecha','Fecha'],['ticketId','Ticket'],['tipoRegistro','Tipo de evento'],['titulo','Trabajo'],['estado','Estado'],['invernadero','Invernadero'],['asignados','Responsables'],['prioridad','Prioridad'],['proximaFecha','Próxima fecha']],note:'No activa recurrencias ni incluye firmas. Los eventos históricos son independientes.'}
};
const FILTERS={from:'Desde',to:'Hasta',inv:'Invernadero',tipo:'Tipo',partida:'Partida',vista:'Vista',estado:'Estado',origen:'Origen',asignado:'Asignado',destinatario:'Destinatario',buscar:'Buscar'};
const fail=(code,status=400)=>Object.assign(new Error(code),{code,httpStatus:status});
const plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
function parseOptions(query){
  const seccion=query?.seccion,formato=query?.formato;
  if(typeof seccion!=='string'||!Object.hasOwn(CONFIG,seccion))throw fail('INVALID_REPORT_SECTION');
  if(formato!=='csv'&&formato!=='html')throw fail('INVALID_REPORT_FORMAT');
  return {seccion,formato};
}
function rowsFor(seccion,report){
  if(!plain(report)||report.readonly===false)throw fail('INVALID_REPORT_RESULT',503);
  const cfg=CONFIG[seccion];
  if(seccion==='qc'?report.scope!==cfg.source:report.source!==cfg.source)
    throw fail('INVALID_REPORT_SOURCE',503);
  const rows=seccion==='qc'?report.records:seccion==='partidas'?report.partidas:report.rows;
  const total=seccion==='qc'?report.totalRows:seccion==='partidas'?report.totals?.partidas:
    seccion==='avisos'?report.totals?.avisos:report.totals?.[
      seccion==='plaguicidas'||seccion==='especificos'?'celdas':'registros'];
  if(!Array.isArray(rows)||rows.length>500||rows.some(x=>!plain(x))||
    !Number.isSafeInteger(total)||total<rows.length)throw fail('INVALID_REPORT_RESULT',503);
  return {rows,total,partial:rows.length<total};
}
function cell(row,key){
  let v;
  if(/^enfermedad[1-4]$/.test(key))v=row.enfermedades?.[key];
  else if(key==='ultimaFecha')v=Array.isArray(row.registros)?
    row.registros.reduce((a,x)=>typeof x?.fecha==='string'&&x.fecha>a?x.fecha:a,''):'';
  else v=row[key];
  if(v===null||v===undefined)return '';
  if(typeof v==='boolean')return v?'Sí':'No';
  if(Array.isArray(v))return v.filter(x=>typeof x==='string'||typeof x==='number').join('; ');
  return typeof v==='string'||typeof v==='number'?String(v):'';
}
function clean(v){return String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,2500);}
function csvCell(v){
  let s=clean(v);
  // Evitar inyección de fórmulas al abrir el CSV con hojas de cálculo.
  if(/^\s*[=+\-@]/.test(s))s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
}
const csvLine=values=>values.map(csvCell).join(',')+'\r\n';
function htmlText(v){
  return clean(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function render(seccion,formato,report,query={},now=new Date()){
  parseOptions({seccion,formato});
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw fail('INVALID_REPORT_DATE');
  const cfg=CONFIG[seccion],{rows,total,partial}=rowsFor(seccion,report),stamp=now.toISOString();
  const filters=Object.entries(FILTERS).filter(([key])=>typeof query?.[key]==='string'&&query[key].trim())
    .map(([key,label])=>[label,query[key].slice(0,120)]);
  const filename='viguerapp-informe-'+seccion+'-'+stamp.slice(0,10)+'.'+formato;
  let body;
  if(formato==='csv'){
    body='\uFEFF'+csvLine(['ViguerAPP - '+cfg.title])+csvLine(['Emitido UTC',stamp])+
      csvLine(['Alcance',cfg.note])+csvLine(['Registros mostrados',rows.length])+
      csvLine(['Registros filtrados',total]);
    for(const [label,value] of filters)body+=csvLine([label,value]);
    body+='\r\n'+csvLine(cfg.columns.map(col=>col[1]));
    for(const row of rows)body+=csvLine(cfg.columns.map(col=>cell(row,col[0])));
  }else{
    const head=cfg.columns.map(col=>'<th scope="col">'+htmlText(col[1])+'</th>').join('');
    const tableRows=rows.map(row=>'<tr>'+cfg.columns.map(col=>
      '<td>'+htmlText(cell(row,col[0]))+'</td>').join('')+'</tr>').join('');
    const filterText=filters.map(([label,v])=>'<span><b>'+htmlText(label)+':</b> '+htmlText(v)+'</span>').join(' · ');
    body='<!doctype html><html lang="es"><head><meta charset="utf-8">'+
      '<meta name="viewport" content="width=device-width, initial-scale=1">'+
      '<title>ViguerAPP · '+htmlText(cfg.title)+'</title>'+
      '<style>@page{size:A4 landscape;margin:12mm}body{font:12px Arial,sans-serif;color:#234;margin:16px}'+
      'h1{color:#1558a0;font-size:20px}table{width:100%;border-collapse:collapse;table-layout:fixed}'+
      'th,td{border:1px solid #bdccda;padding:6px;text-align:left;vertical-align:top;overflow-wrap:anywhere}'+
      'th{background:#e6f0fa}tr{break-inside:avoid}thead{display:table-header-group}'+
      '.partial{color:#934500;font-weight:bold}@media print{body{margin:0}}</style></head><body>'+
      '<h1>ViguerAPP · '+htmlText(cfg.title)+'</h1><p>Emitido UTC: '+htmlText(stamp)+'</p>'+
      '<p>'+htmlText(cfg.note)+'</p><p class="'+(partial?'partial':'')+'">Registros: '+
      rows.length+' de '+total+(partial?' — Informe parcial por límite de consulta':'')+'</p>'+
      '<p>'+filterText+'</p><table><thead><tr>'+head+'</tr></thead><tbody>'+
      tableRows+'</tbody></table><p>Para imprimir o guardar como PDF, utiliza Imprimir del navegador.</p>'+
      '</body></html>';
  }
  if(Buffer.byteLength(body,'utf8')>3*1024*1024)throw fail('REPORT_TOO_LARGE',503);
  return {filename,body,contentType:formato==='csv'?'text/csv; charset=utf-8':
    'text/html; charset=utf-8',partial,shown:rows.length,total};
}
module.exports={parseOptions,render,_test:{rowsFor,csvCell,htmlText,cell}};
