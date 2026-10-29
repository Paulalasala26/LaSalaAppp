'use strict';

// Catálogos de infraestructura TEST: sólo ADMIN. Sin borrar registros.
(function(){
  const SESSION_KEY='lasala-firebase-auth-v1';
  const FIREBASE_WEB_API_KEY='AIzaSyDdDdMg6M1jVIssvGYKsdRA-mRug31Yt_g';
  const API='/api/admin-catalog';
  const ERRORS={
    LOGIN_REQUIRED:'La sesión ha caducado. Accede a ViguerAPP con tu usuario ADMIN.',
    NO_PERMISSION:'Solo un administrador activo puede configurar este catálogo.',
    SERVICE_UNAVAILABLE:'No se ha podido consultar o guardar el catálogo. Comprueba el estado antes de repetir.',
    INVALID_BODY:'Los datos enviados no son válidos.',
    INVALID_KIND:'Tipo de catálogo no válido.',
    INVALID_ACTION:'Acción no permitida.',
    INVALID_ID:'El código no es válido. Las salas usan sala6, sala7…; los invernaderos letras y números.',
    INVALID_LABEL:'Indica un nombre de entre 1 y 60 caracteres.',
    INVALID_VERSION:'El registro ha cambiado; vuelve a abrirlo.',
    ITEM_EXISTS:'Ese código ya existe y no se puede reutilizar.',
    ITEM_NOT_FOUND:'El registro ya no está disponible; actualiza el listado.',
    ROOM_INACTIVE:'Selecciona una sala activa antes de dar de alta o activar el invernadero.',
    ROOM_CHANGE_NOT_ALLOWED:'La sala de un invernadero existente no se puede cambiar para proteger el histórico.',
    ROOM_HAS_ACTIVE_GREENHOUSES:'Desactiva primero los invernaderos activos de esa sala.',
    CONCURRENT_MODIFICATION:'Otro administrador ha cambiado este registro. Recarga el listado antes de seguir.',
    CATALOG_LIMIT:'Se ha alcanzado el límite de registros configurables.'
  };
  let data={rooms:[],greenhouses:[]},kind='rooms',editing=null,busy=false;
  const el=id=>document.getElementById(id);
  const text=(id,value)=>{el(id).textContent=String(value);};
  function feedback(message,error=false){
    const e=el('catalog-feedback');
    e.hidden=!message;
    e.textContent=message||'';
    e.className='operation-feedback '+(error?'error':'ok');
  }
  function gate(title,description,offer){
    text('gate-title',title);text('gate-description',description);
    el('gate-link').hidden=!offer;
    el('workspace').hidden=true;el('access-gate').hidden=false;
  }
  async function token(){
    let stored=null;
    try{stored=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');}catch(_){}
    if(!stored||!stored.user||!stored.refreshToken)throw new Error('LOGIN_REQUIRED');
    const r=await fetch('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(FIREBASE_WEB_API_KEY),{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'refresh_token',refresh_token:stored.refreshToken}).toString(),
      cache:'no-store'
    });
    if(!r.ok)throw new Error('LOGIN_REQUIRED');
    const fresh=await r.json();
    if(!fresh.id_token||!fresh.refresh_token)throw new Error('LOGIN_REQUIRED');
    localStorage.setItem(SESSION_KEY,JSON.stringify({user:stored.user,refreshToken:fresh.refresh_token}));
    return fresh.id_token;
  }
  async function request(method,payload){
    const idToken=await token();
    const r=await fetch(API,{
      method,headers:{
        Authorization:'Bearer '+idToken,
        ...(payload?{'Content-Type':'application/json'}:{})
      },
      ...(payload?{body:JSON.stringify(payload)}:{}),
      cache:'no-store'
    });
    let body={};try{body=await r.json();}catch(_){}
    if(r.status===401)throw new Error('LOGIN_REQUIRED');
    if(r.status===403)throw new Error('NO_PERMISSION');
    if(!r.ok)throw new Error(body.error||'SERVICE_UNAVAILABLE');
    return body;
  }
  function errorText(error){return ERRORS[error.message]||ERRORS.SERVICE_UNAVAILABLE;}
  async function refresh(){
    const response=await request('GET');
    if(!Array.isArray(response.rooms)||!Array.isArray(response.greenhouses))
      throw new Error('SERVICE_UNAVAILABLE');
    data={rooms:response.rooms,greenhouses:response.greenhouses};
    text('session-user',response.currentUser||'Administrador');
    render();
  }
  function currentItems(){return kind==='rooms'?data.rooms:data.greenhouses;}
  function setKindFromHash(){
    kind=location.hash==='#invernaderos'?'greenhouses':'rooms';
    const isRooms=kind==='rooms';
    text('catalog-title',isRooms?'Salas':'Invernaderos');
    text('breadcrumb-name',isRooms?'Salas':'Invernaderos');
    text('list-title',isRooms?'Listado de salas':'Listado de invernaderos');
    text('relation-head',isRooms?'Invernaderos':'Sala');
    text('new-item',isRooms?'+ Nueva sala':'+ Nuevo invernadero');
    el('filter-room').hidden=isRooms;
    for(const a of document.querySelectorAll('[data-catalog-tab],[data-catalog-nav]')){
      const selected=a.getAttribute('data-catalog-tab')===kind||a.getAttribute('data-catalog-nav')===kind;
      a.classList.toggle('selected',selected);
      if(selected)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
    }
    render();
  }
  function make(tag,textContent,className){
    const e=document.createElement(tag);
    if(textContent!=null)e.textContent=String(textContent);
    if(className)e.className=className;
    return e;
  }
  function populateRoomSelector(id,current){
    const select=el(id),old=select.value;
    select.replaceChildren();
    if(id==='filter-room')select.append(make('option','Todas las salas'));
    if(id==='filter-room')select.firstChild.value='';
    data.rooms.filter(r=>id==='filter-room'||r.active||r.id===current)
      .forEach(r=>{
        const opt=make('option',r.label+' ('+r.id+')');
        opt.value=r.id;select.append(opt);
      });
    if(current)select.value=current;
    else if(id==='filter-room')select.value=data.rooms.some(r=>r.id===old)?old:'';
  }
  function render(){
    const items=currentItems();
    text('total-records',items.length);
    text('active-records',items.filter(x=>x.active).length);
    text('inactive-records',items.filter(x=>!x.active).length);
    populateRoomSelector('filter-room');
    const search=el('search-item').value.trim().toLocaleLowerCase('es');
    const status=el('filter-status').value;
    const roomFilter=el('filter-room').value;
    const filtered=items.filter(x=>{
      if(search&&!(x.label+' '+x.id).toLocaleLowerCase('es').includes(search))return false;
      if(status==='active'&&!x.active)return false;
      if(status==='inactive'&&x.active)return false;
      if(kind==='greenhouses'&&roomFilter&&x.roomId!==roomFilter)return false;
      return true;
    });
    const body=el('catalog-body');body.replaceChildren();
    for(const entry of filtered){
      const tr=make('tr');
      tr.append(make('td',entry.id,'user-name'));
      tr.append(make('td',entry.label));
      if(kind==='rooms'){
        const total=data.greenhouses.filter(x=>x.roomId===entry.id).length;
        const active=data.greenhouses.filter(x=>x.roomId===entry.id&&x.active).length;
        tr.append(make('td',total+' ('+active+' activos)'));
      }else{
        const room=data.rooms.find(x=>x.id===entry.roomId);
        tr.append(make('td',(room?room.label:entry.roomId)+(room&&!room.active?' · Inactiva':'')));
      }
      const statusCell=make('td');
      statusCell.append(make('span',entry.active?'Activo':'Desactivado',
        entry.active?'catalog-status is-active':'catalog-status is-inactive'));
      tr.append(statusCell);
      const actions=make('td');actions.className='actions-col';
      const btn=make('button','Gestionar','action-button');btn.type='button';
      btn.addEventListener('click',()=>openEdit(entry));actions.append(btn);tr.append(actions);
      body.append(tr);
    }
    if(!filtered.length){
      const row=make('tr'),cell=make('td','No hay registros para este filtro.','empty-cell');
      cell.colSpan=5;row.append(cell);body.append(row);
    }
    text('result-count',filtered.length+' de '+items.length+' registros');
  }
  function showModal(){
    el('catalog-modal').hidden=false;
    el('form-label').focus();
  }
  function closeModal(){
    if(busy)return;
    el('catalog-modal').hidden=true;
    editing=null;
  }
  function openNew(){
    editing=null;el('catalog-form').reset();
    const isRooms=kind==='rooms';
    text('catalog-modal-title',isRooms?'Nueva sala':'Nuevo invernadero');
    el('form-code').readOnly=false;
    el('form-code').value=isRooms?nextRoomId():'';
    el('form-code').placeholder=isRooms?'sala6':'Ej. 57';
    el('form-label').value='';
    el('room-field').hidden=isRooms;
    if(!isRooms){
      populateRoomSelector('form-room');
      el('form-room').disabled=false;
    }
    el('toggle-item').hidden=true;el('status-line').hidden=true;
    text('catalog-modal-feedback','');
    text('save-item','Crear');
    el('save-item').disabled=false;
    el('save-item').title='';
    showModal();
  }
  function nextRoomId(){
    const ids=new Set(data.rooms.map(x=>x.id));
    let i=1;while(ids.has('sala'+i)&&i<999)i++;
    return 'sala'+i;
  }
  function openEdit(entry){
    editing={...entry};el('catalog-form').reset();
    text('catalog-modal-title',kind==='rooms'?'Editar sala':'Editar invernadero');
    el('form-code').value=entry.id;el('form-code').readOnly=true;
    el('form-label').value=entry.label;
    el('room-field').hidden=kind==='rooms';
    if(kind==='greenhouses'){
      populateRoomSelector('form-room',entry.roomId);
      el('form-room').disabled=true;
    }
    const button=el('toggle-item');
    button.hidden=false;
    button.textContent=entry.active?'Desactivar':'Reactivar';
    button.className='button catalog-state-button'+(entry.active?' is-danger':'');
    el('status-line').hidden=false;
    text('status-line',entry.active?'Estado: activo':'Estado: desactivado');
    text('catalog-modal-feedback','');
    text('save-item','Guardar cambios');
    updateSaveAvailability();
    showModal();
  }
  function updateSaveAvailability(){
    if(!editing)return;
    const unchanged=el('form-label').value.trim()===editing.label;
    el('save-item').disabled=busy||unchanged;
    el('save-item').title=unchanged?'No hay cambios que guardar':'';
  }
  function setBusy(value){
    busy=value;
    for(const id of ['new-item','save-item','toggle-item','catalog-modal-cancel','catalog-modal-close'])el(id).disabled=value;
    if(!value)updateSaveAvailability();
  }
  async function mutate(method,payload,success){
    if(busy)return;
    setBusy(true);text('catalog-modal-feedback','');feedback('');
    try{
      const outcome=await request(method,payload);
      await refresh();
      el('catalog-modal').hidden=true;editing=null;
      feedback(outcome.auditLogged===false ? success+' ATENCIÓN: no se pudo registrar este cambio en Histórico.' : success,outcome.auditLogged===false);
    }catch(error){
      text('catalog-modal-feedback',errorText(error));
      feedback('No se ha confirmado ningún cambio. '+errorText(error),true);
    }finally{setBusy(false);}
  }
  function save(e){
    e.preventDefault();
    const creating=!editing;
    const id=el('form-code').value.trim();
    const label=el('form-label').value.trim();
    const room=kind==='greenhouses'?(editing?editing.roomId:el('form-room').value):undefined;
    if(kind==='rooms'&&!/^sala[0-9]{1,3}$/.test(id)){
      text('catalog-modal-feedback','Código de sala: sala6, sala7…');return;
    }
    if(kind==='greenhouses'&&!/^[A-Z0-9][A-Z0-9-]{0,11}$/.test(id)){
      text('catalog-modal-feedback','Código de invernadero: letras mayúsculas y números.');return;
    }
    if(!label||label.length>60){text('catalog-modal-feedback','Indica un nombre de 1 a 60 caracteres.');return;}
    const payload={kind,id,label,action:creating?'create':'edit',
      ...(creating?{}:{version:editing.version}),
      ...(kind==='greenhouses'?{roomId:room}:{})};
    mutate(creating?'POST':'PATCH',payload,creating?'Registro creado.':'Cambios guardados.');
  }
  function toggle(){
    if(!editing)return;
    const verb=editing.active?'desactivar':'reactivar';
    if(kind==='rooms'&&editing.active){
      const n=data.greenhouses.filter(x=>x.roomId===editing.id&&x.active).length;
      if(n){
        text('catalog-modal-feedback','Esta sala tiene '+n+' invernaderos activos. Desactívalos primero.');
        return;
      }
    }
    if(!confirm('¿Confirmas '+verb+' '+editing.label+'? El registro y su histórico se conservarán.'))return;
    mutate('PATCH',{kind,id:editing.id,version:editing.version,
      action:editing.active?'deactivate':'activate'},
      'Estado actualizado. Registro conservado sin eliminar.');
  }
  function bind(){
    el('new-item').addEventListener('click',openNew);
    el('search-item').addEventListener('input',render);
    el('filter-status').addEventListener('change',render);
    el('filter-room').addEventListener('change',render);
    el('catalog-form').addEventListener('submit',save);
    el('form-label').addEventListener('input',updateSaveAvailability);
    el('toggle-item').addEventListener('click',toggle);
    el('catalog-modal-close').addEventListener('click',closeModal);
    el('catalog-modal-cancel').addEventListener('click',closeModal);
    el('catalog-modal').addEventListener('click',e=>{
      if(e.target===el('catalog-modal'))closeModal();
    });
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!el('catalog-modal').hidden)closeModal();});
    window.addEventListener('hashchange',setKindFromHash);
  }
  async function boot(){
    bind();
    try{
      await refresh();
      el('access-gate').hidden=true;el('workspace').hidden=false;
      setKindFromHash();
    }catch(error){
      const key=error.message;
      if(key==='LOGIN_REQUIRED')gate('Inicia sesión','Accede primero a ViguerAPP con tu cuenta ADMIN.',true);
      else if(key==='NO_PERMISSION')gate('Acceso restringido','Solo los administradores activos pueden acceder al catálogo.',true);
      else gate('No se ha podido cargar','No se ha podido consultar el catálogo. No se ha modificado ningún dato.',true);
    }
  }
  boot();
})();
