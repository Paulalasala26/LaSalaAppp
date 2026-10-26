/* ViguerAPP TEST — criterio único de búsqueda y guardado.
 * Solo interacción/presentación. No altera Firebase ni lógica de negocio.
 */
(function () {
  'use strict';
  const ids = new Set([
    'tareas-gestor-buscar','psearch','search-user','search-item',
    'qc-search','audit-text','search-option','reg-search',
    'qc-offline-search','search'
  ]);
  const yaConLupa = new Set(['control-buscar-partida','partidas-buscar-partida']);
  const css = 'display:inline-flex;align-items:center;justify-content:center;min-width:40px;height:40px;flex:0 0 40px;border-radius:7px;border:1px solid #1558a0;background:#1558a0;color:#fff;cursor:pointer;padding:0';
  const icono = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>';
  let ejecutando = false;
  function esBusqueda(input) {
    if (!input || input.tagName !== 'INPUT' || yaConLupa.has(input.id)) return false;
    if (input.id === 'qcd-partida') return false; // filtro remoto: lo ejecuta Consultar
    return ids.has(input.id) || !!input.closest('#resumen-quincena-fito') && input.type === 'search'
      || input.type === 'search';
  }
  function lanzarBusqueda(input) {
    if (!input || !input.isConnected) return;
    ejecutando = true;
    try {
      input.dispatchEvent(new Event('input', {bubbles:true}));
      if (input.isConnected) input.dispatchEvent(new Event('change', {bubbles:true}));
    } finally { ejecutando = false; }
  }
  function prepararBusqueda(input) {
    if (!esBusqueda(input) || input.dataset.vigBusquedaManual === '1') return;
    input.dataset.vigBusquedaManual = '1';
    input.setAttribute('autocomplete', 'off');
    const fila = document.createElement('span');
    fila.setAttribute('data-vig-buscador', '');
    fila.style.cssText = 'display:flex;align-items:center;gap:6px;width:100%;min-width:0;max-width:100%;box-sizing:border-box';
    if (input.id === 'search' && input.closest('.controls')) fila.style.gridColumn = '1 / -1';
    input.parentNode.insertBefore(fila, input);
    fila.appendChild(input);
    input.style.flex = '1 1 auto';
    input.style.minWidth = '0';
    input.style.width = '100%';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Buscar');
    btn.title = 'Buscar';
    btn.setAttribute('data-vig-lupa', '');
    btn.style.cssText = css;
    btn.innerHTML = icono;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      lanzarBusqueda(input);
    });
    fila.appendChild(btn);
  }
  // Suprime el filtrado en cada pulsación incluso si el módulo añade su propio
  // listener de input. Enter y la lupa realizan la búsqueda explícita.
  function interceptar(evento) {
    const input = evento.target;
    if (!input || input.dataset.vigBusquedaManual !== '1') return;
    if (evento.type === 'keydown') {
      if (evento.key !== 'Enter') return;
      evento.preventDefault();
      evento.stopImmediatePropagation();
      lanzarBusqueda(input);
    } else if (!ejecutando && evento.isTrusted) {
      evento.stopImmediatePropagation();
    }
  }
  ['input','change','keyup','keydown'].forEach(function (tipo) {
    document.addEventListener(tipo, interceptar, true);
  });
  function normalizarGuardar(btn) {
    if (!btn || btn.tagName !== 'BUTTON' || btn.hasAttribute('data-vig-lupa')) return;
    const texto = (btn.textContent || '').replace(/\s+/g, ' ').trim();
    const sinIconos = texto.replace(/^[^\p{L}]*/u, '').trim();
    const guardando = /^Guardar(?:\s|$)/i.test(sinIconos) && sinIconos !== 'Guardar';
    const crearUsuario = btn.id === 'save-user' && /^Crear usuario$/i.test(sinIconos);
    const accion = btn.getAttribute('onclick') || '';
    const guardarEspecifico = /^Aplicar$/i.test(sinIconos)
      && /aplicarEspecificoAPartidasSeleccionadas\s*\(/.test(accion);
    const aplicarRiego = /^Aplicar$/i.test(sinIconos) && /saveRiegoManual\s*\(/.test(accion);
    const crearRegistro = (/^(Crear|Crear y asignar)$/i.test(sinIconos))
      && (btn.id === 'nm-btn-crear' || /crearTarea\s*\(/.test(accion));
    if (!guardando && !crearUsuario && !guardarEspecifico && !aplicarRiego && !crearRegistro) return;
    if (crearUsuario || guardarEspecifico || aplicarRiego || crearRegistro) {
      const iconoExistente = btn.querySelector('i,svg');
      if (iconoExistente) {
        Array.from(btn.childNodes).forEach(n => {
          if (n.nodeType === 3 && n.textContent.trim()) n.textContent = ' Guardar';
        });
      } else btn.textContent = 'Guardar';
      return;
    }
    const walker = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT);
    const nodos = [];
    while (walker.nextNode()) nodos.push(walker.currentNode);
    const nodo = nodos.find(n => /\bGuardar\b/i.test(n.nodeValue));
    if (nodo) nodo.nodeValue = nodo.nodeValue.replace(/\bGuardar\b[\s\S]*/i, 'Guardar');
  }
  function examinar(raiz) {
    if (!raiz || (raiz.nodeType !== 1 && raiz.nodeType !== 9)) return;
    if (raiz.nodeType === 1) {
      if (raiz.matches('input')) prepararBusqueda(raiz);
      if (raiz.matches('button')) normalizarGuardar(raiz);
    }
    if (!raiz.querySelectorAll) return;
    raiz.querySelectorAll('input').forEach(prepararBusqueda);
    raiz.querySelectorAll('button').forEach(normalizarGuardar);
  }
  function iniciar() {
    examinar(document);
    let pendientes = new Set(), programado = false;
    const observador = new MutationObserver(function (cambios) {
      cambios.forEach(function (c) {
        c.addedNodes.forEach(function (n) {
          if (n.nodeType === 1) pendientes.add(n);
          if (n.nodeType === 3 && n.parentElement?.tagName === 'BUTTON') pendientes.add(n.parentElement);
        });
        if (c.type === 'characterData' && c.target.parentElement?.tagName === 'BUTTON')
          pendientes.add(c.target.parentElement);
      });
      if (programado || !pendientes.size) return;
      programado = true;
      queueMicrotask(function () {
        const a = pendientes;
        pendientes = new Set();
        programado = false;
        a.forEach(examinar);
      });
    });
    observador.observe(document.body, {childList:true,subtree:true,characterData:true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar, {once:true});
  else iniciar();
})();
