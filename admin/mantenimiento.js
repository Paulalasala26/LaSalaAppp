'use strict';
// Backoffice Mantenimiento: solo lectura. La validación funcional corresponde al gestor del Backoffice.
(function(){
  const AUTH='lasala-firebase-auth-v1';
  const API_KEY='AIzaSyDdDdMg6M1jVIssvGYKsdRA-mRug31Yt_g';
  const API='/api/admin-qc-dashboard';
  const el=id=>document.getElementById(id);
  const count=n=>Number(n).toLocaleString('es-ES');
  let busy=false;
  const statusLabels={sin_asignar:'Sin asignar',asignado:'Asignado',en_proceso:'En proceso',
    cerrado:'Cerrado',archivado:'Archivado',completada:'Ejecución histórica'};
  const typeLabels={ticket:'Ticket abierto',ejecucion:'Ejecución anterior',
    cierre:'Ticket cerrado',archivo:'Baja archivada'};
  function node(tag,value,cls){
    const el=document.createElement(tag);
    if(value!==undefined&&value!==null)el.textContent=String(value);
    if(cls)el.className=cls;
    return el;
  }
  function feedback(msg,error=false){
    const box=el('mt-feedback');box.hidden=!msg;box.textContent=msg||'';
    box.className='mt-feedback'+(error?' error':'');
  }
  function gate(msg){
    el('gate-title').textContent='Acceso restringido';
    el('gate-description').textContent=msg;el('gate-link').hidden=false;
    el('access-gate').hidden=false;el('workspace').hidden=true;
  }
  async function token(){
    let state=null;
    try{state=JSON.parse(localStorage.getItem(AUTH)||'null');}catch(_){}
    if(!state?.user||!state?.refreshToken)throw Error('LOGIN_REQUIRED');
    const r=await fetch('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(API_KEY),{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'refresh_token',refresh_token:state.refreshToken}).toString(),
      cache:'no-store'
    });
    if(!r.ok)throw Error('LOGIN_REQUIRED');
    const data=await r.json();
    if(!data.id_token||!data.refresh_token)throw Error('LOGIN_REQUIRED');
    localStorage.setItem(AUTH,JSON.stringify({user:state.user,refreshToken:data.refresh_token}));
    return data.id_token;
  }
  function filters(){
    const vista=el('mt-view').value,estado=el('mt-state').value,
      buscar=el('mt-search').value.trim(),asignado=el('mt-assigned').value.trim(),
      from=el('mt-from').value,to=el('mt-to').value;
    if(!['activos','archivo'].includes(vista)||
      !['todos','sin_asignar','asignado','en_proceso','cerrado','archivado','completada'].includes(estado))
      throw Error('Revisa la sección y el estado.');
    if(buscar.length>80||asignado.length>60)throw Error('Acorta los textos de búsqueda.');
    if(Boolean(from)!==Boolean(to))throw Error('Indica ambas fechas o deja las dos vacías.');
    if(from&&(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||
      to<from||(Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000>365))
      throw Error('El período máximo es de 366 días.');
    return {modo:'mantenimiento',vista,estado,buscar,asignado,from,to};
  }
  function stat(container,value,label){
    const card=node('div',null,'mt-stat');
    card.append(node('strong',count(value)),node('span',label));container.append(card);
  }
  function td(row,value,cls){
    row.append(node('td',value===null||value===undefined||value===''?'—':value,cls));
  }
  const prettyDate=iso=>iso?new Date(iso+'T12:00:00').toLocaleDateString('es-ES'):'—';
  function render(data){
    if(!data.ok||data.source!=='mantenimiento-v1'||data.readonly!==true||
       data.recurrenciasProcesadas!==false||data.firmasIncluidas!==false||
       !data.totals||!Array.isArray(data.rows))throw Error('INVALID_RESPONSE');
    const metrics=el('mt-stats');metrics.replaceChildren();
    stat(metrics,data.totals.registros,'Registros según filtros');
    stat(metrics,data.totals.mostrados,'Mostrados');
    stat(metrics,data.totals.malformed,'Registros no legibles');
    el('mt-heading').textContent=data.vista==='archivo'?'Archivo de Mantenimiento':'Tickets abiertos';
    el('mt-count').textContent='Mostrando '+count(data.totals.mostrados)+' de '+count(data.totals.registros)+
      ' registros. El Archivo puede contener varias ejecuciones de un mismo ticket.'+
      (data.totals.registros>data.totals.mostrados?' Acota los filtros para ver el resto.':'');
    const body=el('mt-body');body.replaceChildren();
    if(!data.rows.length){
      const tr=node('tr'),cell=node('td','No se encontraron registros con los filtros seleccionados.','mt-empty');
      cell.colSpan=7;tr.append(cell);body.append(tr);
    }
    for(const item of data.rows){
      const row=node('tr');
      td(row,prettyDate(item.fecha),'mt-nowrap');
      const title=node('td',null,'mt-title');
      title.append(node('strong',item.titulo||'Sin título'));
      if(item.descripcion)title.append(node('small',item.descripcion));
      row.append(title);
      td(row,statusLabels[item.estado]||item.estado,'mt-nowrap');
      td(row,item.asignados?.join(', ')||'Sin asignar','mt-wrap');
      td(row,item.invernadero||'—','mt-nowrap');
      const repeat=[item.recurrencia?item.recurrencia:'No recurrente',
        item.proximaFecha?'Próxima: '+prettyDate(item.proximaFecha):''].filter(Boolean).join(' · ');
      td(row,repeat,'mt-wrap');
      const detail=node('td',null,'mt-id');
      detail.append(node('span',(typeLabels[item.tipoRegistro]||item.tipoRegistro)+' · '+item.ticketId));
      if(item.archivadoPor)detail.append(node('small',' · Archivado por: '+item.archivadoPor));
      if(item.motivoArchivo)detail.append(node('small',' · '+item.motivoArchivo));
      row.append(detail);body.append(row);
    }
    el('mt-results').hidden=false;
  }
  async function query(event){
    if(event)event.preventDefault();
    if(busy)return;
    let opts;
    try{opts=filters()}catch(e){feedback(e.message,true);return;}
    busy=true;el('mt-query').disabled=true;el('mt-results').hidden=true;
    feedback('Consultando registros de Mantenimiento…');
    try{
      const jwt=await token();
      const res=await fetch(API+'?'+new URLSearchParams(opts).toString(),{
        headers:{Authorization:'Bearer '+jwt},cache:'no-store'
      });
      if(res.status===401||res.status===403)throw Error(res.status===401?'LOGIN_REQUIRED':'NO_PERMISSION');
      if(res.status===400)throw Error('INVALID_FILTER');
      if(!res.ok)throw Error('UNAVAILABLE');
      render(await res.json());feedback('');
    }catch(e){
      if(e.message==='LOGIN_REQUIRED'||e.message==='NO_PERMISSION')
        gate(e.message==='LOGIN_REQUIRED'?'Inicia sesión en ViguerAPP.':'Solo administradores activos.');
      else feedback(e.message==='INVALID_FILTER'?'Revisa estado, operario, búsqueda y fechas.':
        'No se pudo consultar Mantenimiento. No se han modificado datos.',true);
    }finally{busy=false;el('mt-query').disabled=false;}
  }
  async function boot(){
    el('mt-form').addEventListener('submit',query);
    try{
      const jwt=await token();
      const res=await fetch('/api/admin-catalog',{headers:{Authorization:'Bearer '+jwt},cache:'no-store'});
      if(res.status===401||res.status===403)throw Error(res.status===401?'LOGIN_REQUIRED':'NO_PERMISSION');
      if(!res.ok)throw Error('UNAVAILABLE');
      const catalog=await res.json();
      if(!Array.isArray(catalog.rooms)||!Array.isArray(catalog.greenhouses))throw Error('UNAVAILABLE');
      el('session-user').textContent=catalog.currentUser||'Administrador';
      el('access-gate').hidden=true;el('workspace').hidden=false;
      await query();
    }catch(e){
      gate(e.message==='LOGIN_REQUIRED'?'Inicia sesión en ViguerAPP.':
        e.message==='NO_PERMISSION'?'Solo administradores activos.':
        'No se ha podido comprobar el acceso al Backoffice.');
    }
  }
  boot();
})();
