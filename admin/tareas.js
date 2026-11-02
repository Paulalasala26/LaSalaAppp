'use strict';
// Backoffice Tareas: consulta ADMIN; no realizar cambios de estado ni exponer firmas.
(function(){
  const AUTH='lasala-firebase-auth-v1';
  const API_KEY='AIzaSyDdDdMg6M1jVIssvGYKsdRA-mRug31Yt_g';
  const API='/api/admin-qc-dashboard';
  const el=id=>document.getElementById(id);
  const num=value=>Number(value).toLocaleString('es-ES');
  let busy=false;
  const originNames={manual:'Manual',riego:'Riego',especificos:'Específicos',
    pistola:'Pistola',sin_origen:'Antiguo'};
  const statusNames={pendiente:'Pendiente',iniciada:'Iniciada',en_proceso:'En proceso',
    completada:'Completada',anulada:'Anulada',sin_estado:'Sin estado'};
  function create(tag,content,cls){
    const n=document.createElement(tag);
    if(content!==undefined&&content!==null)n.textContent=String(content);
    if(cls)n.className=cls;
    return n;
  }
  function feedback(text,error=false){
    const box=el('ta-feedback');box.textContent=text||'';box.hidden=!text;
    box.className='ta-alert'+(error?' error':'');
  }
  function gate(message){
    el('gate-title').textContent='Acceso restringido';
    el('gate-description').textContent=message;el('gate-link').hidden=false;
    el('access-gate').hidden=false;el('workspace').hidden=true;
  }
  async function token(){
    let saved=null;
    try{saved=JSON.parse(localStorage.getItem(AUTH)||'null')}catch(_){}
    if(!saved?.user||!saved?.refreshToken)throw Error('LOGIN_REQUIRED');
    const r=await fetch('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(API_KEY),{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'refresh_token',refresh_token:saved.refreshToken}).toString(),
      cache:'no-store'
    });
    if(!r.ok)throw Error('LOGIN_REQUIRED');
    const body=await r.json();
    if(!body.id_token||!body.refresh_token)throw Error('LOGIN_REQUIRED');
    localStorage.setItem(AUTH,JSON.stringify({user:saved.user,refreshToken:body.refresh_token}));
    return body.id_token;
  }
  function filters(){
    const vista=el('ta-view').value,estado=el('ta-status').value,origen=el('ta-origin').value;
    const asignado=el('ta-assigned').value.trim(),buscar=el('ta-search').value.trim();
    const from=el('ta-from').value,to=el('ta-to').value;
    if(!['operativas','archivo'].includes(vista)||
       !['todos','pendiente','iniciada','en_proceso','completada','anulada'].includes(estado)||
       !['todos','manual','riego','especificos','pistola','sin_origen'].includes(origen))
      throw Error('Revisa los filtros de estado y origen.');
    if(asignado.length>60||buscar.length>80)throw Error('Los textos de búsqueda son demasiado largos.');
    if(Boolean(from)!==Boolean(to))throw Error('Para filtrar fechas debes indicar Desde y Hasta.');
    if(from&&((Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000>365||to<from))
      throw Error('El intervalo máximo de fechas es de 366 días.');
    return {modo:'tareas',vista,estado,origen,asignado,buscar,from,to};
  }
  function stat(where,value,name){
    const box=create('div',null,'ta-stat');
    box.append(create('strong',num(value)),create('span',name));where.append(box);
  }
  function td(row,value,className){
    row.append(create('td',value==null||value===''?'—':value,className));
  }
  function dateLabel(iso){
    return iso?new Date(iso+'T12:00:00').toLocaleDateString('es-ES'):'—';
  }
  function render(data){
    if(data.ok!==true||data.source!=='tareas-v1'||data.readonly!==true||
       data.mantenimientoIncluido!==false||!data.totals||!Array.isArray(data.rows))
      throw Error('INVALID_RESPONSE');
    const root=el('ta-stats');root.replaceChildren();
    stat(root,data.totals.registros,'Tareas que cumplen los filtros');
    stat(root,data.totals.mostrados,'Mostradas');
    stat(root,data.totals.invalidos,'Registros no legibles');
    el('ta-heading').textContent=data.vista==='archivo'?'Archivo de tareas':'Tareas operativas';
    el('ta-count').textContent='Mostrando '+num(data.totals.mostrados)+' de '+
      num(data.totals.registros)+' tareas. Archivo calculado a fecha '+data.fechaCorteArchivo+
      '. No incluye tickets de Mantenimiento.'+
      (data.totals.registros>data.totals.mostrados?' Acota los filtros para ver el resto.':'');
    const body=el('ta-body');body.replaceChildren();
    if(!data.rows.length){
      const tr=create('tr'),cell=create('td','No hay tareas para los filtros seleccionados.','ta-empty');
      cell.colSpan=8;tr.append(cell);body.append(tr);
    }
    for(const t of data.rows){
      const tr=create('tr');
      td(tr,dateLabel(t.fechaISO),'ta-nowrap');
      const title=create('td',null,'ta-title');
      title.append(create('strong',t.titulo||'Sin título'));
      if(t.descripcion)title.append(create('small',t.descripcion));
      tr.append(title);
      td(tr,statusNames[t.estado]||t.estado,'ta-nowrap');
      td(tr,originNames[t.origen]||t.origen,'ta-nowrap');
      td(tr,t.asignadoA||'Sin asignar','ta-nowrap');
      td(tr,t.ubicacion||'—','ta-details');
      td(tr,t.horario||'—','ta-nowrap');
      const ref=create('td',null,'ta-id');
      ref.append(create('span',t.id));
      if(t.fechaEjecucionISO&&t.estado==='completada'){
        ref.append(create('small',' · Finalizada: '+dateLabel(t.fechaEjecucionISO)));
      }
      if(t.motivoAnulacion)ref.append(create('small',' · '+t.motivoAnulacion));
      tr.append(ref);body.append(tr);
    }
    el('ta-results').hidden=false;
  }
  async function query(event){
    if(event)event.preventDefault();
    if(busy)return;
    let opts;
    try{opts=filters()}catch(e){feedback(e.message,true);return}
    busy=true;el('ta-query').disabled=true;el('ta-results').hidden=true;
    feedback('Consultando tareas del Backoffice…');
    try{
      const jwt=await token();
      const r=await fetch(API+'?'+new URLSearchParams(opts).toString(),{
        headers:{Authorization:'Bearer '+jwt},cache:'no-store'
      });
      if(r.status===401||r.status===403)throw Error(r.status===401?'LOGIN_REQUIRED':'NO_PERMISSION');
      if(r.status===400)throw Error('INVALID_FILTER');
      if(!r.ok)throw Error('UNAVAILABLE');
      render(await r.json());feedback('');
    }catch(e){
      if(e.message==='LOGIN_REQUIRED'||e.message==='NO_PERMISSION')
        gate(e.message==='LOGIN_REQUIRED'?'Inicia sesión en ViguerAPP.':'Solo administradores activos.');
      else feedback(e.message==='INVALID_FILTER'?'Revisa los filtros de fecha, origen y estado.':
        'No ha sido posible consultar Tareas. No se ha modificado ningún registro.',true);
    }finally{busy=false;el('ta-query').disabled=false}
  }
  async function boot(){
    el('ta-form').addEventListener('submit',query);
    try{
      const jwt=await token();
      const r=await fetch('/api/admin-catalog',{
        headers:{Authorization:'Bearer '+jwt},cache:'no-store'
      });
      if(r.status===401||r.status===403)throw Error(r.status===401?'LOGIN_REQUIRED':'NO_PERMISSION');
      if(!r.ok)throw Error('UNAVAILABLE');
      const catalog=await r.json();
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
