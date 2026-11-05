'use strict';
// Backoffice Informes: solo lecturas administrativas y preparación local de descarga/impresión.
(function(){
  const AUTH='lasala-firebase-auth-v1';
  const API_KEY='AIzaSyBsRjw4NuCFg69P7_eqoX037rgjkbadcA0';
  const API='/api/admin-qc-dashboard';
  const el=id=>document.getElementById('inf-'+id);
  const groups={
    qc:['from','to','qc-type','partida'],
    partidas:['from','to','qc-type','partida'],
    riego:['from','to','inv','buscar'],
    plaguicidas:['from','to','inv','buscar'],
    especificos:['from','to','inv','buscar'],
    tareas:['from','to','vista','estado','origen','asignado','buscar'],
    avisos:['alert-type','estado','destinatario','buscar'],
    mantenimiento:['from','to','vista','estado','asignado','buscar']
  };
  const notes={
    qc:'Se exportan porcentajes guardados por control, sin scoring, medias o alertas. Intervalo máximo: 91 días.',
    partidas:'Solo partidas referenciadas en QC: no son existencias ni ubicación actual. Intervalo máximo: 91 días.',
    riego:'Registros de riego por día y calle, sin certificar ejecución. Invernadero obligatorio; máximo 91 días.',
    plaguicidas:'Celdas registradas, sin certificar ejecución ni consumos. Invernadero obligatorio; máximo 366 días.',
    especificos:'Celdas y vínculos registrados, sin certificar ejecución. Invernadero obligatorio; máximo 366 días.',
    tareas:'Operativas y Archivo separados. Sin firmas ni tickets de Mantenimiento. Las fechas son opcionales.',
    avisos:'Solo avisos retenidos actualmente, no un histórico completo. Sin modificar lectura ni evaluaciones.',
    mantenimiento:'Tickets y eventos existentes. No genera recurrencias ni accede a firmas.'
  };
  const statuses={
    tareas:[['todos','Todos'],['pendiente','Pendiente'],['iniciada','Iniciada'],
      ['en_proceso','En proceso'],['completada','Completada'],['anulada','Anulada']],
    avisos:[['todos','Todos'],['sin_leer','Sin leer'],['leidos','Leídos'],
      ['pendiente_solucion','Pendientes de solución'],['resueltos','Resueltos'],['evaluados','Evaluados']],
    mantenimiento:[['todos','Todos'],['sin_asignar','Sin asignar'],['asignado','Asignado'],
      ['en_proceso','En proceso'],['cerrado','Cerrado'],['archivado','Archivado'],['completada','Completada']]
  };
  const views={
    tareas:[['operativas','Operativas'],['archivo','Archivo']],
    mantenimiento:[['activos','Abiertos'],['archivo','Archivo']]
  };
  let busy=false,objectUrl=null,verifiedUser='';
  function gate(message){
    document.getElementById('gate-title').textContent='Acceso restringido';
    document.getElementById('gate-description').textContent=message;
    document.getElementById('gate-link').hidden=false;
    document.getElementById('access-gate').hidden=false;
    document.getElementById('workspace').hidden=true;
    clearReady();
  }
  function feedback(message,error=false){
    const node=el('feedback');
    node.textContent=message||'';
    node.className='inf-feedback'+(error?' error':'');
    node.hidden=!message;
  }
  function clearReady(){
    el('ready').hidden=true;
    if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}
    el('file-link').removeAttribute('href');
  }
  async function getToken(){
    let saved=null;
    try{saved=JSON.parse(localStorage.getItem(AUTH)||'null')}catch(_){}
    if(!saved?.user||!saved?.refreshToken)throw Error('LOGIN_REQUIRED');
    // Recupera una identidad actual; el endpoint vuelve a comprobar ADMIN en servidor.
    const resp=await fetch('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(API_KEY),{
      method:'POST',cache:'no-store',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'refresh_token',refresh_token:saved.refreshToken}).toString()
    });
    if(!resp.ok)throw Error('LOGIN_REQUIRED');
    const obj=await resp.json();
    if(!obj.id_token||!obj.refresh_token)throw Error('LOGIN_REQUIRED');
    localStorage.setItem(AUTH,JSON.stringify({user:saved.user,refreshToken:obj.refresh_token}));
    return obj.id_token;
  }
  function selectOptions(id,choices){
    const field=el(id);
    field.replaceChildren();
    for(const [value,label] of choices){
      const option=document.createElement('option');
      option.value=value;option.textContent=label;
      field.append(option);
    }
  }
  function changeSection(){
    if(busy)return;
    const section=el('section').value;
    clearReady();
    const used=new Set(groups[section]||[]);
    for(const node of document.querySelectorAll('[data-field]')){
      const id=node.getAttribute('data-field');
      if(id==='section')continue;
      node.hidden=!used.has(id);
    }
    el('scope').textContent=notes[section]||'';
    if(statuses[section])selectOptions('estado',statuses[section]);
    if(views[section])selectOptions('vista',views[section]);
    feedback('');
  }
  function makeQuery(section){
    const active=new Set(groups[section]||[]);
    if(!active.size)throw Error('INVALID_SECTION');
    const q={modo:'informes',seccion:section};
    const get=id=>el(id).value.trim();
    if(active.has('from')){
      const from=get('from'),to=get('to');
      const required=['qc','partidas','riego','plaguicidas','especificos'].includes(section);
      if(required&&(!from||!to))throw Error('DATES_REQUIRED');
      if(!!from!==!!to)throw Error('DATES_PAIR');
      if(from){
        if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||
          from<'2026-06-15'||to<from)throw Error('INVALID_DATES');
        const days=(Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000+1;
        if(days>(section==='qc'||section==='partidas'||section==='riego'?91:366))throw Error('DATE_RANGE');
        q.from=from;q.to=to;
      }
    }
    if(active.has('inv')){
      const inv=get('inv');
      if(!/^[A-Za-z0-9-]{1,16}$/.test(inv))throw Error('INV_REQUIRED');
      q.inv=inv;
    }
    if(active.has('qc-type'))q.tipo=get('qc-type');
    if(active.has('partida')){
      const part=get('partida');
      if(part&&!/^[A-Za-z0-9._-]{1,40}$/.test(part))throw Error('INVALID_PARTIDA');
      q.partida=part;
    }
    if(active.has('alert-type'))q.tipo=get('alert-type');
    if(active.has('vista'))q.vista=get('vista');
    if(active.has('estado'))q.estado=get('estado');
    if(active.has('origen'))q.origen=get('origen');
    if(active.has('asignado'))q.asignado=get('asignado');
    if(active.has('destinatario')){
      const destinatario=get('destinatario');
      if(!/^[A-Za-z0-9._-]{0,60}$/.test(destinatario))throw Error('INVALID_USER');
      q.destinatario=destinatario;
    }
    if(active.has('buscar'))q.buscar=get('buscar');
    return q;
  }
  function friendlyError(err){
    const code=err.message;
    if(code==='DATES_REQUIRED'||code==='DATES_PAIR')return 'Indica las dos fechas: Desde y Hasta.';
    if(code==='INVALID_DATES'||code==='DATE_RANGE')return 'Comprueba las fechas y el intervalo permitido.';
    if(code==='INV_REQUIRED')return 'Indica un código de invernadero válido.';
    if(code==='INVALID_PARTIDA')return 'La referencia de partida contiene caracteres no admitidos.';
    if(code==='INVALID_USER')return 'El identificador de usuario no es válido.';
    if(code==='INVALID_FILTER')return 'Revisa los filtros; alguno no es válido.';
    if(code==='UNAVAILABLE')return 'No se ha podido preparar el informe. Ningún dato ha sido modificado.';
    return 'No se pudo preparar el informe. Revisa los datos e inténtalo de nuevo.';
  }
  async function prepare(format){
    if(busy)return;
    const section=el('section').value;
    let params;
    try{params=makeQuery(section);}
    catch(e){feedback(friendlyError(e),true);return;}
    clearReady();
    busy=true;
    el('csv').disabled=true;el('html').disabled=true;
    feedback('Preparando informe con los datos registrados…');
    try{
      const jwt=await getToken();
      params.formato=format;
      const resp=await fetch(API+'?'+new URLSearchParams(params),{
        method:'GET',headers:{Authorization:'Bearer '+jwt},cache:'no-store'
      });
      if(resp.status===401)throw Error('LOGIN_REQUIRED');
      if(resp.status===403)throw Error('NO_PERMISSION');
      if(resp.status===400)throw Error('INVALID_FILTER');
      if(!resp.ok)throw Error('UNAVAILABLE');
      const blob=await resp.blob();
      const expected=format==='csv'?'text/csv':'text/html';
      if(!resp.headers.get('content-type')?.startsWith(expected)||blob.size>3*1024*1024)
        throw Error('UNAVAILABLE');
      objectUrl=URL.createObjectURL(blob);
      const a=el('file-link');
      a.href=objectUrl;
      const filename='viguerapp-informe-'+section+'-'+new Date().toISOString().slice(0,10)+
        (format==='csv'?'.csv':'.html');
      if(format==='csv'){
        a.download=filename;
        a.removeAttribute('target');
        a.textContent='Descargar CSV';
      }else{
        a.removeAttribute('download');
        a.target='_blank';
        a.rel='noopener noreferrer';
        a.textContent='Abrir documento para imprimir / guardar PDF';
      }
      const partial=resp.headers.get('x-report-partial')==='true';
      const shown=Number(resp.headers.get('x-report-shown'));
      const total=Number(resp.headers.get('x-report-total'));
      el('count').textContent=Number.isSafeInteger(shown)&&Number.isSafeInteger(total)?
        'Registros: '+shown+' de '+total+(partial?' — INFORME PARCIAL; acota los filtros.':''):
        'El informe incluye los registros disponibles dentro de los límites de consulta.';
      el('count').className=partial?'partial':'';
      el('hint').hidden=format==='csv';
      el('ready').hidden=false;
      feedback('Informe preparado. Ábrelo mediante el enlace inferior.');
    }catch(e){
      if(e.message==='LOGIN_REQUIRED'||e.message==='NO_PERMISSION')gate(
        e.message==='LOGIN_REQUIRED'?'Inicia sesión en ViguerAPP.':'Solo administradores activos.');
      else feedback(friendlyError(e),true);
    }finally{
      busy=false;el('csv').disabled=false;el('html').disabled=false;
    }
  }
  async function boot(){
    el('section').addEventListener('change',changeSection);
    el('form').addEventListener('input',()=>{if(!busy)clearReady();});
    el('csv').addEventListener('click',()=>prepare('csv'));
    el('html').addEventListener('click',()=>prepare('html'));
    el('form').addEventListener('submit',event=>{event.preventDefault();prepare('csv');});
    window.addEventListener('beforeunload',clearReady);
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid',year:'numeric',
      month:'2-digit',day:'2-digit'}).format(new Date());
    const from=new Date(Date.parse(today+'T00:00:00Z')-6*86400000).toISOString().slice(0,10);
    el('from').value=from<'2026-06-15'?'2026-06-15':from;
    el('to').value=today;
    changeSection();
    try{
      const jwt=await getToken();
      const resp=await fetch('/api/admin-catalog',{headers:{Authorization:'Bearer '+jwt},cache:'no-store'});
      if(resp.status===401)throw Error('LOGIN_REQUIRED');
      if(resp.status===403)throw Error('NO_PERMISSION');
      if(!resp.ok)throw Error('UNAVAILABLE');
      const obj=await resp.json();
      if(!Array.isArray(obj.rooms)||!Array.isArray(obj.greenhouses))throw Error('UNAVAILABLE');
      verifiedUser=obj.currentUser||'Administrador';
      document.getElementById('session-user').textContent=verifiedUser;
      document.getElementById('access-gate').hidden=true;
      document.getElementById('workspace').hidden=false;
    }catch(e){
      gate(e.message==='LOGIN_REQUIRED'?'Inicia sesión en ViguerAPP.':
        e.message==='NO_PERMISSION'?'Solo administradores activos.':
        'No se ha podido comprobar el acceso al Backoffice.');
    }
  }
  boot();
})();
