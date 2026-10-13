/* APP R · Firebase Diagnostics TEST
 * Activación explícita: ?fbdiag=1. No guarda credenciales ni contenido de datos.
 * Solo instrumenta transferencias hacia Realtime Database de La Sala TEST.
 * No modifica las peticiones ni el comportamiento de Firebase fuera de diagnóstico.
 */
(function () {
  'use strict';

  var HOST = 'la-sala-app-test-default-rtdb.europe-west1.firebasedatabase.app';
  var enabled = false;
  try {
    var here = new URL(location.href);
    var approved = location.hostname === 'la-sala-app-test.vercel.app' ||
      /^la-sala-app-test-[a-z0-9-]+\.vercel\.app$/i.test(location.hostname) ||
      location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    enabled = approved && here.searchParams.get('fbdiag') === '1';
  } catch (_) {}
  if (!enabled || typeof window.fetch !== 'function') return;

  var originalFetch = window.fetch.bind(window);
  var originalEventSource = window.EventSource;
  var encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  var requests = [];
  var MAX_ROWS = 1500;
  var started = Date.now();
  var panel, updateHandle;
  var autoNumber = 0;

  function bytesOf(value) {
    try {
      if (encoder) return encoder.encode(value).byteLength;
      return new Blob([value]).size;
    } catch (_) { return null; }
  }
  function safeUrl(input) {
    try {
      var u = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (u.hostname !== HOST || u.protocol !== 'https:') return null;
      var top = decodeURIComponent(u.pathname.split('/')[1] || '').replace(/\.json$/, '');
      return { node: top.slice(0, 110), path: (u.pathname.split('/').length > 2 ? top + '/[registro]' : top), silent: u.searchParams.get('print') === 'silent' };
    } catch (_) { return null; }
  }
  function category(n) {
    if (/control-fotos/i.test(n)) return 'Control · Fotos';
    if (/control-pdfs/i.test(n)) return 'Control · PDF';
    if (/control-items-v2/i.test(n)) return 'Control · Registros v2';
    if (/control-items-v1|control-checks/i.test(n)) return 'Control · Histórico v1';
    if (/riego-sync/i.test(n)) return 'Riego · Eventos';
    if (/riego/i.test(n)) return 'Riego';
    if (/fito/i.test(n)) return 'Fitosanitarios';
    if (/especificos/i.test(n)) return 'Específicos';
    if (/tareas/i.test(n)) return 'Tareas';
    if (/partidas/i.test(n)) return 'Partidas';
    if (/roles|users/i.test(n)) return 'Acceso';
    return 'Otros';
  }
  function scheduleUpdate() {
    if (!panel || panel.hidden || updateHandle) return;
    updateHandle = setTimeout(function () { updateHandle = null; render(); }, 350);
  }
  function record(row) {
    requests.push(row);
    if (requests.length > MAX_ROWS) requests.shift();
    scheduleUpdate();
  }
  function readableSize(n) {
    if (n == null) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(2) + ' MB';
  }
  function payloadBytes(row, n) {
    row.bytes = n;
    row.measured = true;
    row.finished = Date.now();
    scheduleUpdate();
  }

  window.fetch = async function (input, init) {
    var info = safeUrl(input);
    if (!info) return originalFetch(input, init);
    var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    var startedAt = Date.now();
    var bodySize = init && typeof init.body === 'string' ? bytesOf(init.body) : null;
    var row = {
      id: ++autoNumber, node: info.node, category: category(info.node),
      path: info.path, method: method, status: null, ms: null,
      bytes: null, measured: false, headerBytes: null, sentBytes: bodySize,
      potentialEchoBytes: method === 'PUT' && !info.silent ? bodySize : null,
      time: new Date().toISOString(), finished: null
    };
    record(row);
    var response;
    try {
      response = await originalFetch(input, init);
      row.status = response.status;
      row.ms = Date.now() - startedAt;
      var headerLength = response.headers.get('content-length');
      if (headerLength && /^\d+$/.test(headerLength)) row.headerBytes = Number(headerLength);
      if (!response.ok) { row.potentialEchoBytes = null; scheduleUpdate(); }
    } catch (e) {
      row.status = 'NETWORK_ERROR';
      row.ms = Date.now() - startedAt;
      row.potentialEchoBytes = null;
      scheduleUpdate();
      throw e;
    }

    // Measure parsed payload without cloning or rereading the response.
    // This wrapper is TEST-only and does not store response contents.
    var nativeText = response.text.bind(response);
    var nativeJson = response.json.bind(response);
    var nativeArrayBuffer = response.arrayBuffer.bind(response);
    response.json = async function () {
      // On diagnostic runs use the textual decoder to measure UTF-8 body exactly.
      // JSON.parse receives the same textual data and throws on malformed JSON.
      try {
        var raw = await nativeText();
        payloadBytes(row, bytesOf(raw));
        return JSON.parse(raw);
      } catch (e) {
        if (!row.measured) { row.finished = Date.now(); scheduleUpdate(); }
        throw e;
      }
    };
    response.text = async function () {
      var raw = await nativeText();
      payloadBytes(row, bytesOf(raw));
      return raw;
    };
    response.arrayBuffer = async function () {
      var buffer = await nativeArrayBuffer();
      payloadBytes(row, buffer.byteLength);
      return buffer;
    };
    return response;
  };

  // Record EventSource connections and errors; never copy event bodies.
  if (typeof originalEventSource === 'function') {
    function InstrumentedEventSource(url, config) {
      var info = safeUrl(url);
      var obj = new originalEventSource(url, config);
      if (!info) return obj;
      var row = {
        id: ++autoNumber, node: info.node, category: category(info.node),
        path: info.path, method: 'STREAM', status: 'CONNECTING',
        ms: null, bytes: null, measured: false, headerBytes: null,
        sentBytes: null, potentialEchoBytes: null, time: new Date().toISOString(),
        events: 0, errors: 0
      };
      record(row);
      obj.addEventListener('open', function () { row.status = 'OPEN'; scheduleUpdate(); });
      obj.addEventListener('error', function () { row.errors++; row.status = 'ERROR/RECONNECT'; scheduleUpdate(); });
      ['put', 'patch'].forEach(function (name) {
        obj.addEventListener(name, function (event) {
          row.events++;
          // SSE frame overhead is unknown, so count only event-body UTF-8 bytes.
          var size = typeof event.data === 'string' ? bytesOf(event.data) : 0;
          row.bytes = (row.bytes || 0) + (size || 0);
          row.measured = true;
          scheduleUpdate();
        });
      });
      return obj;
    }
    InstrumentedEventSource.prototype = originalEventSource.prototype;
    InstrumentedEventSource.CONNECTING = originalEventSource.CONNECTING;
    InstrumentedEventSource.OPEN = originalEventSource.OPEN;
    InstrumentedEventSource.CLOSED = originalEventSource.CLOSED;
    window.EventSource = InstrumentedEventSource;
  }

  function summary() {
    var groups = new Map();
    var unknown = 0;
    requests.forEach(function (r) {
      var key = r.category + '||' + r.node + '||' + r.method;
      var g = groups.get(key) || { category: r.category, node: r.node, method: r.method, count: 0, bytes: 0, estimatedEcho: 0, known: 0, errors: 0, statuses: {} };
      g.count++;
      if (r.measured && r.bytes != null) { g.bytes += r.bytes; g.known++; }
      else if (r.headerBytes != null) { g.bytes += r.headerBytes; g.known++; }
      else { unknown++; }
      if (!r.measured && r.potentialEchoBytes != null) g.estimatedEcho += r.potentialEchoBytes;
      if (r.status === 'NETWORK_ERROR' || typeof r.status === 'number' && r.status >= 400 || r.status === 'ERROR/RECONNECT') g.errors++;
      g.statuses[r.status || 'PENDING'] = (g.statuses[r.status || 'PENDING'] || 0) + 1;
      groups.set(key, g);
    });
    return {
      generatedAt: new Date().toISOString(),
      elapsedSeconds: Math.floor((Date.now() - started) / 1000),
      count: requests.length,
      measuredResponseBytes: Array.from(groups.values()).reduce(function (s, g) { return s + g.bytes; }, 0),
      unmeasuredResponses: unknown,
      note: 'Body bytes are decoded response payload, not necessarily billable transfer bytes. Unconsumed PUT responses may echo written data. No credentials or response bodies are collected.',
      groups: Array.from(groups.values()).sort(function (a, b) { return b.bytes - a.bytes || b.count - a.count; }),
      requests: requests.map(function (r) {
        return { time: r.time, category: r.category, node: r.node, method: r.method, status: r.status, ms: r.ms, responseBytes: r.measured ? r.bytes : r.headerBytes, estimatedPutEchoBytes: r.measured ? null : r.potentialEchoBytes, streamEvents: r.events, streamErrors: r.errors };
      })
    };
  }

  function make(tag, props, text) {
    var el = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (key) { el.setAttribute(key, props[key]); });
    if (text != null) el.textContent = String(text);
    return el;
  }
  function render() {
    if (!panel || panel.hidden) return;
    var s = summary();
    document.getElementById('fbdiag-overview').textContent =
      s.count + ' peticiones · ' + readableSize(s.measuredResponseBytes) +
      ' respuesta medida · ' + s.unmeasuredResponses + ' sin medir';
    var tbody = document.getElementById('fbdiag-rows');
    tbody.replaceChildren();
    s.groups.slice(0, 35).forEach(function (g) {
      var tr = make('tr');
      [g.category, g.node, g.method, g.count, readableSize(g.bytes), g.errors].forEach(function (v) {
        tr.appendChild(make('td', null, v));
      });
      tbody.appendChild(tr);
    });
  }
  function reportText() {
    var s = summary();
    return 'APP R TEST - Diagnóstico Firebase\n' +
      'Hora: ' + s.generatedAt + '\nDuración: ' + s.elapsedSeconds + ' s\nPeticiones: ' + s.count +
      '\nRespuestas medidas: ' + readableSize(s.measuredResponseBytes) +
      '\nSin medir: ' + s.unmeasuredResponses + '\n' + s.note + '\n\n' +
      s.groups.map(function (g) {
        return g.category + ' | ' + g.node + ' | ' + g.method + ' | solicitudes=' + g.count +
          ' | recibidos=' + readableSize(g.bytes) + ' | sin medir=' + (g.count - g.known) +
          ' | posibles eco PUT=' + readableSize(g.estimatedEcho) + ' | errores=' + g.errors;
      }).join('\n');
  }
  function initUi() {
    var style = make('style');
    style.textContent =
      '#fbdiag-open{position:fixed!important;bottom:12px!important;left:12px!important;z-index:2147483600!important;background:#183b2a!important;color:#fff!important;border:1px solid #9abfac!important;border-radius:8px!important;padding:9px 12px!important;font:700 12px Arial!important;cursor:pointer!important;box-shadow:0 2px 12px #0003!important}' +
      '#fbdiag-panel{position:fixed!important;z-index:2147483601!important;inset:6vh 4vw!important;max-width:1160px!important;margin:auto!important;overflow:auto!important;background:white!important;color:#172c20!important;border:2px solid #2c6742!important;border-radius:12px!important;box-shadow:0 0 0 100vmax #0008!important;padding:20px!important;font:13px Arial!important}' +
      '#fbdiag-panel h2{margin:0 0 12px!important;font-size:21px!important}#fbdiag-panel p{font-size:12px!important;line-height:1.5!important}#fbdiag-panel button{padding:9px 12px!important;margin:0 6px 8px 0!important;font:700 12px Arial!important;border:1px solid #b9cfbf!important;border-radius:6px!important;color:#173927!important;background:#edf5ef!important;cursor:pointer!important}' +
      '#fbdiag-panel table{border-collapse:collapse!important;width:100%!important;min-width:660px!important}#fbdiag-panel th,#fbdiag-panel td{text-align:left!important;border-bottom:1px solid #dfeae0!important;padding:7px!important;font:12px Arial!important;white-space:nowrap!important}#fbdiag-panel th{font-weight:bold!important;background:#eff5f0!important}';
    document.head.appendChild(style);
    var button = make('button', { id: 'fbdiag-open', type: 'button' }, 'Medir Firebase');
    var box = make('section', { id: 'fbdiag-panel', role: 'dialog', 'aria-label': 'Diagnóstico Firebase', 'aria-modal': 'true' });
    box.hidden = true;
    box.appendChild(make('h2', null, 'Diagnóstico Firebase · TEST'));
    box.appendChild(make('p', { id: 'fbdiag-overview' }, 'Preparando informe...'));
    box.appendChild(make('p', null, 'Solo se registran metadatos y tamaños de respuestas, nunca contraseñas, tokens ni contenido. Las cifras representan bytes de respuesta decodificados, no necesariamente los bytes facturados.'));
    var bar = make('div');
    var copy = make('button', { type: 'button' }, 'Copiar resumen');
    copy.addEventListener('click', async function () {
      try { await navigator.clipboard.writeText(reportText()); copy.textContent = 'Copiado'; }
      catch (_) { copy.textContent = 'Usa Exportar JSON'; }
    });
    var exportButton = make('button', { type: 'button' }, 'Exportar JSON');
    exportButton.addEventListener('click', function () {
      var content = new Blob([JSON.stringify(summary(), null, 2)], { type: 'application/json' });
      var uri = URL.createObjectURL(content);
      var a = make('a', { href: uri, download: 'app-r-firebase-test-diagnostico.json' });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(uri); }, 1500);
    });
    var reset = make('button', { type: 'button' }, 'Reiniciar contadores');
    reset.addEventListener('click', function () { requests.length = 0; started = Date.now(); render(); });
    var close = make('button', { type: 'button' }, 'Cerrar ×');
    close.addEventListener('click', function () { box.hidden = true; button.focus(); });
    bar.append(copy, exportButton, reset, close);
    box.appendChild(bar);
    var scroll = make('div', { style: 'overflow-x:auto' });
    var table = make('table'), thead = make('thead'), header = make('tr');
    ['Módulo', 'Nodo de Firebase', 'Operación', 'Peticiones', 'Recibido medido', 'Errores'].forEach(function (v) { header.appendChild(make('th', null, v)); });
    thead.appendChild(header);
    table.appendChild(thead);
    table.appendChild(make('tbody', { id: 'fbdiag-rows' }));
    scroll.appendChild(table);
    box.appendChild(scroll);
    document.body.append(button, box);
    button.addEventListener('click', function () { box.hidden = false; render(); close.focus(); });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !box.hidden) box.hidden = true; });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUi);
  else initUi();
  Object.defineProperty(window, '__firebaseDiagTest', {
    value: Object.freeze({ summary: summary, reportText: reportText }), configurable: false, writable: false
  });
})();
