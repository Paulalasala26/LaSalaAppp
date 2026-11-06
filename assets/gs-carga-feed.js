'use strict';
/* Consulta de solo lectura del snapshot diario de GS desde QC Carga normal. */
(function () {
  const API = '/api/admin-catalog?view=';
  let feedType = 'carga';
  let backdrop = null;
  let snapshot = null;
  let visibleLimit = 40;

  const localToday = () => {
    const now = new Date();
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')].join('-');
  };
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text != null) element.textContent = String(text);
    if (className) element.className = className;
    return element;
  };

  function ensureStyles() {
    if (document.getElementById('gscf-styles')) return;
    const style = node('style');
    style.id = 'gscf-styles';
    style.textContent = `
      .gscf-shade{position:fixed;inset:0;z-index:100500;background:rgba(18,26,20,.56);display:flex;align-items:center;justify-content:center;padding:14px}
      .gscf-dialog{width:min(760px,100%);max-height:min(90vh,900px);overflow:auto;background:#fff;border-radius:14px;box-shadow:0 16px 50px rgba(0,0,0,.24);padding:18px;color:#1a1e18}
      .gscf-header{display:flex;align-items:center;justify-content:space-between;gap:12px}.gscf-header h2{font-size:19px;margin:0;font-weight:800}
      .gscf-close,.gscf-load,.gscf-more{border:0;border-radius:8px;padding:9px 13px;font-weight:700;cursor:pointer}.gscf-close{background:#edf1eb;color:#253428}.gscf-load{background:#1558a0;color:#fff}.gscf-load:disabled{opacity:.65;cursor:wait}
      .gscf-note,.gscf-footer{font-size:12px;color:#637064}.gscf-note{margin:10px 0 14px}.gscf-footer{margin-top:14px;border-top:1px solid #e4e8e2;padding-top:10px}
      .gscf-form{display:flex;align-items:end;gap:9px;flex-wrap:wrap}.gscf-form label{display:grid;gap:5px;font-size:12px;font-weight:700}.gscf-form input,.gscf-search{border:1px solid #cbd4c9;border-radius:7px;padding:9px 10px;font:inherit}
      .gscf-status{font-size:12px;font-weight:700;margin:14px 0 10px}.gscf-search{box-sizing:border-box;width:100%;margin-bottom:9px}
      .gscf-list{display:grid;gap:8px}.gscf-card{border:1px solid #e0e4dc;border-radius:10px;padding:11px 12px}.gscf-card-head{display:flex;justify-content:space-between;gap:10px;font-size:13px}.gscf-card-head span{color:#1558a0;font-weight:800;white-space:nowrap}
      .gscf-card-details{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:5px 12px;margin-top:8px}.gscf-detail{display:grid;gap:2px;font-size:11px;min-width:0}.gscf-detail span{color:#637064}.gscf-detail strong{font-weight:650;overflow-wrap:anywhere}.gscf-empty{font-size:12px;color:#637064}.gscf-more{justify-self:center;background:#e8f0fb;color:#1558a0;margin-top:10px}
      @media(max-width:520px){.gscf-shade{padding:6px;align-items:flex-end}.gscf-dialog{max-height:92vh;border-radius:14px 14px 8px 8px;padding:14px}.gscf-header h2{font-size:17px}.gscf-form>*{flex:1}.gscf-form button{min-height:40px}}
    `;
    document.head.appendChild(style);
  }

  function close() {
    backdrop?.remove();
    backdrop = null;
    snapshot = null;
  }

  function open(type) {
    feedType = type === 'tunel' ? 'tunel' : 'carga';
    const allowedRoles = feedType === 'tunel' ? ['ADMIN', 'TECNICO'] : ['ADMIN', 'TECNICO', 'CARGADOR'];
    if (!allowedRoles.includes(currentUserRole)) {
      if (typeof showToast === 'function') showToast('No tienes permiso para consultar el parte GS.');
      return;
    }
    close();
    ensureStyles();
    const shade = node('div', null, 'gscf-shade');
    shade.setAttribute('role', 'presentation');
    const dialog = node('section', null, 'gscf-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'gscf-title');

    const header = node('header', null, 'gscf-header');
    const title = node('h2', feedType === 'tunel' ? 'Datos GS · QC Túnel' : 'Datos GS · QC Carga normal');
    title.id = 'gscf-title';
    const closeButton = node('button', 'Cerrar', 'gscf-close');
    closeButton.type = 'button';
    closeButton.addEventListener('click', close);
    header.append(title, closeButton);

    const note = node('p', 'Consulta de solo lectura. No crea inspecciones ni modifica los controles QC.', 'gscf-note');
    const form = node('form', null, 'gscf-form');
    const label = node('label', 'Fecha del parte GS');
    const date = node('input');
    date.type = 'date';
    date.value = localToday();
    date.required = true;
    label.appendChild(date);
    const load = node('button', 'Consultar', 'gscf-load');
    load.type = 'submit';
    form.append(label, load);
    const status = node('div', 'Selecciona la fecha del parte.', 'gscf-status');
    status.setAttribute('role', 'status');
    const results = node('div', null, 'gscf-results');
    const footer = node('footer', 'Origen: GS · Base sala12 · Sincronización TEST', 'gscf-footer');
    dialog.append(header, note, form, status, results, footer);
    shade.appendChild(dialog);
    shade.addEventListener('click', event => { if (event.target === shade) close(); });
    document.addEventListener('keydown', onEscape, { once: true });
    function onEscape(event) { if (event.key === 'Escape') close(); }
    backdrop = shade;
    document.body.appendChild(shade);
    date.focus();

    form.addEventListener('submit', async event => {
      event.preventDefault();
      await query(date.value, load, status, results);
    });
  }

  async function query(fecha, button, status, results) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      status.textContent = 'Selecciona una fecha válida.';
      return;
    }
    button.disabled = true;
    button.textContent = 'Consultando…';
    status.textContent = 'Leyendo el parte de GS…';
    results.replaceChildren();
    snapshot = null;
    try {
      await ensureFirebaseIdTokenFresh();
      if (!firebaseIdToken) throw new Error('LOGIN_REQUIRED');
      const response = await fetch(API + 'gs-' + feedType + '&fecha=' + encodeURIComponent(fecha), {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + firebaseIdToken },
        cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 404) throw new Error('GS_SNAPSHOT_NOT_FOUND');
      if (response.status === 401) throw new Error('LOGIN_REQUIRED');
      if (response.status === 403) throw new Error('FORBIDDEN');
      if (!response.ok) throw new Error(data.error || 'SERVICE_UNAVAILABLE');
      const expectedModule = feedType === 'tunel' ? 'qc_tunel' : 'qc_carga';
      if (!data.metadata || data.metadata.fecha !== fecha || data.metadata.module !== expectedModule ||
          !data.lineas || typeof data.lineas !== 'object') throw new Error('INVALID_RESPONSE');
      snapshot = data;
      visibleLimit = 40;
      renderResults(data, status, results);
    } catch (error) {
      const messages = {
        GS_SNAPSHOT_NOT_FOUND: 'No hay un parte GS sincronizado para esa fecha.',
        LOGIN_REQUIRED: 'La sesión ha caducado. Vuelve a iniciar sesión e inténtalo de nuevo.',
        FORBIDDEN: 'Tu usuario no tiene permiso para consultar estos datos.',
        INVALID_RESPONSE: 'La respuesta del servidor no tiene el formato esperado.',
        INVALID_GS_SNAPSHOT: 'El snapshot de Túnel existe, pero tiene un formato de datos no reconocido.',
        SERVICE_UNAVAILABLE: 'No se pudo leer el snapshot de Túnel desde Firebase TEST.'
      };
      status.textContent = messages[error.message] || 'No se pudo consultar GS. Inténtalo de nuevo.';
    } finally {
      button.disabled = false;
      button.textContent = 'Consultar';
    }
  }

  function renderResults(data, status, results, filterText) {
    const lines = Object.values(data.lineas).sort((a, b) => feedType === 'tunel'
      ? String(a.gs_partida || '').localeCompare(String(b.gs_partida || ''), 'es', {numeric:true})
      : String(a.hora || '').localeCompare(String(b.hora || '')) ||
        String(a.id_carga || '').localeCompare(String(b.id_carga || '')) ||
        String(a.id_linea_carga || '').localeCompare(String(b.id_linea_carga || ''))
    );
    const queryText = String(filterText || '').trim().toLocaleLowerCase('es');
    const filtered = queryText ? lines.filter(line => {
      const fields = feedType === 'tunel'
        ? [line.gs_injerto_id, line.gs_partida, line.cliente, line.PAR_NMSM, line.tipo_siembra, line.invernaderos_gs]
        : [line.id_carga, line.partida, line.cliente_carga, line.variedad, line.invernadero, line.ubicacion_pdf];
      return fields.some(value => String(value || '').toLocaleLowerCase('es').includes(queryText));
    }) : lines;
    const trays = lines.reduce((total, line) => total + (Number(line.bandejas) || 0), 0);
    status.textContent = feedType === 'tunel'
      ? `${data.metadata.lineCount} partidas · ${trays.toLocaleString('es-ES')} bandejas`
      : `${data.metadata.lineCount} líneas · ${data.metadata.loadCount} cargas · ${trays.toLocaleString('es-ES')} bandejas`;
    results.replaceChildren();

    const search = node('input', null, 'gscf-search');
    search.type = 'search';
    search.placeholder = 'Buscar carga, partida, cliente o invernadero';
    search.setAttribute('aria-label', 'Buscar en el parte GS');
    search.value = queryText;
    const list = node('div', null, 'gscf-list');
    const current = filtered.slice(0, visibleLimit);
    for (const line of current) {
      const card = node('article', null, 'gscf-card');
      const cardHead = node('div', null, 'gscf-card-head');
      const partida = feedType === 'tunel' ? line.gs_partida : line.partida;
      cardHead.append(node('strong', `Partida ${partida || '—'}`), node('span', `${line.bandejas ?? '—'} bandejas`));
      const details = node('div', null, 'gscf-card-details');
      const values = feedType === 'tunel' ? [
        ['ID injerto GS', line.gs_injerto_id], ['Cliente', line.cliente],
        ['Injerto', line.PAR_NMSM], ['Tipo de siembra', line.tipo_siembra],
        ['Código de siembra', line.id_tipo_siembra], ['Plantas', line.plantas],
        ['Fecha de entrada', line.fecha_entrada], ['Fecha prevista', line.fecha_prevista],
        ['Salida real', line.fecha_salida_real], ['Invernaderos GS', line.invernaderos_gs],
        ['Estado GS', line.estado_gs], ['Observaciones', line.observaciones]
      ] : [
        ['Carga', line.id_carga], ['Cliente', line.cliente_carga || line.codigo_cliente_carga],
        ['Variedad', line.variedad], ['Hora', line.hora],
        ['Invernadero', line.invernadero ? `${line.id_invernadero || ''} · ${line.invernadero}` : line.id_invernadero],
        ['Ubicación GS', line.ubicacion_pdf], ['Carros / notas', (line.carros || []).map(c => [c.codigo, c.nota].filter(Boolean).join(' · ')).filter(Boolean).join(', ') || line.carros_raw]
      ];
      for (const [label, value] of values) {
        if (value == null || value === '') continue;
        const row = node('div', null, 'gscf-detail');
        row.append(node('span', label), node('strong', value));
        details.appendChild(row);
      }
      card.append(cardHead, details);
      list.appendChild(card);
    }
    if (!filtered.length) list.appendChild(node('p', 'No hay líneas que coincidan con la búsqueda.', 'gscf-empty'));
    search.addEventListener('input', () => {
      const value = search.value;
      const cursor = search.selectionStart;
      renderResults(data, status, results, value);
      const replacement = results.querySelector('.gscf-search');
      replacement?.focus();
      if (replacement && cursor != null) replacement.setSelectionRange(cursor, cursor);
    });
    results.append(search, list);
    if (visibleLimit < filtered.length) {
      const more = node('button', 'Mostrar más líneas', 'gscf-more');
      more.type = 'button';
      more.addEventListener('click', () => {
        visibleLimit += 40;
        renderResults(data, status, results, search.value);
      });
      results.appendChild(more);
    }
  }

  window.abrirGSCargaFeed = () => open('carga');
  window.abrirGSTunelFeed = () => open('tunel');
})();
