/* APP R: escáner Code 39 de tablillas para localizar inspecciones QC existentes.
 * Lee el ID impreso desde cámara cuando el navegador soporta BarcodeDetector.
 * La búsqueda solo lee datos QC ya cargados en Firebase; no crea ni modifica registros.
 */
(function () {
  'use strict';

  if (window.__APP_R_QC_BARCODE_INSTALLED__) return;
  window.__APP_R_QC_BARCODE_INSTALLED__ = true;

  var TYPES = [
    { key: 'preinjerto_patron', label: 'Preinjerto Patrón' },
    { key: 'preinjerto_variedad', label: 'Preinjerto Variedad' },
    { key: 'tunel', label: 'Túnel' },
    { key: 'carga', label: 'Carga normal' },
    { key: 'carga_injerto', label: 'Carga Injerto' }
  ];
  var overlay = null;
  var video = null;
  var statusNode = null;
  var resultsNode = null;
  var startButton = null;
  var stream = null;
  var detector = null;
  var scanTimer = null;
  var detecting = false;

  function setStatus(message, isError) {
    if (!statusNode) return;
    statusNode.textContent = message;
    statusNode.style.color = isError ? '#b42318' : '#405344';
  }

  function stopCamera() {
    detecting = false;
    if (scanTimer) {
      clearTimeout(scanTimer);
      scanTimer = null;
    }
    if (stream) {
      stream.getTracks().forEach(function (track) { track.stop(); });
      stream = null;
    }
    if (video) video.srcObject = null;
    detector = null;
    if (startButton) startButton.disabled = false;
  }

  function closeOverlay() {
    stopCamera();
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    video = null;
    statusNode = null;
    resultsNode = null;
    startButton = null;
  }

  function supportedTypes() {
    var role = '';
    try { role = String(currentUserRole || '').toUpperCase(); } catch (e) {}
    if (role === 'CARGADOR') return ['carga', 'carga_injerto'];
    return TYPES.map(function (item) { return item.key; });
  }

  function openOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'app-r-qc-barcode-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100500;background:rgba(13,25,16,.72);display:flex;align-items:center;justify-content:center;padding:14px;box-sizing:border-box';
    overlay.innerHTML =
      '<section role="dialog" aria-modal="true" aria-labelledby="app-r-qc-barcode-title" style="width:min(100%,520px);max-height:94vh;overflow:auto;background:#fff;border-radius:16px;padding:18px;box-shadow:0 18px 60px rgba(0,0,0,.28);font-family:inherit;box-sizing:border-box">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px">' +
          '<div><h2 id="app-r-qc-barcode-title" style="margin:0;font-size:19px;color:#20352a">Escanear tablilla</h2>' +
          '<div style="font-size:12px;color:#65736a;margin-top:3px">Lee el código de barras Code 39 de la partida.</div></div>' +
          '<button type="button" data-action="close" aria-label="Cerrar" style="border:0;background:#edf2ee;border-radius:9px;width:38px;height:38px;font-size:22px;cursor:pointer;color:#263b2c">×</button>' +
        '</div>' +
        '<div style="position:relative;background:#101510;border-radius:12px;overflow:hidden;min-height:180px;display:flex;align-items:center;justify-content:center">' +
          '<video data-role="video" playsinline muted style="display:none;width:100%;max-height:42vh;object-fit:cover"></video>' +
          '<div data-role="camera-placeholder" style="padding:24px;text-align:center;color:#e8f0e9;font-size:13px">Activa la cámara y enfoca el código de barras.</div>' +
          '<div aria-hidden="true" style="position:absolute;left:8%;right:8%;top:50%;height:2px;background:#75d28a;box-shadow:0 0 8px #75d28a"></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:11px">' +
          '<button type="button" data-action="start" disabled style="flex:1;border:0;border-radius:9px;padding:11px 13px;background:#1769aa;color:#fff;font-size:14px;font-weight:700;cursor:pointer">Comprobando lector…</button>' +
        '</div>' +
        '<p data-role="status" aria-live="polite" style="min-height:18px;margin:10px 0 12px;font-size:12px;color:#405344">Comprobando si este navegador puede leer Code 39…</p>' +
        '<div data-role="results" style="margin-top:10px"></div>' +
      '</section>';
    document.body.appendChild(overlay);

    video = overlay.querySelector('[data-role="video"]');
    statusNode = overlay.querySelector('[data-role="status"]');
    resultsNode = overlay.querySelector('[data-role="results"]');
    startButton = overlay.querySelector('[data-action="start"]');

    overlay.querySelector('[data-action="close"]').addEventListener('click', closeOverlay);
    startButton.addEventListener('click', startCamera);
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closeOverlay();
    });
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      startButton.textContent = 'Cámara no disponible';
      startButton.disabled = true;
      setStatus('La cámara no está disponible aquí. Cierra el lector y usa el buscador de partidas de la pantalla anterior.', true);
      return;
    }
    if (!window.BarcodeDetector || typeof window.BarcodeDetector.getSupportedFormats !== 'function') {
      startButton.textContent = 'Lector no compatible';
      startButton.disabled = true;
      setStatus('Este navegador no admite lectura Code 39. Cierra el lector y usa el buscador de partidas de la pantalla anterior.', true);
      return;
    }
    window.BarcodeDetector.getSupportedFormats().then(function (formats) {
      if (!overlay) return;
      if (formats.indexOf('code_39') < 0) {
        startButton.textContent = 'Code 39 no compatible';
        startButton.disabled = true;
        setStatus('Este navegador no reconoce Code 39 con la cámara. Puedes introducir el código completo manualmente.', true);
        return;
      }
      startButton.textContent = 'Activar cámara';
      startButton.disabled = false;
      setStatus('Enfoca el código de barras completo. La búsqueda usará el ID GS tal como está codificado.');
    }).catch(function () {
      if (!overlay) return;
      startButton.textContent = 'Lector no disponible';
      startButton.disabled = true;
      setStatus('No se pudo comprobar el lector Code 39. Cierra el lector y usa el buscador de partidas de la pantalla anterior.', true);
    });
  }

  async function startCamera() {
    if (!overlay || !startButton) return;
    if (!window.BarcodeDetector || typeof window.BarcodeDetector.getSupportedFormats !== 'function') {
      setStatus('Este navegador no ofrece lectura Code 39. Cierra el lector y usa el buscador de partidas de la pantalla anterior.', true);
      return;
    }
    startButton.disabled = true;
    setStatus('Solicitando acceso a la cámara…');
    try {
      detector = new window.BarcodeDetector({ formats: ['code_39'] });
      var cameraRequest = navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }
      });
      stream = await cameraRequest;
      if (!overlay) {
        stopCamera();
        return;
      }
      video.srcObject = stream;
      video.style.display = 'block';
      var placeholder = overlay.querySelector('[data-role="camera-placeholder"]');
      if (placeholder) placeholder.style.display = 'none';
      await video.play();
      detecting = true;
      setStatus('Buscando código Code 39…');
      scanFrame();
    } catch (error) {
      stopCamera();
      var message = error && error.name === 'NotAllowedError'
        ? 'No se concedió permiso de cámara. Permite el acceso en el navegador o cierra el lector y usa el buscador de partidas.'
        : 'No se pudo iniciar la cámara. Comprueba los permisos o cierra el lector y usa el buscador de partidas.';
      setStatus(message, true);
    }
  }

  async function scanFrame() {
    if (!detecting || !video || !detector) return;
    if (video.readyState < 2) {
      scanTimer = setTimeout(scanFrame, 180);
      return;
    }
    try {
      var codes = await detector.detect(video);
      if (codes && codes.length && codes[0].rawValue) {
        var value = String(codes[0].rawValue).trim().replace(/^\*|\*$/g, '');
        stopCamera();
        findPartida(value);
        return;
      }
    } catch (error) {
      setStatus('No se pudo leer ese fotograma; mantén el código enfocado y estable.');
    }
    if (detecting) scanTimer = setTimeout(scanFrame, 180);
  }

  function labelForType(type) {
    var item = TYPES.find(function (entry) { return entry.key === type; });
    return item ? item.label : type || 'QC';
  }

  function exactMatches(code) {
    if (typeof controlChecksData === 'undefined' || !Array.isArray(controlChecksData)) return [];
    var wanted = String(code).trim().toUpperCase();
    return controlChecksData.filter(function (record) {
      return record && record.partida != null &&
        String(record.partida).trim().toUpperCase() === wanted &&
        supportedTypes().indexOf(record.tipo) >= 0;
    }).sort(function (a, b) {
      return TYPES.findIndex(function (entry) { return entry.key === a.tipo; }) -
        TYPES.findIndex(function (entry) { return entry.key === b.tipo; }) ||
        (Number(b.dia) || 0) - (Number(a.dia) || 0);
    });
  }

  async function findPartida(rawCode) {
    var code = String(rawCode == null ? '' : rawCode).trim().replace(/^\*|\*$/g, '');
    if (!code) {
      setStatus('Lee el código completo o introdúcelo manualmente.', true);
      return;
    }
    if (resultsNode) resultsNode.textContent = '';
    var types = supportedTypes();
    try {
      if (typeof loadControlTipoCompleto !== 'function') throw new Error('QC_LOADER_UNAVAILABLE');
      for (var i = 0; i < types.length; i++) {
        setStatus('Cargando registros QC: ' + labelForType(types[i]) + '…');
        var loaded = await loadControlTipoCompleto(types[i], false);
        if (!loaded) throw new Error('QC_LOAD_FAILED');
      }
      var matches = exactMatches(code);
      setStatus('Código leído: ' + code);
      if (!matches.length) {
        setStatus('Código ' + code + ': no hay un QC registrado para esta partida.');
        if (resultsNode) resultsNode.textContent = '';
        return;
      }
      if (matches.length === 1) {
        var only = matches[0];
        closeOverlay();
        if (typeof abrirMedicionesControl === 'function') abrirMedicionesControl(only.id);
        else showToast('El formulario QC no está disponible.');
        return;
      }
      renderMatches(code, matches);
    } catch (error) {
      setStatus('No se pudieron consultar todos los registros QC. Comprueba la conexión e inténtalo de nuevo.', true);
      if (window.console && console.error) console.error('[QC barcode lookup]', error);
    }
  }

  function describeMatch(record) {
    var parts = [];
    var customer = String(record.clienteVariedad || '').trim();
    if (!customer) {
      customer = [record.cliente, record.variedad].filter(function (value) {
        return value != null && String(value).trim() !== '';
      }).map(function (value) { return String(value).trim(); }).join(' · ');
    }
    if (customer) parts.push(customer);

    var location = '';
    try {
      if (typeof controlQCInfoVisual === 'function') {
        var visual = controlQCInfoVisual(record) || {};
        location = [visual.inv && 'INV ' + visual.inv, visual.calles && 'Calle ' + visual.calles]
          .filter(Boolean).join(' · ');
      }
    } catch (error) {}
    if (!location) {
      var inv = String(record.invId || '').trim();
      var streets = [record.calleDesde, record.calleHasta].filter(function (value) {
        return value != null && String(value).trim() !== '';
      }).map(function (value) { return String(value).trim(); });
      if (inv) location = 'INV ' + inv;
      if (streets.length) location += (location ? ' · ' : '') + 'Calle ' +
        (streets.length > 1 && streets[0] !== streets[1] ? streets[0] + '–' + streets[1] : streets[0]);
      if (!location && record.invernadero) location = String(record.invernadero);
      if (!location && record.ubicacion) location = String(record.ubicacion);
    }
    if (location) parts.push(location);

    var trays = record.numBandejas != null ? record.numBandejas : record.bandejas;
    if (trays != null && String(trays).trim() !== '') parts.push(String(trays) + ' bandejas');
    return parts;
  }

  function renderMatches(code, matches) {
    if (!resultsNode) return;
    resultsNode.textContent = '';
    var heading = document.createElement('div');
    heading.textContent = 'La partida ' + code + ' aparece en ' + matches.length +
      ' registros QC. Elige la línea que quieres inspeccionar:';
    heading.style.cssText = 'font-size:13px;font-weight:700;color:#263b2c;margin:12px 0 7px';
    resultsNode.appendChild(heading);

    matches.forEach(function (record) {
      var button = document.createElement('button');
      button.type = 'button';
      button.style.cssText = 'display:flex;width:100%;flex-direction:column;align-items:stretch;gap:5px;text-align:left;margin:7px 0;padding:12px;border:1px solid #d5dfd5;border-radius:10px;background:#fff;color:#263b2c;cursor:pointer';
      var top = document.createElement('span');
      top.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px';
      var title = document.createElement('strong');
      title.textContent = labelForType(record.tipo);
      title.style.cssText = 'font-size:13px';
      var date = document.createElement('span');
      var dateText = '';
      try {
        if (typeof riegoDiaLabelCorto === 'function' && Number.isFinite(Number(record.dia))) dateText = riegoDiaLabelCorto(record.dia);
      } catch (error) {}
      date.textContent = dateText || (record.dia != null ? 'Día ' + record.dia : '');
      date.style.cssText = 'font-size:12px;color:#65736a;white-space:nowrap';
      top.appendChild(title);
      top.appendChild(date);
      button.appendChild(top);

      var details = describeMatch(record);
      if (details.length) {
        var meta = document.createElement('span');
        meta.textContent = details.join(' · ');
        meta.style.cssText = 'font-size:12px;line-height:1.35;color:#526257;overflow-wrap:anywhere';
        button.appendChild(meta);
      }
      button.addEventListener('click', function () {
        var selected = matches.find(function (item) { return item.id === record.id; });
        closeOverlay();
        if (selected && typeof abrirMedicionesControl === 'function') abrirMedicionesControl(selected.id);
        else showToast('El formulario QC no está disponible.');
      });
      resultsNode.appendChild(button);
    });
  }

  function searchFromSummary(rawCode) {
    var root = document.querySelector('[data-app-r-qc-search]');
    if (!root) return;
    statusNode = root.querySelector('[data-role="status"]');
    resultsNode = root.querySelector('[data-role="results"]');
    findPartida(rawCode);
  }

  function installButton() {
    var renderSummary = window.renderControlResumenHTML;
    if (typeof renderSummary !== 'function' || renderSummary.__qcBarcodeWrapped) return;
    var wrapped = function () {
      var original = renderSummary.apply(this, arguments);
      var action =
        '<div data-app-r-qc-search style="margin-bottom:12px">' +
          '<form onsubmit="event.preventDefault();window.AppRQCBarcode.search(this.querySelector(\'input\').value)" style="margin-bottom:8px">' +
            '<label for="app-r-qc-search-input" style="display:block;margin:0 0 5px;font-size:12px;font-weight:700;color:#33483a">Buscar partida</label>' +
            '<div style="display:flex;gap:7px">' +
              '<input id="app-r-qc-search-input" type="search" inputmode="text" autocomplete="off" placeholder="Escribe el código de partida" aria-label="Código de partida" style="min-width:0;flex:1;border:1px solid #b7c3b8;border-radius:9px;padding:10px 12px;font-size:16px;box-sizing:border-box">' +
              '<button type="submit" aria-label="Buscar partida" title="Buscar partida" style="display:flex;align-items:center;justify-content:center;width:46px;min-width:46px;border:0;border-radius:9px;background:#1769aa;color:#fff;cursor:pointer">' +
                '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="10.8" cy="10.8" r="6.7"></circle><path d="m16 16 4.3 4.3"></path></svg>' +
              '</button>' +
            '</div>' +
          '</form>' +
          '<div data-role="status" aria-live="polite" style="min-height:16px;margin:0 0 7px;font-size:12px;color:#405344"></div>' +
          '<div data-role="results" style="margin:0 0 9px"></div>' +
          '<button type="button" onclick="window.AppRQCBarcode.open()" aria-label="Escanear código de barras de una tablilla" ' +
            'style="display:flex;align-items:center;justify-content:center;gap:9px;width:100%;min-height:74px;border:2px solid #317eb7;border-bottom:3px solid #317eb7;border-radius:11px;padding:11px 14px;background:#eaf3e9;color:#315d49;box-shadow:inset 0 1px 0 rgba(255,255,255,.95),0 2px 4px rgba(35,95,135,.14);font-size:14px;font-weight:800;cursor:pointer">' +
            '<span aria-hidden="true" style="font-size:19px;color:#3979a7">▥</span><span>Escanear tablilla</span></button>' +
        '</div>';
      return action + original;
    };
    wrapped.__qcBarcodeWrapped = true;
    window.renderControlResumenHTML = wrapped;
  }

  window.AppRQCBarcode = { open: openOverlay, search: searchFromSummary };
  installButton();
  document.addEventListener('DOMContentLoaded', installButton, { once: true });
})();