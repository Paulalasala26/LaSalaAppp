'use strict';

// Backoffice TEST: lectura de usuarios. Las mutaciones no están implementadas.
(function () {
  const FIREBASE_WEB_API_KEY = 'AIzaSyDdDdMg6M1jVIssvGYKsdRA-mRug31Yt_g';
  const AUTH_SESSION_KEY = 'lasala-firebase-auth-v1';
  const ROLE_LABELS = {
    ADMIN: 'Administrador', TECNICO: 'Técnico', REGANTE: 'Regante',
    PEON: 'Peón', CARGADOR: 'Cargador', SIN_ROL: 'Sin rol'
  };
  let users = [];

  function byId(id) { return document.getElementById(id); }
  function setText(id, value) { byId(id).textContent = value; }

  function showGate(title, description, offerLink) {
    setText('gate-title', title);
    setText('gate-description', description);
    byId('gate-link').hidden = !offerLink;
    byId('access-gate').hidden = false;
    byId('workspace').hidden = true;
  }

  async function refreshIdToken() {
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || 'null'); }
    catch (_) { stored = null; }
    if (!stored || !stored.refreshToken || !stored.user) {
      throw new Error('LOGIN_REQUIRED');
    }

    const response = await fetch(
      'https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(FIREBASE_WEB_API_KEY), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token', refresh_token: stored.refreshToken
        }).toString(),
        cache: 'no-store'
      }
    );
    if (!response.ok) throw new Error('LOGIN_REQUIRED');
    const credentials = await response.json();
    if (!credentials.id_token || !credentials.refresh_token) throw new Error('LOGIN_REQUIRED');
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
      user: stored.user, refreshToken: credentials.refresh_token
    }));
    return credentials.id_token;
  }

  async function loadUsers() {
    const token = await refreshIdToken();
    const response = await fetch('/api/admin-users', {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token },
      cache: 'no-store'
    });
    if (response.status === 403) throw new Error('NO_PERMISSION');
    if (response.status === 401) throw new Error('LOGIN_REQUIRED');
    if (!response.ok) throw new Error('SERVICE_ERROR');
    const payload = await response.json();
    if (!Array.isArray(payload.users)) throw new Error('SERVICE_ERROR');
    users = payload.users.filter(u => u && typeof u.user === 'string');
    setText('session-user', payload.currentUser || 'Administrador');
    setText('total-users', users.length);
    setText('configured-users', users.filter(u => u.accessConfigured).length);
    setText('different-roles', new Set(users.map(u => u.role)).size);

    const filter = byId('filter-role');
    const roles = Array.from(new Set(users.map(u => u.role))).sort();
    for (const role of roles) {
      const option = document.createElement('option');
      option.value = role;
      option.textContent = ROLE_LABELS[role] || role;
      filter.appendChild(option);
    }

    renderUsers();
    byId('access-gate').hidden = true;
    byId('workspace').hidden = false;
  }

  function make(tag, className, value) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (value != null) e.textContent = String(value);
    return e;
  }

  function renderUsers() {
    const search = byId('search-user').value.trim().toLocaleLowerCase('es');
    const role = byId('filter-role').value;
    const visible = users.filter(u =>
      (!role || u.role === role) &&
      (!search || u.user.toLocaleLowerCase('es').includes(search))
    );
    const tbody = byId('users-body');
    tbody.replaceChildren();

    if (!visible.length) {
      const row = make('tr');
      const cell = make('td', 'empty-cell', users.length ? 'No hay usuarios con esos filtros.' : 'No hay cuentas configuradas.');
      cell.colSpan = 4;
      row.appendChild(cell);
      tbody.appendChild(row);
    }

    for (const u of visible) {
      const tr = make('tr');
      const name = make('td');
      const initials = make('span', 'user-avatar', u.user.slice(0, 2).toUpperCase());
      const label = make('span', 'user-name', u.user);
      name.append(initials, label);
      tr.appendChild(name);

      const roleCell = make('td');
      roleCell.appendChild(make('span', 'role-pill' + (u.role === 'ADMIN' ? ' admin' : ''), ROLE_LABELS[u.role] || u.role || 'Sin rol'));
      tr.appendChild(roleCell);

      tr.appendChild(make('td', u.accessConfigured ? 'access-ok' : 'access-unset', u.accessConfigured ? 'Configurado' : 'Pendiente'));

      const actions = make('td');
      const manage = make('button', 'action-button', 'Gestionar');
      manage.type = 'button';
      manage.setAttribute('aria-label', 'Ver administración de ' + u.user);
      manage.addEventListener('click', () => showUserModal(u));
      actions.appendChild(manage);
      tr.appendChild(actions);
      tbody.appendChild(tr);
    }
    setText('result-count', String(visible.length) + ' de ' + String(users.length) + ' usuarios');
    setText('table-subtitle', 'Consulta de cuentas existentes en TEST');
  }

  function showUserModal(u) {
    const isNew = !u;
    setText('modal-title', isNew ? 'Nuevo usuario' : 'Gestionar usuario');
    setText('modal-desc', isNew
      ? 'Vista previa del formulario de alta. Aún no es posible crear cuentas.'
      : 'Datos de la cuenta. Las modificaciones todavía están deshabilitadas.');
    byId('form-user').value = u ? u.user : '';
    byId('form-user').disabled = !!u;
    byId('form-name').value = '';
    byId('form-role').value = u && ROLE_LABELS[u.role] ? u.role : 'TECNICO';
    byId('modal').hidden = false;
    byId('modal-close').focus();
  }

  function closeModal() {
    byId('modal').hidden = true;
    byId('new-user').focus();
  }

  function bindEvents() {
    byId('search-user').addEventListener('input', renderUsers);
    byId('filter-role').addEventListener('change', renderUsers);
    byId('new-user').addEventListener('click', () => showUserModal(null));
    byId('modal-close').addEventListener('click', closeModal);
    byId('modal-cancel').addEventListener('click', closeModal);
    byId('user-form').addEventListener('submit', e => e.preventDefault());
    byId('modal').addEventListener('click', e => {
      if (e.target === byId('modal')) closeModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !byId('modal').hidden) closeModal();
    });
  }

  async function boot() {
    bindEvents();
    try {
      await loadUsers();
    } catch (error) {
      if (error.message === 'LOGIN_REQUIRED') {
        showGate('Inicia sesión', 'Accede primero a La Sala con tu cuenta de administrador y abre de nuevo el Backoffice.', true);
      } else if (error.message === 'NO_PERMISSION') {
        showGate('Acceso restringido', 'Este panel solo está disponible para cuentas con rol ADMIN.', true);
      } else {
        showGate('No se ha podido cargar', 'No se pudo consultar Firebase TEST. No se ha modificado ningún dato.', true);
      }
    }
  }

  boot();
})();
