'use strict';

// Backoffice TEST: catálogo conectado a los formularios de Riego; sin eliminaciones.
(function(){
  const KEY='lasala-firebase-auth-v1';
  const FIREBASE_WEB_API_KEY='AIzaSyDdDdMg6M1jVIssvGYKsdRA-mRug31Yt_g';
  const API='/api/admin-riego-options';
  const ERRORS={
    LOGIN_REQUIRED:'Inicia sesión en ViguerAPP como administrador.',
    NO_PERMISSION:'Se necesita una cuenta ADMIN activa.',
    INVALID_BODY:'Los datos enviados no son válidos.',
    INVALID_GROUP:'El grupo de opciones no es válido.',
    INVALID_ACTION:'Esta acción no está permitida.',
    INVALID_ID:'Identificador no válido.',
    INVALID_VALUE:'Indica un valor técnico válido (minutos positivos o texto).',
    INVALID_LABEL:'Introduce una etiqueta válida, de 1 a 80 caracteres.',
    INVALID_ORDER:'Indica un orden entre 0 y 9999.',
    OPTION_EXISTS:'Este valor técnico ya existe en el grupo, incluso si está desactivado.',
    OPTION_NOT_FOUND:'La opción ya no existe en la configuración; actualiza.',
    CONCURRENT_MODIFICATION:'Otro administrador ha cambiado esta opción. Vuelve a abrirla.',
    VALUE_IMMUTABLE:'El valor técnico no se puede modificar después del alta.',
    GROUP_IMMUTABLE:'Una opción no puede trasladarse a otro grupo.',
    CATALOG_LIMIT:'Se ha alcanzado el límite del catálogo.',
    SERVICE_UNAVAILABLE:'No se ha podido confirmar la operación. Recarga antes de reintentar.'
  };
  let data={groups:[],options:[]},group='',editing=null,busy=false;
  const el=id=>document.getElementById(id);
  const set=(id,value)=>{el(id).textContent=String(value);};
  function message(value,error=false){
    const e=el('options-feedback');
    e.hidden=!value;e.textContent=value||'';
    e.className='operation-feedback '+(error?'error':'ok');
  }
  function gate(title,description){
    set('gate-title',title);set('gate-description',description);
    el('gate-link').hidden=false;
    el('access-gate').hidden=false;el('workspace').hidden=true;
  }
  async function token(){
    let stored;
    try{stored=JSON.parse(localStorage.getItem(KEY)||'null');}catch(_){}
    if(!stored?.user||!stored?.refreshToken)throw new Error('LOGIN_REQUIRED');
    const r=await fetch(
      'https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(FIREBASE_WEB_API_KEY),{
        method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({grant_type:'refresh_token',refresh_token:stored.refreshToken}).toString(),
        cache:'no-store'
      });
    if(!r.ok)throw new Error('LOGIN_REQUIRED');
    const body=await r.json();
    if(!body.id_token||!body.refresh_token)throw new Error('LOGIN_REQUIRED');
    localStorage.setItem(KEY,JSON.stringify({user:stored.user,refreshToken:body.refresh_token}));
    return body.id_token;
  }
  async function request(method,payload){
    const authorization=await token();
    const r=await fetch(API,{
      method,
      headers:{Authorization:'Bearer '+authorization,...(payload?{'Content-Type':'application/json'}:{})},
      ...(payload?{body:JSON.stringify(payload)}:{}),cache:'no-store'
    });
    let response={};try{response=await r.json();}catch(_){}
    if(r.status===401)throw new Error('LOGIN_REQUIRED');
    if(r.status===403)throw new Error('NO_PERMISSION');
    if(!r.ok)throw new Error(response.error||'SERVICE_UNAVAILABLE');
    return response;
  }
  function errorText(e){return ERRORS[e.message]||ERRORS.SERVICE_UNAVAILABLE;}
  function make(tag,text,className){
    const node=document.createElement(tag);if(text!=null)node.textContent=String(text);
    if(className)node.className=className;
    return node;
  }
  function selectedGroup(){return data.groups.find(g=>g.id===group);}
  function thisGroupItems(){return data.options.filter(x=>x.group===group);}
  function defaultOrder(){
    return Math.min(9999,Math.max(0,...thisGroupItems().map(x=>x.order))+10);
  }
  function render(){
    const groups=el('group-selector');
    if(!groups.options.length || groups.options.length!==data.groups.length){
      groups.replaceChildren(...data.groups.map(g=>{
        const option=make('option',g.label);option.value=g.id;return option;
      }));
    }
    if(!data.groups.some(x=>x.id===group))group=data.groups[0]?.id||'';
    groups.value=group;
    const current=selectedGroup();
    set('list-title',current?current.label:'Opciones');
    const items=thisGroupItems();
    set('total-records',items.length);
    set('active-records',items.filter(x=>x.active).length);
    set('inactive-records',items.filter(x=>!x.active).length);
    const search=el('search-option').value.trim().toLocaleLowerCase('es');
    const status=el('filter-status').value;
    const shown=items.filter(x=>
      (!search||(x.label+' '+x.value).toLocaleLowerCase('es').includes(search))&&
      (status==='all'||(status==='active'&&x.active)||(status==='inactive'&&!x.active))
    );
    set('result-count',shown.length+' de '+items.length+' opciones');
    const body=el('options-body');body.replaceChildren();
    for(const option of shown){
      const row=make('tr');
      row.append(make('td',option.value,'user-name'));
      row.append(make('td',option.label));
      row.append(make('td',option.order));
      const state=make('td');
      state.append(make('span',option.active?'Activa':'Desactivada',
        option.active?'catalog-status is-active':'catalog-status is-inactive'));
      row.append(state);
      const actions=make('td');actions.className='actions-col';
      const btn=make('button','Gestionar','action-button');
      btn.type='button';btn.addEventListener('click',()=>openEdit(option));actions.append(btn);row.append(actions);
      body.append(row);
    }
    if(!shown.length){const row=make('tr'),cell=make('td','No hay opciones para este filtro.','empty-cell');cell.colSpan=5;row.append(cell);body.append(row);}
  }
  async function refresh(){
    const response=await request('GET');
    if(!Array.isArray(response.groups)||!Array.isArray(response.options))
      throw new Error('SERVICE_UNAVAILABLE');
    data={groups:response.groups,options:response.options};
    set('session-user',response.currentUser||'Administrador');
    render();
  }
  function openForm(){
    el('options-modal').hidden=false;
    el('form-label').focus();
  }
  function closeForm(){
    if(busy)return;
    el('options-modal').hidden=true;editing=null;
  }
  function valueHint(){
    const g=selectedGroup();
    const value=el('form-value');
    value.inputMode=g?.numeric?'numeric':'text';
    value.placeholder=g?.numeric?'Ej. 40':'Ej. NUEVA OPCIÓN';
  }
  function openNew(){
    editing=null;el('options-form').reset();
    set('options-modal-title','Nueva opción · '+(selectedGroup()?.label||''));
    const value=el('form-value');
    value.readOnly=false;value.value='';valueHint();
    el('form-label').value='';
    el('form-order').value=String(defaultOrder());
    el('toggle-option').hidden=true;el('option-status').hidden=true;
    set('modal-feedback','');set('save-option','Crear');
    openForm();
  }
  function openEdit(option){
    editing={...option};
    el('options-form').reset();
    set('options-modal-title','Editar opción · '+(selectedGroup()?.label||''));
    el('form-value').readOnly=true;el('form-value').value=option.value;valueHint();
    el('form-label').value=option.label;
    el('form-order').value=String(option.order);
    const toggle=el('toggle-option');toggle.hidden=false;
    toggle.className='button catalog-state-button'+(option.active?' is-danger':'');
    toggle.textContent=option.active?'Desactivar':'Reactivar';
    el('option-status').hidden=false;
    set('option-status','Estado: '+(option.active?'activo':'desactivado'));
    set('modal-feedback','');set('save-option','Guardar cambios');
    openForm();
  }
  function setBusy(next){
    busy=next;
    for(const id of ['new-option','save-option','toggle-option','modal-close','modal-cancel','group-selector'])
      el(id).disabled=next;
  }
  async function mutate(method,payload,success){
    if(busy)return;
    setBusy(true);message('');set('modal-feedback','');
    try{
      const outcome=await request(method,payload);
      await refresh();
      el('options-modal').hidden=true;editing=null;
      message(outcome.auditLogged===false ? success+' ATENCIÓN: no se pudo registrar este cambio en Histórico.' : success,outcome.auditLogged===false);
    }catch(e){
      message('No se ha confirmado el cambio. '+errorText(e),true);
      set('modal-feedback',errorText(e));
    }finally{setBusy(false);}
  }
  function save(e){
    e.preventDefault();
    const value=el('form-value').value.trim();
    const label=el('form-label').value.trim();
    const order=Number(el('form-order').value);
    if(!value||!label||label.length>80||!Number.isInteger(order)||order<0||order>9999){
      set('modal-feedback','Comprueba valor, etiqueta y orden de aparición.');return;
    }
    const payload={action:editing?'edit':'create',group,value,label,order,
      ...(editing?{id:editing.id,version:editing.version}:{})};
    mutate(editing?'PATCH':'POST',payload,editing?'Opción actualizada.':'Nueva opción creada.');
  }
  function toggle(){
    if(!editing)return;
    const action=editing.active?'deactivate':'activate';
    const text=editing.active?'desactivar':'reactivar';
    if(!confirm('¿Confirmas '+text+' «'+editing.label+'»? Su valor histórico no se eliminará.'))return;
    mutate('PATCH',{action,group,id:editing.id,version:editing.version},
      'Estado actualizado sin eliminar datos.');
  }
  function bind(){
    el('group-selector').addEventListener('change',e=>{group=e.target.value;el('search-option').value='';render();});
    el('search-option').addEventListener('input',render);
    el('filter-status').addEventListener('change',render);
    el('new-option').addEventListener('click',openNew);
    el('options-form').addEventListener('submit',save);
    el('toggle-option').addEventListener('click',toggle);
    el('modal-close').addEventListener('click',closeForm);
    el('modal-cancel').addEventListener('click',closeForm);
    el('options-modal').addEventListener('click',e=>{if(e.target===el('options-modal'))closeForm();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!el('options-modal').hidden)closeForm();});
  }
  async function boot(){
    bind();
    try{
      await refresh();
      el('access-gate').hidden=true;el('workspace').hidden=false;
    }catch(e){
      if(e.message==='LOGIN_REQUIRED')gate('Inicia sesión','Accede primero a ViguerAPP con tu cuenta ADMIN.');
      else if(e.message==='NO_PERMISSION')gate('Acceso restringido','Esta gestión requiere un administrador activo.');
      else gate('No se ha podido cargar','No se han podido consultar las opciones. No se han modificado datos.');
    }
  }
  boot();
})();
