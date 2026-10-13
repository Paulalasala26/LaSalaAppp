'use strict';

// Backoffice TEST: altas, roles, desactivación y cambio administrativo
// de contraseñas. Todas las mutaciones se autorizan de nuevo EN SERVIDOR.
(function () {
  const FIREBASE_WEB_API_KEY = 'AIzaSyDdDdMg6M1jVIssvGYKsdRA-mRug31Yt_g';
  const AUTH_SESSION_KEY = 'lasala-firebase-auth-v1';
  const ROLE_LABELS = {
    ADMIN:'Administrador',TECNICO:'Técnico',REGANTE:'Regante',
    PEON:'Peón',CARGADOR:'Cargador',SIN_ROL:'Sin rol'
  };
  const ERRORS = {
    LOGIN_REQUIRED:'La sesión ha caducado. Inicia sesión en la aplicación.',
    NO_PERMISSION:'Se necesita el rol ADMIN.',
    SERVICE_ERROR:'No se ha podido comunicar con el servidor. No presupongas que los cambios se han guardado: actualiza el listado antes de reintentar.',
    SERVICE_UNAVAILABLE:'Firebase no está disponible o ha superado su cuota. Comprueba el listado antes de repetir la operación.',
    FORBIDDEN:'No tienes autorización para esta operación.',
    UNAUTHORIZED:'Tu sesión no es válida. Vuelve a iniciar sesión.',
    USER_EXISTS:'El usuario ya existe.',
    USER_NOT_FOUND:'El usuario ya no existe o no tiene contraseña configurada.',
    WEAK_PASSWORD:'La contraseña debe tener entre 12 y 128 caracteres, con letras y números.',
    INVALID_USER:'Utiliza entre 3 y 40 caracteres: letras mayúsculas, números, punto, guion o guion bajo.',
    INVALID_ROLE:'Selecciona un rol válido.',
    LAST_ADMIN:'No puedes dejar la aplicación sin administradores activos.',
    CANNOT_DEACTIVATE_SELF:'No puedes desactivar tu propia cuenta.',
    CANNOT_REMOVE_OWN_ADMIN:'No puedes quitarte tu propio rol de administrador.',
    ROLE_REQUIRED:'Asigna primero un rol para activar la cuenta.',
    CONCURRENT_MODIFICATION:'Otro administrador ha modificado estos datos. Vuelve a cargar el listado.',
    INVALID_BODY:'Formulario no válido.'
  };
  let users = [];
  let currentUser = null;
  let currentEditUser = null;
  let busy = false;

  function byId(id) { return document.getElementById(id); }
  function setText(id, value) { byId(id).textContent = String(value); }
  function make(tag, className, value) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (value != null) e.textContent = String(value);
    return e;
  }
  function feedback(text, error) {
    const box = byId('operation-feedback');
    box.hidden = !text;
    box.textContent = text || '';
    box.className = error ? 'operation-feedback error' : 'operation-feedback ok';
  }
  function showGate(title, description, offerLink) {
    setText('gate-title', title);
    setText('gate-description', description);
    byId('gate-link').hidden = !offerLink;
    byId('access-gate').hidden = false;
    byId('workspace').hidden = true;
  }
  async function refreshIdToken() {
    let stored=null;
    try { stored=JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || 'null'); }
    catch (_) {}
    if (!stored || !stored.refreshToken || !stored.user) throw new Error('LOGIN_REQUIRED');
    const response=await fetch(
      'https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(FIREBASE_WEB_API_KEY),{
        method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({
          grant_type:'refresh_token',refresh_token:stored.refreshToken
        }).toString(),cache:'no-store'
      }
    );
    if (!response.ok) throw new Error('LOGIN_REQUIRED');
    const tokens=await response.json();
    if (!tokens.id_token || !tokens.refresh_token) throw new Error('LOGIN_REQUIRED');
    localStorage.setItem(AUTH_SESSION_KEY,JSON.stringify({
      user:stored.user,refreshToken:tokens.refresh_token
    }));
    return tokens.id_token;
  }
  async function callAdmin(method, payload) {
    const idToken=await refreshIdToken();
    const response=await fetch('/api/admin-users',{
      method,headers:{
        Authorization:'Bearer '+idToken,
        ...(payload ? {'Content-Type':'application/json'} : {})
      },
      ...(payload ? {body:JSON.stringify(payload)} : {}),
      cache:'no-store'
    });
    if (response.status===401) throw new Error('LOGIN_REQUIRED');
    if (response.status===403) throw new Error('NO_PERMISSION');
    let result={};
    try { result=await response.json(); } catch (_) {}
    if (!response.ok) throw new Error(result.error || 'SERVICE_ERROR');
    return result;
  }
  async function loadUsers() {
    const payload=await callAdmin('GET');
    if (!Array.isArray(payload.users)) throw new Error('SERVICE_ERROR');
    users=payload.users.filter(u=>u && typeof u.user==='string');
    currentUser=payload.currentUser;
    setText('session-user',currentUser || 'Administrador');
    setText('total-users',users.length);
    setText('configured-users',users.filter(u=>u.accessConfigured).length);
    setText('different-roles',new Set(users.map(u=>u.role)).size);
    setText('active-users',users.filter(u=>u.active).length);
    const filter=byId('filter-role');
    const selected=filter.value;
    filter.replaceChildren(new Option('Todos los roles',''));
    [...new Set(users.map(u=>u.role))].sort().forEach(role=>{
      filter.appendChild(new Option(ROLE_LABELS[role] || role,role));
    });
    filter.value=[...filter.options].some(o=>o.value===selected) ? selected : '';
    renderUsers();
    byId('access-gate').hidden=true;
    byId('workspace').hidden=false;
  }
  function renderUsers() {
    const search=byId('search-user').value.trim().toLocaleLowerCase('es');
    const role=byId('filter-role').value;
    const visible=users.filter(u=>(!role || u.role===role) &&
      (!search || u.user.toLocaleLowerCase('es').includes(search)));
    const tbody=byId('users-body');
    tbody.replaceChildren();
    if (!visible.length) {
      const tr=make('tr'),cell=make('td','empty-cell',
        users.length ? 'No hay usuarios con esos filtros.' : 'No hay cuentas configuradas.');
      cell.colSpan=4;tr.appendChild(cell);tbody.appendChild(tr);
    }
    for(const u of visible) {
      const tr=make('tr'),name=make('td');
      name.append(make('span','user-avatar',u.user.slice(0,2).toUpperCase()),
        make('span','user-name',u.user));
      tr.appendChild(name);
      const roleCell=make('td');
      roleCell.appendChild(make('span','role-pill'+(u.role==='ADMIN'?' admin':''),
        ROLE_LABELS[u.role] || u.role || 'Sin rol'));
      tr.appendChild(roleCell);
      const state=u.active ? 'Activo' : u.accessConfigured ? 'Desactivado' : 'Sin contraseña';
      tr.appendChild(make('td',u.active ? 'access-ok' : 'access-unset',state));
      const actions=make('td');
      const manage=make('button','action-button','Gestionar');
      manage.type='button';manage.setAttribute('aria-label','Gestionar '+u.user);
      manage.addEventListener('click',()=>showUserModal(u));
      actions.appendChild(manage);tr.appendChild(actions);tbody.appendChild(tr);
    }
    setText('result-count',visible.length+' de '+users.length+' usuarios');
    setText('table-subtitle','Administración segura de cuentas · Firebase TEST');
  }
  function showUserModal(u) {
    if (busy) return;
    currentEditUser=u || null;
    const isNew=!u;
    setText('modal-title',isNew ? 'Nuevo usuario' : 'Gestionar '+u.user);
    setText('modal-desc',isNew ?
      'Crea una cuenta nueva con acceso a APP R TEST.' :
      'Modifica el rol, restablece la contraseña o desactiva el acceso.');
    byId('form-user').value=u ? u.user : '';
    byId('form-user').readOnly=!isNew;
    byId('form-role').value=u && ROLE_LABELS[u.role] ? u.role : 'TECNICO';
    byId('form-password').value='';
    byId('form-confirm').value='';
    byId('password-show').checked=false;
    setPasswordVisibility(false);
    byId('password-description').textContent=isNew ?
      'Obligatoria para crear la cuenta: mínimo 12 caracteres, letras y números.' :
      'Opcional. Solo se modifica la contraseña si pulsas «Restablecer contraseña».';
    byId('reset-password').hidden=isNew;
    byId('status-user').hidden=isNew || !u.accessConfigured;
    byId('status-user').textContent=u && u.active ? 'Desactivar usuario' : 'Reactivar usuario';
    byId('status-user').className=u && u.active ? 'button danger' : 'button ghost';
    byId('save-user').textContent=isNew ? 'Crear usuario' : 'Guardar rol';
    byId('modal-feedback').textContent='';
    byId('modal').hidden=false;
    byId('form-user').focus();
  }
  function closeModal() {
    if (busy) return;
    byId('modal').hidden=true;
    byId('form-password').value='';
    byId('form-confirm').value='';
    currentEditUser=null;
    byId('new-user').focus();
  }
  function setPasswordVisibility(show) {
    byId('form-password').type=show ? 'text' : 'password';
    byId('form-confirm').type=show ? 'text' : 'password';
  }
  function validatePasswordForm() {
    const password=byId('form-password').value;
    if (password.length<12 || password.length>128 ||
        !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      throw new Error('WEAK_PASSWORD');
    }
    if (password!==byId('form-confirm').value) {
      throw new Error('Las contraseñas no coinciden.');
    }
    return password;
  }
  function setBusy(state) {
    busy=state;
    ['save-user','reset-password','status-user','modal-cancel','modal-close',
      'new-user','form-role','form-user','form-password','form-confirm'
    ].forEach(id=>{const el=byId(id);if(el) el.disabled=state;});
  }
  async function mutation(payload, method, success) {
    if (busy) return;
    setBusy(true);
    setText('modal-feedback','Guardando…');
    try {
      await callAdmin(method,payload);
      byId('modal').hidden=true;
      byId('form-password').value='';
      byId('form-confirm').value='';
      currentEditUser=null;
      await loadUsers();
      feedback(success,false);
    } catch (e) {
      const msg=ERRORS[e.message] || e.message || ERRORS.SERVICE_ERROR;
      setText('modal-feedback',msg);
      feedback('',false);
      if (e.message==='LOGIN_REQUIRED' || e.message==='NO_PERMISSION')
        showGate('Acceso restringido',msg,true);
    } finally {
      setBusy(false);
    }
  }
  async function saveUser(event) {
    event.preventDefault();
    if (busy) return;
    const role=byId('form-role').value;
    if (!currentEditUser) {
      try {
        const user=byId('form-user').value.trim().toUpperCase();
        if (!/^[A-Z0-9][A-Z0-9._-]{2,39}$/.test(user)) throw new Error('INVALID_USER');
        const password=validatePasswordForm();
        await mutation({user,role,password},'POST','Usuario '+user+' creado correctamente.');
      } catch(e) { setText('modal-feedback',ERRORS[e.message]||e.message); }
    } else {
      const user=currentEditUser.user;
      if (role===currentEditUser.role) {
        setText('modal-feedback','No has modificado el rol.');
        return;
      }
      await mutation({action:'changeRole',user,role},'PATCH','Rol actualizado para '+user+'.');
    }
  }
  async function resetPassword() {
    if (!currentEditUser || busy) return;
    let password;
    try { password=validatePasswordForm(); }
    catch(e){setText('modal-feedback',ERRORS[e.message]||e.message);return;}
    const user=currentEditUser.user;
    if(!window.confirm('¿Restablecer la contraseña de '+user+'?')) return;
    await mutation({action:'resetPassword',user,password},'PATCH',
      'Contraseña restablecida para '+user+'.');
  }
  async function toggleStatus() {
    if (!currentEditUser || busy) return;
    const u=currentEditUser;
    const action=u.active ? 'deactivate' : 'activate';
    const verb=u.active ? 'desactivar' : 'reactivar';
    if(!window.confirm('¿Quieres '+verb+' el acceso de '+u.user+'?')) return;
    await mutation({action,user:u.user},'PATCH',
      'Cuenta '+u.user+(u.active?' desactivada.':' reactivada.'));
  }
  function generatePassword() {
    if (busy || !window.crypto || !crypto.getRandomValues) return;
    const characters='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%&*-';
    const bytes=new Uint32Array(20);
    crypto.getRandomValues(bytes);
    const password=Array.from(bytes,n=>characters[n%characters.length]).join('');
    byId('form-password').value=password;
    byId('form-confirm').value=password;
    setPasswordVisibility(true);byId('password-show').checked=true;
    setText('modal-feedback','Contraseña generada. Guárdala de forma segura antes de crear o restablecer la cuenta.');
  }
  function bindEvents() {
    byId('search-user').addEventListener('input',renderUsers);
    byId('filter-role').addEventListener('change',renderUsers);
    byId('new-user').addEventListener('click',()=>showUserModal(null));
    byId('modal-close').addEventListener('click',closeModal);
    byId('modal-cancel').addEventListener('click',closeModal);
    byId('user-form').addEventListener('submit',saveUser);
    byId('reset-password').addEventListener('click',resetPassword);
    byId('status-user').addEventListener('click',toggleStatus);
    byId('password-generate').addEventListener('click',generatePassword);
    byId('password-show').addEventListener('change',e=>setPasswordVisibility(e.target.checked));
    byId('modal').addEventListener('click',e=>{
      if(e.target===byId('modal')) closeModal();
    });
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape' && !byId('modal').hidden) closeModal();
    });
  }
  async function boot() {
    bindEvents();
    try {await loadUsers();}
    catch(e){
      if(e.message==='LOGIN_REQUIRED'){
        showGate('Inicia sesión',
          'Accede primero a La Sala con tu cuenta ADMIN y abre de nuevo el Backoffice.',true);
      } else if(e.message==='NO_PERMISSION'){
        showGate('Acceso restringido','Este panel solo está disponible para administradores activos.',true);
      } else {
        showGate('No se ha podido cargar',
          'No se pudo consultar Firebase TEST. No se han modificado datos.',true);
      }
    }
  }
  boot();
})();
