'use strict';
// Sólo consulta de los últimos eventos administrativos en Firebase TEST.
// Sin escrituras ni acceso directo a la base de datos desde el navegador.
(function(){
  const SESSION='lasala-firebase-auth-v1';
  const API_KEY='AIzaSyDdDdMg6M1jVIssvGYKsdRA-mRug31Yt_g';
  const AREA={users:'Usuarios y permisos',infrastructure:'Salas / Invernaderos',riego_options:'Opciones de riego'};
  const ACTION={create:'Crear',edit:'Editar',changeRole:'Cambiar rol',resetPassword:'Restablecer contraseña',deactivate:'Desactivar',activate:'Reactivar'};
  const PAGE=100,el=id=>document.getElementById(id);
  let events=[],filtered=[],shown=0,loading=false;
  function node(tag,text,cls){
    const e=document.createElement(tag);
    if(text!=null)e.textContent=String(text);
    if(cls)e.className=cls;return e;
  }
  function feedback(message,error){
    const n=el('audit-feedback');n.hidden=!message;n.textContent=message||'';
    n.className='operation-feedback '+(error?'error':'ok');
  }
  function gate(title,description){
    el('gate-title').textContent=title;el('gate-description').textContent=description;
    el('gate-link').hidden=false;el('access-gate').hidden=false;el('workspace').hidden=true;
  }
  async function token(){
    let stored=null;try{stored=JSON.parse(localStorage.getItem(SESSION)||'null');}catch(e){}
    if(!stored?.user||!stored?.refreshToken)throw new Error('LOGIN_REQUIRED');
    const r=await fetch('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(API_KEY),{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'refresh_token',refresh_token:stored.refreshToken}).toString(),
      cache:'no-store'
    });
    if(!r.ok)throw new Error('LOGIN_REQUIRED');
    const next=await r.json();
    if(!next.id_token||!next.refresh_token)throw new Error('LOGIN_REQUIRED');
    localStorage.setItem(SESSION,JSON.stringify({user:stored.user,refreshToken:next.refresh_token}));
    return next.id_token;
  }
  function dateValue(value){
    const d=new Date(value);
    return Number.isNaN(d.getTime())?'—':d.toLocaleString('es-ES',{dateStyle:'short',timeStyle:'medium'});
  }
  function blank(message){
    const tr=node('tr'),td=node('td',message,'empty-cell');td.colSpan=6;tr.append(td);
    el('audit-body').replaceChildren(tr);
    el('audit-visible').textContent='0 registros';
    el('audit-more').hidden=true;el('audit-export').disabled=true;
  }
  function nextPage(){
    if(!shown)el('audit-body').replaceChildren();
    const group=filtered.slice(shown,shown+PAGE);
    for(const row of group){
      const tr=node('tr');
      tr.append(node('td',dateValue(row.at),'audit-time'));
      tr.append(node('td',row.actor||'—'));
      tr.append(node('td',AREA[row.area]||row.area));
      tr.append(node('td',ACTION[row.action]||row.action,'audit-action'));
      tr.append(node('td',row.target||'—'));
      tr.append(node('td',row.detail||'—'));
      el('audit-body').append(tr);
    }
    shown+=group.length;
    el('audit-visible').textContent=shown+' de '+filtered.length+' movimientos';
    el('audit-more').hidden=shown>=filtered.length;
  }
  function render(){
    const area=el('audit-module').value,action=el('audit-action').value;
    const search=el('audit-text').value.trim().toLocaleLowerCase('es');
    const from=el('audit-from').value,to=el('audit-to').value;
    filtered=events.filter(row=>{
      if(area&&row.area!==area)return false;
      if(action&&row.action!==action)return false;
      const day=String(row.at||'').slice(0,10);
      if(from&&day<from)return false;
      if(to&&day>to)return false;
      if(search&&![row.actor,row.target,row.detail,AREA[row.area],ACTION[row.action]]
        .map(s=>String(s||'')).join(' ').toLocaleLowerCase('es').includes(search))return false;
      return true;
    });
    shown=0;
    el('audit-loaded').textContent=String(events.length);
    el('audit-count').textContent=String(filtered.length);
    el('audit-actors').textContent=String(new Set(filtered.map(x=>x.actor).filter(Boolean)).size);
    el('audit-description').textContent='Hasta 300 eventos recientes. Conservación: un año (limpieza diaria)';
    el('audit-export').disabled=!filtered.length;
    if(!filtered.length){blank(events.length?'No hay movimientos con estos filtros.':'Todavía no hay movimientos registrados desde la activación.');return;}
    nextPage();
  }
  async function refresh(){
    if(loading)return;
    loading=true;el('audit-refresh').disabled=true;
    feedback('Consultando auditoría TEST…',false);
    try{
      const jwt=await token();
      const r=await fetch('/api/admin-audit',{headers:{Authorization:'Bearer '+jwt},cache:'no-store'});
      if(r.status===401)throw new Error('LOGIN_REQUIRED');
      if(r.status===403)throw new Error('NO_PERMISSION');
      if(!r.ok)throw new Error('SERVICE_UNAVAILABLE');
      const data=await r.json();
      if(!Array.isArray(data.events))throw new Error('SERVICE_UNAVAILABLE');
      events=data.events;el('session-user').textContent=data.currentUser||'Administrador';
      render();feedback('',false);
      el('access-gate').hidden=true;el('workspace').hidden=false;
    }catch(e){
      if(e.message==='LOGIN_REQUIRED'||e.message==='NO_PERMISSION')
        gate('Acceso restringido',e.message==='LOGIN_REQUIRED'?'Inicia sesión como ADMIN en ViguerAPP.':'Necesitas permisos ADMIN activos.');
      else feedback('No se ha podido leer la auditoría de Firebase TEST. No se muestran datos incompletos.',true);
      events=[];filtered=[];blank('Consulta no disponible.');
    }finally{loading=false;el('audit-refresh').disabled=false;}
  }
  function exportCSV(){
    if(!filtered.length)return;
    // Evitar fórmulas al abrir CSV con Excel, sin alterar valores en pantalla.
    const safe=value=>{
      let text=String(value==null?'':value);
      if(/^[\s]*[=+\-@]/.test(text))text="'"+text;
      return '"'+text.replace(/"/g,'""')+'"';
    };
    const records=[
      ['Fecha y hora','Administrador','Módulo','Acción','Elemento','Detalle'],
      ...filtered.map(row=>[dateValue(row.at),row.actor,AREA[row.area]||row.area,
        ACTION[row.action]||row.action,row.target,row.detail])
    ];
    const csv='\ufeff'+records.map(fields=>fields.map(safe).join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');
    a.href=url;a.download='viguerapp-historico-test.csv';document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function boot(){
    for(const id of ['audit-module','audit-action','audit-from','audit-to'])
      el(id).addEventListener('change',render);
    el('audit-text').addEventListener('input',render);
    el('audit-refresh').addEventListener('click',refresh);
    el('audit-more').addEventListener('click',nextPage);
    el('audit-export').addEventListener('click',exportCSV);
    el('audit-clear').addEventListener('click',()=>{
      for(const id of ['audit-module','audit-action','audit-text','audit-from','audit-to'])
        el(id).value='';
      render();
    });
    void refresh();
  }
  boot();
})();
