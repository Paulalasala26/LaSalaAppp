Warning: truncated output (original token count: 68607)
Total output lines: 4624

// Control/QC principal — bloque extraído sin modificar su lógica.
// ════════════════════════════════════════════════════════════════
// CONTROL — pantalla completa (Check Túnel, Check Carga, Check Invernadero,
// Check Fechas, Check Prueba de Productos), a petición de Paula 2026-07-31.
// Check Túnel/Carga llevan un checklist por partida (cliente+variedad,
// partida, calle real, nº bandejas, y los checks de Color/Tamaño/Sanidad/
// Flores/Raíces/Observaciones de la hoja en papel que envió), organizados
// por día (reutiliza el mismo sistema de quincenas de Riego,
// riegoQuincenaDias/riegoQuincenaOffsetActual). Llevan un botón "Insertar
// PDF" por día para adjuntar el PDF de esa salida — la LECTURA AUTOMÁTICA de
// sus columnas (Cliente Variedad, Nº Partida, Nº Band...) queda pendiente de
// que Paula mande un PDF de ejemplo; de momento el PDF solo se guarda como
// adjunto de referencia y el alta de cada línea es manual. Check
// Invernadero/Fechas/Prueba de Productos son de momento solo la estructura
// de navegación (sin campos aún, a la espera de que Paula los concrete) —
// mismo patrón que se siguió con Clima al principio (ver
// [[lasala_modulo_trabajos]]).
// ════════════════════════════════════════════════════════════════
const CONTROL_SECCIONES = [
  {key:'tunel', label:'QC Túnel', icon:'ti-building-warehouse', color:'linear-gradient(135deg,#5c8df0,#3fc6b0)', conCheck:true},
  {key:'carga', label:'QC Carga normal', icon:'ti-truck', color:'linear-gradient(135deg,#f5a35c,#f0715c)', conCheck:true},
  {key:'carga_injerto', label:'QC Carga Injerto', icon:'ti-seedling', color:'linear-gradient(135deg,#7b5cf0,#3fa864)', conCheck:true},
  {key:'invernadero', label:'Check Invernadero', icon:'ti-plant-2', color:'linear-gradient(135deg,#1a5c2e,#3fa864)', conCheck:false},
  {key:'fechas', label:'Check Fechas', icon:'ti-calendar-event', color:'linear-gradient(135deg,#7b5cf0,#5c8df0)', conCheck:false},
  {key:'productos', label:'Check Prueba de Productos', icon:'ti-flask', color:'linear-gradient(135deg,#c47f00,#e0a530)', conCheck:false},
  // Conteo Tuta: tabla semanal (no checklist por día) — a petición de Paula
  // 2026-08-01, datos actualizados cada jueves.
  {key:'conteo_tuta', label:'Conteo Tuta', icon:'ti-bug', color:'linear-gradient(135deg,#ad1457,#ec407a)', conCheck:false, tabla:true}
];
// Las secciones rotuladas Próximamente no pueden abrirse desde Control.
function controlSeccionEsProximamente(s){ return !!s && !s.conCheck && !s.tabla; }
// Invernaderos/casetas de la trampa de Tuta — 19 y 20 tienen dos casetas
// cada uno (verde y blanca), el resto una sola fila.
const CONTEO_TUTA_FILAS = [
  {key:'0A', label:'INV 0A'},
  {key:'0B', label:'INV 0B'},
  {key:'1A', label:'INV 1A'},
  {key:'1B', label:'INV 1B'},
  {key:'3A', label:'INV 3A'},
  {key:'10A', label:'INV 10A'},
  {key:'10B', label:'INV 10B'},
  {key:'11A', label:'INV 11A'},
  {key:'15', label:'INV 15'},
  {key:'17', label:'INV 17'},
  {key:'19-verde', label:'INV 19 — Caseta verde'},
  {key:'19-blanca', label:'INV 19 — Caseta blanca'},
  {key:'20-verde', label:'INV 20 — Caseta verde'},
  {key:'20-blanca', label:'INV 20 — Caseta blanca'}
];
// Datos por SEMANA (a petición de Paula, 2026-08-01 — antes solo se
// guardaba el último valor; ahora cada jueves crea/edita su propia semana,
// para poder comparar entre semanas en el dashboard). conteoTutaData[dia]
// = { [invCasetaKey]: {feromona, placa, conteo} } — "dia" es el mismo
// contador de día que usa Riego/Túnel/Carga (riegoDiaDeHoy, etc.), aquí
// representa la semana en la que Paula dio esos datos (normalmente jueves).
const CONTEO_TUTA_KEY = 'lasala-conteo-tuta-v1';
let conteoTutaData = {};
async function loadConteoTutaData(){
  try{ const r = await window.storage.get(CONTEO_TUTA_KEY); if(r) conteoTutaData = JSON.parse(r.value); }catch(e){}
}
async function guardarConteoTutaCampo(dia,key,campo,valor){
  const tx=await actualizarStorageJsonConEtag(CONTEO_TUTA_KEY,{},cloud=>{
    if(!cloud||typeof cloud!=='object'||Array.isArray(cloud)) cloud={};
    cloud[dia]=cloud[dia]||{};
    cloud[dia][key]={...(cloud[dia][key]||{}),[campo]:valor};
    return cloud;
  });
  if(!tx.ok){ avisarFalloGuardado(); return false; }
  conteoTutaData=tx.value;
  showToast('✓ Guardado');
  return true;
}
let conteoTutaQuincenaOffset = 0;
let conteoTutaDiaSel = null;
let conteoTutaVista = 'datos'; // 'datos' | 'dashboard'
function cambiarConteoTutaQuincena(delta){
  conteoTutaQuincenaOffset = Math.max(0, conteoTutaQuincenaOffset + delta);
  conteoTutaDiaSel = null;
  renderControlContent(document.getElementById('control-overlay'));
}
function cambiarConteoTutaDia(dia){
  conteoTutaDiaSel = parseInt(dia,10);
  renderControlContent(document.getElementById('control-overlay'));
}
function cambiarConteoTutaVista(vista){
  conteoTutaVista = vista;
  renderControlContent(document.getElementById('control-overlay'));
}
// El conteo de Tuta solo se hace los jueves de cada semana — a petición de
// Paula, 2026-08-10, no tiene sentido que aparezcan el resto de días. Un día
// es "jueves" si riegoDiaToDate(d).getDay()===4 (0=domingo..6=sábado, JS
// Date estándar).
function esJuevesConteoTuta(dia){
  return riegoDiaToDate(dia).getDay()===4;
}
function renderControlConteoTutaHTML(seccion){
  const diasQ = riegoQuincenaDias(conteoTutaQuincenaOffset).filter(esJuevesConteoTuta);
  if(conteoTutaDiaSel==null || !diasQ.includes(conteoTutaDiaSel)) conteoTutaDiaSel = diasQ.includes(riegoDiaDeHoy()) ? riegoDiaDeHoy() : diasQ[0];
  const escapar = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const tabBtn = (v,label) => `<button onclick="cambiarConteoTutaVista('${v}')" style="padding:9px 18px;border-radius:8px 8px 0 0;font-size:12px;font-weight:800;border:none;cursor:pointer;background:${conteoTutaVista===v?seccion.color:'#e8e2dc'};color:${conteoTutaVista===v?'#fff':'var(--muted)'}">${label}</button>`;
  const header = `
    <div style="margin-bottom:1.1rem">
      <h2 style="font-size:22px;font-weight:800;color:var(--text);margin-bottom:4px">${seccion.label}</h2>
      <p style="font-size:12px;color:var(--muted)">Datos actualizados semanalmente (cada jueves).</p>
    </div>
    <div style="display:flex;gap:4px">${tabBtn('datos','📋 Introducir datos')}${tabBtn('dashboard','📊 Dashboard')}</div>`;

  if(conteoTutaVista === 'dashboard') return header + renderConteoTutaDashboardHTML(seccion);

  const diaBotones = diasQ.map(d=>`
    <button onclick="cambiarConteoTutaDia(${d})" style="flex-shrink:0;padding:8px 12px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;border:1.5px solid ${d===conteoTutaDiaSel?'transparent':'var(--border)'};background:${d===conteoTutaDiaSel?seccion.color:'#fff'};color:${d===conteoTutaDiaSel?'#fff':'var(--text)'}">
      ${riegoDiaLabelCorto(d)}<br><span style="font-weight:600;opacity:.85">${riegoDiaSemana(d)}</span>
    </button>`).join('');

  const datosSemana = conteoTutaData[conteoTutaDiaSel] || {};
  const tarjetas = CONTEO_TUTA_FILAS.map(f=>{
    const d = datosSemana[f.key] || {};
    return `
    <div style="border-radius:14px;padding:14px 16px;background:${seccion.color};color:#fff;box-shadow:var(--shadow-sm);position:relative;overflow:hidden">
      <div style="position:absolute;right:-18px;top:-18px;width:80px;height:80px;background:rgba(255,255,255,.08);border-radius:50%;pointer-events:none"></div>
      <div style="font-size:14px;font-weight:800;margin-bottom:10px;position:relative">${escapar(f.label)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;position:relative">
        <div>
          <label style="font-size:9px;font-weight:800;opacity:.85;text-transform:uppercase;letter-spacing:.03em;display:block;margin-bottom:3px">Feromona</label>
          <input type="date" value="${escapar(d.feromona)}" onchange="guardarConteoTutaCampo(${conteoTutaDiaSel},'${f.key}','feromona',this.value)" style="width:100%;padding:6px 7px;border:none;border-radius:6px;font-size:11px;background:rgba(255,255,255,.92);color:#1a1e18">
        </div>
        <div>
          <label style="font-size:9px;font-weight:800;opacity:.85;text-transform:uppercase;letter-spacing:.03em;display:block;margin-bottom:3px">Cambio placa</label>
          <input type="date" value="${escapar(d.placa)}" onchange="guardarConteoTutaCampo(${conteoTutaDiaSel},'${f.key}','placa',this.value)" style="width:100%;padding:6px 7px;border:none;border-radius:6px;font-size:11px;background:rgba(255,255,255,.92);color:#1a1e18">
        </div>
      </div>
      <div style="margin-top:8px;position:relative">
        <label style="font-size:9px;font-weight:800;opacity:.85;text-transform:uppercase;letter-spacing:.03em;display:block;margin-bottom:3px">Conteo</label>
        <input type="number" placeholder="0" value="${escapar(d.conteo)}" onchange="guardarConteoTutaCampo(${conteoTutaDiaSel},'${f.key}','conteo',this.value)" style="width:100%;padding:6px 7px;border:none;border-radius:6px;font-size:11px;background:rgba(255,255,255,.92);color:#1a1e18">
      </div>
    </div>`;
  }).join('');

  return header + `
    <div style="background:#fff;border:1.5px solid var(--border);border-top:none;border-radius:0 0 12px 12px;padding:1.25rem">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <button onclick="cambiarConteoTutaQuincena(-1)" ${conteoTutaQuincenaOffset<=0?'disabled style="opacity:.35;cursor:default"':'style="cursor:pointer"'} style="background:#fff;border:1.5px solid var(--border);border-radius:6px;width:26px;height:26px">&#8249;</button>
        <span style="font-size:11px;font-weight:700;color:var(--muted)">Quincena ${conteoTutaQuincenaOffset+1} · ${riegoQuincenaLabel(conteoTutaQuincenaOffset)}</span>
        <button onclick="cambiarConteoTutaQuincena(1)" style="background:#fff;border:1.5px solid var(--border);border-radius:6px;width:26px;height:26px;cursor:pointer">&#8250;</button>
      </div>
      <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:8px;margin-bottom:1rem">${diaBotones}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px">${tarjetas}</div>
    </div>`;
}
// Dashboard comparativo (a petición de Paula, 2026-08-01): un mini gráfico
// de barras + % de subida/bajada del conteo respecto a la semana anterior,
// por cada invernadero/caseta — usa TODAS las semanas que tengan algún dato
// guardado (no solo la quincena actual), mostrando como máximo las últimas
// 8 para que el gráfico no quede ilegible.
function renderConteoTutaDashboardHTML(seccion){
  const semanas = Object.keys(conteoTutaData).map(Number).sort((a,b)=>a-b);
  if(!semanas.length){
    return `<div style="background:#fff;border:1.5px solid var(--border);border-top:none;border-radius:0 0 12px 12px;padding:2rem;text-align:center;color:var(--muted);font-style:italic;font-size:13px">Todavía no hay datos de ninguna semana.</div>`;
  }
  const ultimas = semanas.slice(-8);
  const escapar = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const filasHTML = CONTEO_TUTA_FILAS.map(f=>{
    const valores = ultimas.map(dia=>{
      const v = conteoTutaData[dia]?.[f.key]?.conteo;
      return (v!=null && v!=='') ? parseFloat(v) : null;
    });
    const conocidos = valores.filter(v=>v!=null);
    const max = Math.max(1, ...conocidos);
    const ultimo = valores[valores.length-1];
    const penultimo = [...valores].slice(0,-1).reverse().find(v=>v!=null);
    let cambioHTML = '<span style="font-size:11px;color:var(--muted)">—</span>';
    if(ultimo!=null && penultimo!=null){
      if(penultimo===0){
        cambioHTML = ultimo>0 ? `<span style="font-size:11px;font-weight:800;color:#c62828">nuevo</span>` : `<span style="font-size:11px;font-weight:800;color:#2e7d32">0</span>`;
      } else {
        const pct = Math.round(((ultimo-penultimo)/penultimo)*100);
        const subida = pct > 0;
        cambioHTML = `<span style="font-size:11px;font-weight:800;color:${subida?'#c62828':(pct<0?'#2e7d32':'var(--muted)')}">${subida?'▲':(pct<0?'▼':'=')} ${Math.abs(pct)}%</span>`;
      }
    }
    const barrasHTML = ultimas.map((dia,i)=>{
      const v = valores[i];
      const alturaPct = v!=null ? Math.max(6, Math.round((v/max)*100)) : 2;
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0">
        <div style="width:100%;height:56px;display:flex;align-items:flex-end">
          <div title="${riegoDiaLabelCorto(dia)}: ${v!=null?v:'sin dato'}" style="width:100%;height:${alturaPct}%;background:${v!=null?seccion.color:'#e0e0e0'};border-radius:4px 4px 0 0;min-height:2px"></div>
        </div>
        <div style="font-size:8px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${riegoDiaLabelCorto(dia)}</div>
      </div>`;
    }).join('');
    return `
    <div style="border:1.5px solid var(--border);border-radius:12px;padding:12px 14px;background:#fff">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px">
        <div style="font-size:13px;font-weight:800;color:var(--text)">${escapar(f.label)}</div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
          <span style="font-size:16px;font-weight:800;color:var(--text)">${ultimo!=null?ultimo:'—'}</span>
          ${cambioHTML}
        </div>
      </div>
      <div style="display:flex;gap:4px;align-items:flex-end">${barrasHTML}</div>
    </div>`;
  }).join('');
  return `
    <div style="background:#fff;border:1.5px solid var(--border);border-top:none;border-radius:0 0 12px 12px;padding:1.25rem">
      <div style="font-size:11px;color:var(--muted);margin-bottom:1rem">Comparativa de conteo (últimas ${ultimas.length} semana${ultimas.length===1?'':'s'} con datos) — <span style="color:#c62828;font-weight:800">▲ rojo</span> sube la captura, <span style="color:#2e7d32;font-weight:800">▼ verde</span> baja.</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">${filasHTML}</div>
    </div>`;
}
// ════════════════════════════════════════════════════════════════
// CHECK INVERNADERO — a petición de Paula, 2026-08-11: líneas sueltas con
// número de partida, variedad, calle y cantidad de bandejas, cada una como
// su propia tarjeta ("banner colgando"), filtrables por variedad/nº partida,
// con un botón "Total bandejas" que suma las bandejas de lo filtrado. NO
// comparte código ni datos con Check Túnel/Carga (ver
// [[lasala_control_tunel_intocable]]) — es una lista plana propia, sin días
// ni categorías de check.
// ════════════════════════════════════════════════════════════════
const CONTROL_INVERNADERO_KEY = 'lasala-control-invernadero-v1';
let controlInvernaderoData = [];
async function loadControlInvernaderoData(){
  try{ const r = await window.storage.get(CONTROL_INVERNADERO_KEY); if(r) controlInvernaderoData = JSON.parse(r.value); }catch(e){}
}
async function saveControlInvernaderoData(){
  try{
    const locales=controlInvernaderoData.slice();
    const tx=await actualizarStorageJsonConEtag(CONTROL_INVERNADERO_KEY,[],cloud=>{
      if(!Array.isArray(cloud)) cloud=[];
      const map={};
      cloud.forEach(l=>map[l.id]=l);
      locales.forEach(l=>map[l.id]=l);
      return Object.values(map);
    });
    if(!tx.ok){ avisarFalloGuardado(); return; }
    controlInvernaderoData=tx.value;
  }catch(e){ avisarFalloGuardado(); }
}
let controlInvernaderoFiltroVariedad = '';
let controlInvernaderoFiltroPartida = '';
let controlInvernaderoTotalMostrado = null;
function cambiarControlInvernaderoFiltro(campo, valor){
  if(campo==='variedad') controlInvernaderoFiltroVariedad = valor;
  else controlInvernaderoFiltroPartida = valor;
  controlInvernaderoTotalMostrado = null;
  renderControlContent(document.getElementById('control-overlay'));
}
function controlInvernaderoLineasFiltradas(){
  const v = controlInvernaderoFiltroVariedad.trim().toUpperCase();
  const p = controlInvernaderoFiltroPartida.trim().toUpperCase();
  return controlInvernaderoData.filter(l=>
    (!v || String(l.variedad||'').toUpperCase().includes(v)) &&
    (!p || String(l.partida||'').toUpperCase().includes(p))
  );
}
// "A tresbolillo" (a petición de Paula, 2026-08-11): una bandeja marcada así
// cuenta la MITAD de una normal (ej. M1B a tresbolillo = media normal) — se
// aplica solo al calcular el total, el número de bandejas guardado en la
// línea es siempre el real, tal cual se introdujo.
function bandejasEquivalentes(l){
  const n = parseFloat(l.bandejas)||0;
  return l.tresbolillo ? n/2 : n;
}
function calcularControlInvernaderoTotal(){
  const filtradas = controlInvernaderoLineasFiltradas();
  controlInvernaderoTotalMostrado = filtradas.reduce((sum,l)=>sum + bandejasEquivalentes(l), 0);
  renderControlContent(document.getElementById('control-overlay'));
}
async function toggleLineaTresbolillo(id){
  const l = controlInvernaderoData.find(x=>x.id===id);
  if(!l) return;
  l.tresbolillo = !l.tresbolillo;
  await saveControlInvernaderoData();
  controlInvernaderoTotalMostrado = null;
  renderControlContent(document.getElementById('control-overlay'));
}
function mostrarFormNuevaLineaInvernadero(){
  const overlay = getOrCreateOverlay('control-invernadero-form-overlay');
  overlay.style.zIndex = 2100;
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:14px;max-width:340px;width:100%;padding:1.5rem;box-shadow:0 8px 40px rgba(0,0,0,.3)">
      <div style="font-size:15px;font-weight:800;margin-bottom:14px">➕ Nueva línea</div>
      <label style="font-size:11px;font-weight:700;color:var(--muted)">Nº Partida</label>
      <input id="ci-partida" type="text" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:7px;font-size:13px;margin:4px 0 10px">
      <label style="font-size:11px;font-weight:700;color:var(--muted)">Variedad</label>
      <input id="ci-variedad" type="text" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:7px;font-size:13px;margin:4px 0 10px">
      <label style="font-size:11px;font-weight:700;color:var(--muted)">Calle</label>
      <input id="ci-calle" type="text" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:7px;font-size:13px;margin:4px 0 10px">
      <label style="font-size:11px;font-weight:700;color:var(--muted)">Cantidad de bandejas</label>
      <input id="ci-bandejas" type="number" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:7px;font-size:13px;margin:4px 0 10px">
      <label style="display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;color:var(--text);margin-bottom:14px;cursor:pointer">
        <input id="ci-tresbolillo" type="checkbox" style="width:16px;height:16px;cursor:pointer"> A tresbolillo (cuenta la mitad)
      </label>
      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button onclick="document.getElementById('control-invernadero-form-overlay').style.display='none'" style="padding:9px 16px;font-size:12px;background:#f5f5f5;color:#555;border:1px solid #ddd;border-radius:7px;cursor:pointer">Cancelar</button>
        <button onclick="guardarNuevaLineaInvernadero()" style="padding:9px 18px;font-size:12px;font-weight:800;background:#1a5c2e;color:#fff;border:none;border-radius:7px;cursor:pointer">Añadir</button>
      </div>
    </div>`;
  overlay.style.display = 'flex';
}
async function guardarNuevaLineaInvernadero(){
  const partida = document.getElementById('ci-partida').value.trim();
  const variedad = document.getElementById('ci-variedad').value.trim();
  const calle = document.getElementById('ci-calle').value.trim();
  const bandejas = document.getElementById('ci-bandejas').value.trim();
  const tresbolillo = document.getElementById('ci-tresbolillo').checked;
  if(!partida && !variedad && !calle && !bandejas){ showToast('Rellena al menos un campo'); return; }
  controlInvernaderoData.push({
    id: 'ci_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),
    partida, variedad, calle, bandejas: bandejas?parseFloat(bandejas):0, tresbolillo,
    creadoPor: currentUser||'—', creadoEn: new Date().toLocaleString('es-ES')
  });
  document.getElementById('control-invernadero-form-overlay').style.display = 'none';
  await saveControlInvernaderoData();
  showToast('✓ Línea añadida');
  renderControlContent(document.getElementById('control-overlay'));
}
async function eliminarLineaInvernadero(id){
  if(!confirm('¿Eliminar esta línea?')) return;
  const tx=await actualizarStorageJsonConEtag(CONTROL_INVERNADERO_KEY,[],cloud=>{
    if(!Array.isArray(cloud)) cloud=[];
    return cloud.filter(l=>l.id!==id);
  });
  if(!tx.ok){ avisarFalloGuardado(); return; }
  controlInvernaderoData=tx.value;
  controlInvernaderoTotalMostrado=null;
  renderControlContent(document.getElementById('control-overlay'));
  showToast('✓ Eliminada');
}
function renderControlInvernaderoHTML(){
  const escapar = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const filtradas = controlInvernaderoLineasFiltradas();
  const tarjetas = filtradas.map(l=>`
    <div style="border-radius:10px 10px 4px 4px;padding:10px 14px;background:linear-gradient(135deg,#1a5c2e,#3fa864);color:#fff;box-shadow:var(--shadow-sm);position:relative">
      <button onclick="eliminarLineaInvernadero('${l.id}')" title="Eliminar" style="position:absolute;top:6px;right:8px;width:20px;height:20px;padding:0;background:rgba(255,255,255,.2);color:#fff;border:none;border-radius:5px;font-size:11px;cursor:pointer">🗑️</button>
      <div style="font-size:14px;font-weight:800;padding-right:24px">${escapar(l.partida)||'—'}</div>
      <div style="font-size:12px;font-weight:600;opacity:.95;margin-top:2px">${escapar(l.variedad)||'—'}</div>
      <div style="display:flex;gap:12px;margin-top:6px;font-size:11px;font-weight:700;opacity:.9;flex-wrap:wrap">
        <span>📍 Calle ${escapar(l.calle)||'—'}</span>
        <span>📦 ${escapar(l.bandejas)||0} bandejas${l.tresbolillo?` <span style="opacity:.85">(= ${bandejasEquivalentes(l)})</span>`:''}</span>
      </div>
      <button onclick="toggleLineaTresbolillo('${l.id}')" style="margin-top:8px;padding:5px 11px;font-size:10.5px;font-weight:800;border-radius:6px;cursor:pointer;border:1.5px solid rgba(255,255,255,.5);background:${l.tresbolillo?'#fff':'rgba(255,255,255,.15)'};color:${l.tresbolillo?'#1a5c2e':'#fff'}">${l.tresbolillo?'✓ ':''}⚿ Tresbolillo</button>
    </div>`).join('');
  return `
    <div style="margin-bottom:1.1rem;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
      <div>
        <h2 style="font-size:22px;font-weight:800;color:var(--text);margin-bottom:4px">Check Invernadero</h2>
        <p style="font-size:12px;color:var(--muted)">Líneas por partida — variedad, calle y bandejas.</p>
      </div>
      <button onclick="mostrarFormNuevaLineaInvernadero()" class="btn-elevado" style="padding:9px 16px;font-size:12px;font-weight:700;background:#1a5c2e;color:#fff;border:none;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;gap:6px">
        <i class="ti ti-plus" style="font-size:14px"></i> Añadir
      </button>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:1rem;background:#f2f4f0;border-radius:10px;padding:10px 12px">
      <div>
        <label style="font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase">Filtrar por variedad</label>
        <input type="text" value="${escapar(controlInvernaderoFiltroVariedad)}" oninput="cambiarControlInvernaderoFiltro('variedad',this.value)" style="display:block;padding:7px 10px;border:1.5px solid var(--border);border-radius:7px;font-size:12px;margin-top:3px;min-width:150px">
      </div>
      <div>
        <label style="font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase">Filtrar por nº partida</label>
        <input type="text" value="${escapar(controlInvernaderoFiltroPartida)}" oninput="cambiarControlInvernaderoFiltro('partida',this.value)" style="display:block;padding:7px 10px;border:1.5px solid var(--border);border-radius:7px;font-size:12px;margin-top:3px;min-width:150px">
      </div>
      <button onclick="calcularControlInvernaderoTotal()" style="padding:8px 16px;font-size:12px;font-weight:800;background:#0f5c4a;color:#fff;border:none;border-radius:7px;cursor:pointer;height:34px">Total bandejas</button>
      ${controlInvernaderoTotalMostrado!=null ? `<div style="font-size:14px;font-weight:800;color:#0f5c4a;display:flex;align-items:center">= ${controlInvernaderoTotalMostrado} bandejas (${filtradas.length} línea${filtradas.length===1?'':'s'})</div>` : ''}
    </div>
    ${filtradas.length===0
      ? `<div style="text-align:center;padding:2.5rem;color:var(--muted);font-style:italic;font-size:13px">${controlInvernaderoData.length===0?'Sin líneas todavía.':'Ninguna línea coincide con el filtro.'}</div>`
      : `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px">${tarjetas}</div>`}`;
}
// Categorías de checks de la hoja en papel — cada opción es un check
// independiente (no excluyentes entre sí, igual que en el papel). Cada
// categoría lleva su propio color/icono (a petición de Paula, 2026-07-31,
// "más atractivo visualmente") — reutilizando la MISMA paleta de gradientes
// ya usada en Trabajos/Riego/Plaguicidas/Específicos, no colores nuevos.
const CONTROL_CHECK_CATEGORIAS = [
  {key:'color', label:'Color', icon:'ti-palette', gradiente:'linear-gradient(135deg,#7b5cf0,#5c8df0)', tinte:'#efeafd',
    opciones:[{key:'verde',label:'Verde'},{key:'amarillo',label:'Amarillo'},{key:'verdeClaro',label:'Verde claro'},{key:'ok',label:'OK'}]},
  {key:'tamano', label:'Tamaño', icon:'ti-ruler-2', gradiente:'linear-gradient(135deg,#5c8df0,#3fc6b0)', tinte:'#e8f2fd',
    opciones:[{key:'grande',label:'Grande'},{key:'pequeno',label:'Pequeño'},{key:'ok',label:'OK'}]},
  {key:'sanidad', label:'Sanidad', icon:'ti-stethoscope', gradiente:'linear-gradient(135deg,#f5a35c,#f0715c)', tinte:'#fdece5',
    opciones:[{key:'ok',label:'OK'},{key:'enferma',label:'Enferma'}]},
  {key:'flores', label:'Flores', icon:'ti-flower', gradiente:'linear-gradient(135deg,#1a5c2e,#3fa864)', tinte:'#e8f5ea',
    opciones:[{key:'si',label:'Sí'},{key:'no',label:'No'}]},
  {key:'raices', label:'Raíces', icon:'ti-plant-2', gradiente:'linear-gradient(135deg,#c47f00,#e0a530)', tinte:'#fbf1e0',
    opciones:[{key:'pocaRaiz',label:'Poca raíz'},{key:'raizVariedad',label:'Raíz en variedad'},{key:'ok',label:'OK'}]}
];
// A petición de Paula (2026-08-01): al marcar Sanidad→Enferma aparece un
// segundo nivel de casillas con el tipo de problema concreto — se guarda
// aparte (c.sanidadEnfermedades) en vez de dentro de c.sanidad para no mezclar
// el estado "enferma" (sí/no) con el detalle de qué enfermedad es.
const SANIDAD_ENFERMEDADES = [
  {key:'hojasManchadas', label:'Hojas manchadas'},
  {key:'hojasAmarillas', label:'Hojas amarillas'},
  {key:'tuta', label:'Tuta'},
  {key:'minador', label:'Minador'},
  {key:'pulgon', label:'Pulgón'},
  {key:'oidio', label:'Oídio'},
  {key:'alternaria', label:'Alternaria'},
  {key:'botritis', label:'Botritis'}
];
async function toggleControlSanidadEnfermedad(id, key){
  const c = controlChecksData.find(x=>x.id===id);
  if(!c) return;
  c.sanidadEnfermedades = c.sanidadEnfermedades || {};
  const nuevoValor = !c.sanidadEnfermedades[key];
  await aplicarSanidadEnfermedad(id, key, nuevoValor);
}
async function aplicarSanidadEnfermedad(id, key, valor){
  const c = controlChecksData.find(x=>x.id===id);
  if(!c) return;
  c.sanidadEnfermedades = c.sanidadEnfermedades || {};
  c.sanidadEnfermedades[key] = valor;
  // El repintado se hace ANTES de esperar la respuesta de red: sin conexión real en
  // el invernadero, un fetch puede tardar mucho en fallar (varios reintentos), y
  // esperar a eso hacía que el check pareciera "no cambiar de color" aunque el
  // cambio ya estaba aplicado en memoria — ahora se ve al instante siempre.
  renderControlContent(document.getElementById('control-overlay'));
  const qid = encolarAccionOffline('aplicarSanidadEnfermedad', [id, key, valor]);
  marcarControlCheckSucio(id);
  const ok = await persistControlChecksData();
  if(ok){
    desencolarAccion(qid);
    await registrarCambioControlBackoffice(id, 'Cambió sanidad: '+String(key).slice(0,45)+' = '+(valor?'Sí':'No'));
  } else avisarGuardadoLocalPendiente(leerColaOffline().length);
}
// Ficha ampliada de una foto de Control — a petición de Paula (2026-08-01,
// "debe poder abrirse en la pantalla") en vez de window.open (bloqueado por
// el navegador en algunos móviles, y no se siente como parte de la app).
function mostrarFotoControlAmpliada(id){
  const foto = fotoSrcCompleta(controlFotosData[id]);
  if(!foto) return;
  const mo = getOrCreateOverlay('control-foto-ampliada-overlay');
  mo.style.padding = '0';
  mo.innerHTML = `
    <div onclick="document.getElementById('control-foto-ampliada-overlay').style.display='none'" style="width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.88)">
      <img src="${foto}" style="max-width:94vw;max-height:94vh;border-radius:10px;box-shadow:0 8px 40px rgba(0,0,0,.5)">
      <button onclick="event.stopPropagation();document.getElementById('control-foto-ampliada-overlay').style.display='none'" style="position:fixed;top:16px;right:16px;background:rgba(255,255,255,.15);border:none;color:#fff;border-radius:50%;width:40px;height:40px;font-size:20px;cursor:pointer">✕</button>
    </div>`;
  mo.style.display = 'flex';
}
// A petición de Paula (2026-08-05): con 49 cambios sin poder sincronizar en su
// iPhone, se detectó la causa real — las fotos (base64, varios cientos de KB
// cada una) vivían DENTRO del mismo array de controlChecksData, así que CADA
// guardado (aunque fuera solo marcar un color en una línea sin foto) tenía que
// volver a subir TODAS las fotos de golpe: con 30 fotos guardadas, el array
// pesaba ~10,5 MB, y con mala cobertura en el invernadero esa subida fallaba
// una y otra vez. Las fotos se guardan ahora en su propia clave de Firebase
// ({id de la línea: fotoB64}), separada de controlChecksData — así, marcar un
// check normal vuelve a pesar unos pocos KB y solo el guardado de la foto en
// sí sube ese peso mayor (y solo esa foto, no las demás).
const CONTROL_FOTOS_KEY = 'lasala-control-fotos-v1';
// 2026-08-14: aquel arreglo de 2026-08-05 (mover las fotos a su propia
// clave) volvió a fallar — una sola clave con TODAS las fotos también
// termina llenándose (llegó a 10,27 MB, bloqueando cualquier guardado
// nuevo en silencio) — mismo síntoma de fondo, solo que en la clave nueva
// en vez de en controlChecksData. Ahora las fotos se REPARTEN en varios
// "shards" (`lasala-control-fotos-v1`, `-v1-2`, `-v1-3`...) — un índice
// (`CONTROL_FOTOS_SHARDS_INDEX_KEY`) lleva la lista de shards en uso; al
// acercarse un shard a un tamaño holgado (`CONTROL_FOTOS_SHARD_MAX_CHARS`,
// muy por debajo del límite real de Firebase) se crea uno nuevo
// automáticamente. `controlFotosData` sigue siendo un único mapa en
// memoria con TODAS las fotos ya fusionadas de todos los shards — el resto
// de la app (mostrarFotoControlAmpliada, etc.) no necesita saber nada de
// shards, solo lee ese mapa como siempre.
const CONTROL_FOTOS_SHARDS_INDEX_KEY = 'lasala-control-fotos-shards-index';
const CONTROL_FOTOS_SHARD_MAX_CHARS = 6*1024*1024;
let controlFotosShardKeys = [CONTROL_FOTOS_KEY];
let controlFotosData = {};
let controlFotosShardDeId = {};
let controlFotosDataCargada = false;
// forzar=false (a petición de Paula, 2026-08-18: el historial de partida
// tardaba "varios minutos" en abrirse porque volvía a descargar TODAS las
// fotos, varios MB repartidos en shards, cada vez que se pulsaba una
// partida) — con forzar=false, si ya se cargaron una vez en esta sesión no
// se vuelve a pedir nada a la nube. Los sitios que necesitan ver una foto
// recién subida (Check Túnel/Carga) siguen llamando con forzar=true (o sin
// argumento, que por defecto sigue refrescando).
// Carga PEREZOSA (a petición de Paula, 2026-09-04, "¿podemos optimizar aún
// más?"): las fotos de Control ocupan más de 100 shards y cientos de MB;
// antes esta función los descargaba TODOS de golpe la primera vez que se abría Control
// en cada sesión. Ahora solo carga la lista de shards (para saber dónde
// escribir una foto nueva, ver elegirShardParaFoto) y el índice ligero
// id→shard (cargarIndiceFotosPartida, ya existía para el historial de
// partida) — el contenido de cada foto se pide bajo demanda con
// fetchFotoPartidaPorId, solo para las que se ven en pantalla.
async function loadControlFotosData(forzar){
  if(forzar===false && controlFotosDataCargada) return;
  try{
    const idx = await window.storage.get(CONTROL_FOTOS_SHARDS_INDEX_KEY);
    // Si esta lectura falla, idx es null — igual que si el índice de
    // shards no existiera todavía (primer arranque). NO se puede tratar
    // igual: hay ~115 shards reales, y sustituir la lista por el valor por
    // defecto de 1 solo shard haría que elegirShardParaFoto más tarde
    // sobrescribiera CONTROL_FOTOS_SHARDS_INDEX_KEY con esa misma lista
    // truncada, perdiendo la cuenta de más de 100 shards reales (las
    // fotos en sí no se pierden, pero el índice de shards deja de
    // reflejar la realidad y puede acabar reutilizando un shard ya lleno).
    // Se deja controlFotosShardKeys tal cual estuviera (su valor inicial
    // ya es el correcto para un primer arranque genuino) en vez de
    // sobrescribirlo con una suposición. Detectado en la auditoría
    // completa del 2026-09-09.
    if(idx) controlFotosShardKeys = JSON.parse(idx.value);
  }catch(e){}
  await cargarIndiceFotosPartida();
  controlFotosDataCargada = true;
}
// Índice ligero id→shard (2026-08-18, a petición de Paula: el historial de
// partida tardaba "varios minutos" con loadControlFotosData() porque bajaba
// los 29 shards enteros —hasta 10 MB cada uno— solo para mostrar 1 o 2
// fotos). El intento con una ruta anidada de Firebase (shard/id.json) no
// funcionaba porque cada shard se guarda como TEXTO (JSON.stringify dentro
// de otro JSON.stringify, igual que el resto de datos de la app — ver
// mergeDeepPreferLocal/double JSON-encoding), no como objeto real: Firebase
// no puede "entrar" en un string para sacar una clave de dentro. Con este
// índice sabemos DE ANTEMANO en qué shard vive cada id y solo hace falta
// descargar y parsear ESE shard (no los otros 28).
const CONTROL_FOTOS_INDICE_KEY = 'lasala-control-fotos-indice-v1';
let controlFotosIndiceIdShard = null;
async function cargarIndiceFotosPartida(){
  if(controlFotosIndiceIdShard) return controlFotosIndiceIdShard;
  try{
    const r = await window.storage.get(CONTROL_FOTOS_INDICE_KEY);
    controlFotosIndiceIdShard = r ? JSON.parse(r.value) : {};
  }catch(e){ controlFotosIndiceIdShard = {}; }
  return controlFotosIndiceIdShard;
}
// El índice (construido el 2026-08-18 con las fotos existentes hasta esa
// fecha, y mantenido al día por persistControlFotosData en cada foto nueva)
// se trata como la fuente de verdad completa — si un id no aparece ahí es
// que esa línea simplemente no tiene foto. A propósito NO hay ningún
// "por si acaso hago la carga completa de todo": la mayoría de partidas no
// tienen foto, y ese "por si acaso" era justo lo que seguía disparando la
// descarga de los 29 shards en (casi) cada partida — el motivo real de que
// "siguiera tardando igual" después del primer intento de arreglo.
// Cachea TODOS los ids del shard descargado (no solo el que se pidió) — si
// varias fotos visibles a la vez comparten shard (habitual, un shard guarda
// muchas fotos), la primera petición ya deja el resto listas sin una
// descarga por cada una.
// Bug real (2026-09-08, "los check están fallando, no deja moverse por la
// pantalla ni buscar partidas"): un día con muchas fotos (p.ej. 49 líneas)
// disparaba una petición de shard POR CADA línea en CADA repintado, y cada
// foto que llegaba volvía a repintar TODA la pantalla al instante — como
// una foto tarda más que un repintado, el mismo id se volvía a pedir una y
// otra vez antes de que la primera petición terminara. Medido en real:
// 21 repintados completos y 819 peticiones duplicadas en 5 segundos, sin
// que ninguna llegara a completarse — la app se quedaba sin responder
// (scroll y buscador incluidos). Dos arreglos:
// 1) `controlFotosShardEnCurso`: si dos ids piden el mismo shard a la vez,
//    la segunda petición espera la promesa de la primera en vez de lanzar
//    otra descarga igual.
// 2) `programarRepintadoControl`: agrupa todas las fotos que lleguen dentro
//    de una misma ventana de 400ms en UN solo repintado, no uno por foto.
const controlFotosShardEnCurso = {};
async function fetchFotoPartidaPorId(id){
  if(controlFotosData[id]) return controlFotosData[id];
  const indice = await cargarIndiceFotosPartida();
  const shardConocido = indice[id];
  if(!shardConocido) return null;
  if(controlFotosShardEnCurso[shardConocido]) return (await controlFotosShardEnCurso[shardConocido])?.[id] ?? null;
  const promesa = (async ()=>{
    try{
      const r = await window.storage.get(shardConocido);
      if(r){
        const obj = JSON.parse(r.value);
        Object.keys(obj).forEach(otroId=>{ controlFotosData[otroId] = obj[otroId]; controlFotosShardDeId[otroId] = shardConocido; });
        return obj;
      }
    }catch(e){}
    return null;
  })();
  controlFotosShardEnCurso[shardConocido] = promesa;
  try{ return (await promesa)?.[id] ?? null; }
  finally{ delete controlFotosShardEnCurso[shardConocido]; }
}
let controlContentRepintadoPendiente = null;
function programarRepintadoControl(){
  if(controlContentRepintadoPendiente) return;
  controlContentRepintadoPendiente = setTimeout(()=>{
    controlContentRepintadoPendiente = null;
    renderControlContent(document.getElementById('control-overlay'));
  }, 400);
}
// Dispara la carga bajo demanda de la foto de una línea del listado de
// Control si el índice dice que existe y todavía no está en memoria — no
// bloquea el pintado actual, repinta (agrupado) cuando llegue. El propio id
// se marca como "ya pedido" para que repintados de en medio no lo vuelvan a
// solicitar mientras sigue en marcha.
const controlFotosIdsPedidas = new Set();
function cargarFotoControlSiFalta(id){
  if(controlFotosData[id] || !controlFotosIndiceIdShard || !controlFotosIndiceIdShard[id] || controlFotosIdsPedidas.has(id)) return;
  controlFotosIdsPedidas.add(id);
  fetchFotoPartidaPorId(id).then(f=>{
    controlFotosIdsPedidas.delete(id);
    if(f) programarRepintadoControl();
  });
}
async function guardarIndiceFotosPartida(mapaIdShard){
  const url=`${CLOUD_DB_URL}/${encodeURIComponent(CONTROL_FOTOS_INDICE_KEY)}.json`;
  for(let intento=1; intento<=5; intento++){
    try{
      const getRes=await appFetch(url,{headers:{'X-Firebase-ETag':'true'},cache:'no-store'});
      if(!getRes…48607 tokens truncated…rgba(0,0,0,.3)">
      <div style="font-size:15px;font-weight:800;margin-bottom:12px">Editar partida</div>
      <div style="margin-bottom:10px">
        <label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px">Día</label>
        <select id="ecc-dia" style="width:100%;padding:9px 10px;border:1.5px solid var(--border);border-radius:7px;font-size:13px">${generarOpcionesDiaControl(c.dia)}</select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px">Cliente</label>
          <input id="ecc-cliente" type="text" value="${escapar(c.cliente)}" style="width:100%;padding:9px 10px;border:1.5px solid var(--border);border-radius:7px;font-size:13px">
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px">Partida</label>
          <input id="ecc-partida" type="text" value="${escapar(c.partida)}" style="width:100%;padding:9px 10px;border:1.5px solid var(--border);border-radius:7px;font-size:13px">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px">Variedad</label>
          <input id="ecc-variedad" type="text" value="${escapar(c.variedad)}" style="width:100%;padding:9px 10px;border:1.5px solid var(--border);border-radius:7px;font-size:13px">
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px">Nº bandejas</label>
          <input id="ecc-bandejas" type="text" value="${escapar(c.numBandejas)}" style="width:100%;padding:9px 10px;border:1.5px solid var(--border);border-radius:7px;font-size:13px">
        </div>
      </div>
      <div style="margin-bottom:14px">
        <label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px">Invernadero</label>
        <select id="ecc-inv" style="width:100%;padding:9px 6px;border:1.5px solid var(--border);border-radius:7px;font-size:13px">
          <option value="">— Invernadero —</option>
          <optgroup label="Sala 1">${ALL_INV_IDS_SALA1.map(iid=>`<option value="${iid}"${iid===c.invernadero?' selected':''}>INV ${iid}</option>`).join('')}</optgroup>
          <optgroup label="Sala 2">${ALL_INV_IDS.map(iid=>`<option value="${iid}"${iid===c.invernadero?' selected':''}>INV ${iid}</option>`).join('')}</optgroup>
          <optgroup label="Sala 3">${ALL_INV_IDS_SALA3.map(iid=>`<option value="${iid}"${iid===c.invernadero?' selected':''}>INV ${iid}</option>`).join('')}</optgroup>
          <optgroup label="Sala 4">${ALL_INV_IDS_SALA4.map(iid=>`<option value="${iid}"${iid===c.invernadero?' selected':''}>INV ${iid}</option>`).join('')}</optgroup>
          <optgroup label="Sala 5">${ALL_INV_IDS_SALA5.map(iid=>`<option value="${iid}"${iid===c.invernadero?' selected':''}>INV ${iid}</option>`).join('')}</optgroup>
        </select>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button onclick="cerrarEdicionControlBackoffice(this)" style="padding:9px 16px;font-size:12px;background:#f5f5f5;color:#555;border:1px solid #ddd;border-radius:7px;cursor:pointer">Cancelar</button>
        <button onclick="guardarEditarControlCargaCheck('${id}')" style="padding:9px 18px;font-size:12px;font-weight:800;background:#2e7d32;color:#fff;border:none;border-radius:7px;cursor:pointer">Guardar</button>
      </div>
    </div>`;
  mo.style.display = 'flex';
}
async function guardarEditarControlCargaCheck(id){
  const c = controlChecksData.find(x=>x.id===id);
  if(!c) return;
  const diaNuevo = parseInt(document.getElementById('ecc-dia')?.value, 10);
  const diaCambio = !isNaN(diaNuevo) && diaNuevo !== c.dia;
  const dia = isNaN(diaNuevo) ? c.dia : diaNuevo;
  if(diaCambio && bloquearAltaPasadaControlQC(dia))return false;
  const cliente = document.getElementById('ecc-cliente')?.value?.trim() || '';
  const partida = document.getElementById('ecc-partida')?.value?.trim() || '';
  const variedad = document.getElementById('ecc-variedad')?.value?.trim() || '';
  const numBandejas = document.getElementById('ecc-bandejas')?.value?.trim() || '';
  const invernadero = document.getElementById('ecc-inv')?.value || '';
  const saved=await aplicarEditarControlCargaCheck(id, dia, cliente, partida, variedad, numBandejas, invernadero, diaCambio);
  if(saved) volverTrasGuardarDatosControlBackoffice(id);
}
async function aplicarEditarControlCargaCheck(id, dia, cliente, partida, variedad, numBandejas, invernadero, diaCambio, loc){
  const c = controlChecksData.find(x=>x.id===id);
  if(!c) return;
  if(dia!==c.dia && bloquearAltaPasadaControlQC(dia))return false;
  c.dia = dia; c.cliente = cliente; c.partida = partida; c.variedad = variedad;
  c.numBandejas = numBandejas; c.invernadero = invernadero;
  if(loc?.invId&&INV_LAYOUT[loc.invId])c.invId=loc.invId;
  const popup=document.getElementById('control-editar-overlay')||document.getElementById('control-editar-carga-overlay');
  if(popup)popup.style.display='none';
  showToast(diaCambio ? `✓ Línea actualizada y movida a ${riegoDiaLabelCorto(dia)}` : '✓ Línea actualizada');
  renderControlContent(document.getElementById('control-overlay'));
  const qid = encolarAccionOffline('aplicarEditarControlCargaCheck', [id, dia, cliente, partida, variedad, numBandejas, invernadero, diaCambio, loc]);
  marcarControlCheckSucio(id);
  const ok = await persistControlChecksData();
  if(ok){
    desencolarAccion(qid);
    await registrarCambioControlBackoffice(id, 'Editó datos');
  } else avisarGuardadoLocalPendiente(leerColaOffline().length);
  return ok;
}
// A petición de Paula (2026-07-31): la foto debe quedar SIEMPRE asociada a
// su partida/check. Una foto de cámara real puede pesar varios MB en
// base64 — antes se guardaba tal cual, y persistControlChecksData() traga
// los errores en silencio (catch(e){}), así que si el guardado fallaba
// (payload demasiado grande, corte de red en móvil) el técnico veía
// igualmente "✓ Foto guardada" sin que se hubiera guardado nada de verdad.
// Ahora se comprime/redimensiona antes de guardar (mucho más fiable y
// rápido) y cualquier fallo real se avisa con un toast de error en vez de
// tragárselo.
async function handleControlFotoInput(input, id){
  if(!input.files || !input.files[0]) return;
  const file = input.files[0];
  try{
    const resultado = await comprimirImagenParaControl(file);
    if(!resultado){ showToast('✗ No se ha podido leer esa foto — prueba con otra'); return; }
    // Si no se pudo comprimir (formato no soportado en canvas, p.ej. HEIC en
    // algunos navegadores) se sube igualmente el original — la foto nunca se
    // pierde — pero avisamos porque puede pesar varios MB y tardar más en
    // subir/sincronizar con datos móviles.
    if(!resultado.comprimida) showToast('⚠ Foto subida sin comprimir (formato no compatible) — puede pesar más de lo normal');
    aplicarFotoControl(id, resultado.data);
  }catch(e){
    console.error('Error guardando foto de Control:', e);
    showToast('✗ No se ha podido guardar la foto — inténtalo de nuevo');
  }
}
async function aplicarFotoControl(id, fotoB64){
  const c = controlChecksData.find(x=>x.id===id);
  if(!c) return false;
  controlFotosData[id] = fotoB64;
  showToast('✓ Foto guardada');
  renderControlContent(document.getElementById('control-overlay'));
  const qid = encolarAccionOffline('aplicarFotoControl', [id, fotoB64]);
  // A petición de Paula (2026-08-19): "hay veces que hago el check de
  // túnel y solamente al sincronizar se me guarda la foto, no los checks ni
  // la calle" — la foto y el check/calle se guardan en dos sitios distintos
  // (persistControlFotosData/persistControlChecksData), cada uno con su
  // propio intento de red; si el del check fallaba (p.ej. por mala
  // cobertura justo en ese instante) pero el de la foto no, se quedaba la
  // foto sola sin la línea que la sujeta. Ahora, siempre que se guarda una
  // foto, se refuerza también el guardado del check al que pertenece —
  // "sabemos" que existe (ya se comprobó arriba), así que no cuesta nada
  // insistir en persistirlo aquí también.
  const [okFoto, okCheck] = await Promise.all([persistControlFotosData(id), persistControlChecksData([id])]);
  const ok = okFoto && okCheck;
  if(ok){
    desencolarAccion(qid);
    await registrarCambioControlBackoffice(id, 'Actualizó fotografía');
  } else avisarGuardadoLocalPendiente(leerColaOffline().length);
  return ok;
}
// A petición de Paula (2026-08-03): "al subir una foto me aparece error".
// Causa más probable: fotos HEIC (formato por defecto de la cámara de
// iPhone) — muchos navegadores saben MOSTRAR un HEIC en una etiqueta <img>
// pero no siempre saben "dibujarlo" dentro de un <canvas> (drawImage/
// toDataURL), que es lo que hacía fallar aquí SIEMPRE con un error y
// perder la foto entera. Ahora, si la compresión falla por lo que sea
// (formato no soportado, imagen corrupta, lo que sea), en vez de fallar
// se cae a guardar el archivo ORIGINAL sin comprimir — la foto nunca se
// pierde, en el peor de los casos pesa más de lo ideal.
// Devuelve {data, comprimida} — comprimida:false cuando se cayó al original
// sin tocar (para poder avisar al usuario de que esa foto pesa más de lo
// normal), o null si ni siquiera se pudo leer el archivo.
// data trae {f: foto completa (máx 1280px), t: miniatura (máx 320px)} — la
// miniatura es para listados donde se ven varias fotos a la vez (historial
// de partida, fila de Control) y nunca se muestran a tamaño grande; ahorra
// bastante tráfico en móvil frente a bajar la foto completa solo para un
// icono de 64-90px. Si falla la compresión, t y f son el mismo original sin
// tocar (no tiene sentido generar una miniatura de algo que no se pudo leer
// en canvas).
// A petición de Paula (2026-09-09): "a veces se queda pillado y te saca de
// la aplicación" al subir fotos en Túnel y en Carga (las dos pantallas
// llaman a esta misma función). Causa real: el código de antes cargaba la
// foto en un <img> a SU RESOLUCIÓN ORIGINAL antes de reducirla — con las
// cámaras de muchos megapíxeles habituales en Android (48MP o más), solo
// decodificar esa foto puede necesitar varios cientos de MB de memoria, lo
// justo para que el navegador (o la app instalada en el móvil) cierre la
// pestaña de golpe a mitad de subir. Como la sesión ya no se restaura sola
// al reabrir, ese cierre se sentía igual que si la app hubiera "echado" al
// usuario. Ahora se usa createImageBitmap con "resize" como primer intento:
// deja que sea el propio navegador quien decodifique la foto YA acotada a
// un tamaño pequeño, sin llegar a materializar nunca la imagen original
// entera en memoria (solo se pide resizeWidth, nunca los dos lados a la
// vez, para que el navegador calcule el otro lado solo y la foto no salga
// deformada). El recorte final exacto a 1280/320px se hace después, ya
// sobre esa imagen pequeña — mismo resultado de siempre, mucha menos
// memoria de pico. Si el navegador no soporta esto o falla, se cae al
// método anterior (Image+canvas, ahora leyendo con un object URL en vez de
// convertir todo el archivo a base64 antes de tiempo) y, en último caso, al
// archivo original sin comprimir — la foto nunca se pierde.
function comprimirImagenParaControl(file){
  return new Promise((resolve)=>{
    const leerOriginalSinComprimir = () => {
      const readerOriginal = new FileReader();
      readerOriginal.onload = (e2) => resolve({data: {f:e2.target.result, t:e2.target.result}, comprimida:false});
      readerOriginal.onerror = () => resolve(null);
      readerOriginal.readAsDataURL(file);
    };
    const escalarDesde = (source, max, calidad) => {
      let width = source.width, height = source.height;
      if(width > max || height > max){
        const escala = max / Math.max(width, height);
        width = Math.round(width*escala); height = Math.round(height*escala);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(source, 0, 0, width, height);
      return canvas.toDataURL('image/jpeg', calidad);
    };
    const intentarConImagen = () => {
      const objectUrl = URL.createObjectURL(file);
      const limpiar = () => { try{ URL.revokeObjectURL(objectUrl); }catch(e){} };
      const img = new Image();
      img.onerror = () => { limpiar(); leerOriginalSinComprimir(); };
      img.onload = () => {
        try{
          const f = escalarDesde(img, 1280, 0.75);
          const t = escalarDesde(img, 320, 0.6);
          limpiar();
          resolve({data: {f, t}, comprimida:true});
        }catch(err){
          limpiar();
          leerOriginalSinComprimir();
        }
      };
      img.src = objectUrl;
    };
    if(typeof createImageBitmap === 'function'){
      createImageBitmap(file, {resizeWidth:1600, resizeQuality:'medium'}).then(bitmap=>{
        try{
          const f = escalarDesde(bitmap, 1280, 0.75);
          const t = escalarDesde(bitmap, 320, 0.6);
          bitmap.close();
          resolve({data: {f, t}, comprimida:true});
        }catch(err){
          try{ bitmap.close(); }catch(e2){}
          intentarConImagen();
        }
      }).catch(intentarConImagen);
    } else {
      intentarConImagen();
    }
  });
}
// Compatibilidad: las fotos guardadas antes de este cambio son un string
// plano (la foto completa, sin miniatura aparte); las nuevas son
// {f,t}. Estos dos helpers dan igual el resultado correcto en ambos casos.
function fotoSrcCompleta(entry){ return (entry && typeof entry==='object') ? entry.f : entry; }
function fotoSrcMiniatura(entry){ return (entry && typeof entry==='object') ? (entry.t||entry.f) : entry; }
// A petición de Paula (2026-08-27): buscar una partida en Partidas y
// Específicos SIN importar en qué semana esté colocada en el mapa —
// busca en TODAS las líneas de Túnel (que es donde vive la calle real de
// cada partida) y abre directamente su historial completo (mismo modal
// que al tocarla en el mapa: check de entrada/salida, calle, fotos,
// riegos/plaguicidas/específicos aplicados) — desde ahí, el botón
// "Editar calle" permite cambiarla sin tener que localizarla a mano en
// el mapa primero.
function buscarPartidaGlobal(){
  const valor = document.getElementById('partidas-buscar-partida')?.value?.trim();
  if(!valor){ showToast('Escribe un número de partida'); return; }
  const encontrada = controlChecksData.filter(c=>c.tipo==='tunel' && c.partida).find(c=>c.partida.toLowerCase().includes(valor.toLowerCase()));
  if(!encontrada){ showToast('No se ha encontrado ninguna partida con ese número'); return; }
  mostrarHistorialPartida(encontrada.id);
}
function buscarControlPartida(tipo){
  const valor = document.getElementById('control-buscar-partida')?.value?.trim();
  if(!valor){ showToast('Escribe un número de partida'); return; }
  const encontrada = controlChecksData.filter(c=>c.tipo===tipo && c.partida).find(c=>c.partida.toLowerCase().includes(valor.toLowerCase()));
  if(!encontrada){ showToast('No se ha encontrado ninguna línea con esa partida'); return; }
  controlQuincenaOffset = Math.max(0, Math.floor((encontrada.dia-15)/14));
  controlDiaSel = encontrada.dia;
  // Si la partida encontrada pertenece a un grupo con guiones (misma partida
  // repetida en varios días), hay que forzar que se muestre EXACTAMENTE ese
  // guión — si no, el grupo seguía mostrando el guión que estuviera activo
  // de antes (otro día distinto), la tarjeta buscada nunca llegaba a
  // pintarse y el resaltado/scroll no encontraba nada, aunque el aviso
  // dijera "encontrada" — a petición de Paula, 2026-08-10.
  controlGuionActivo[tipo+'|'+encontrada.partida] = encontrada.id;
  renderControlContent(document.getElementById('control-overlay'));
  showToast(`✓ Encontrada — ${riegoDiaLabelCorto(encontrada.dia)}`);
  setTimeout(()=>{
    const el = document.getElementById('control-card-'+encontrada.id);
    if(el){
      el.scrollIntoView({behavior:'smooth', block:'center'});
      el.style.outline = '3px solid #ffd54f';
      setTimeout(()=>{ if(el) el.style.outline = ''; }, 2500);
    }
  }, 150);
}
// A petición de Paula (2026-08-04): "cuando colocas las calles pueden haber
// varios tramos" — una partida puede repartirse en varias calles no
// contiguas del mismo invernadero (p.ej. C/1-2 y C/10-12), así que el modal
// de Asignar calle ahora permite añadir/quitar tramos (mismo patrón de filas
// repetibles que ya usa Riego, ver agregarTramoRow/leerTramosDesdeDOM). El
// primer tramo se sigue guardando también en calleDesde/calleHasta (alias de
// compatibilidad) para no romper los sitios que aún leen esos dos campos
// sueltos (p.ej. calleAsignadaParaPartida en Trabajos → Pinzar); c.tramos
// (array completo) es ahora la fuente de verdad para mostrar todos los tramos.
// A petición de Paula (2026-08-27): "asignar calle" tiene que poder repartir
// una misma partida en VARIOS invernaderos, cada uno con sus propios tramos
// de calles — no solo varios tramos dentro de un único invernadero, como
// hasta ahora. acGrupos = [{invId, tramos:[{desde,hasta}]}, ...], un grupo
// por invernadero. Al guardar, el primer grupo actualiza la línea original;
// cada grupo adicional crea una copia nueva de la partida (mismo cliente/
// variedad/nº bandejas/observaciones) en ese otro invernadero — mismo
// patrón que ya usa separarPartidaEnCalles para repartir una partida en
// varias calles, aquí aplicado a varios invernaderos.
let acGrupos = [];
function mostrarAsignarCalleControl(id){
  const c = controlChecksData.find(x=>x.id===id);
  if(!c) return;
  const mo = getOrCreateOverlay('control-calle-overlay');
  // z-index explícito (2026-08-27): ahora también se puede abrir desde
  // encima del historial de partida (Partidas → Buscar partida → Editar
  // calle) — sin esto, si este overlay ya existía en el DOM de antes (uso
  // previo desde Control), quedaría detrás del historial en vez de encima.
  mo.style.zIndex = 2200;
  const raiz=raizQCPartida(c);
  if(!raiz||raiz.tipo!=='tunel')return;
  acGrupos=[raiz,...otrasUbicacionesPartida(raiz.id)].map(x=>({
    id:x.id,invId:x.invId,
    tramos:(x.tramos&&x.tramos.length?x.tramos:[{desde:x.calleDesde,hasta:x.calleHasta}])
      .filter(t=>t.desde!=null).map(t=>({...t}))
  }));
  mo.innerHTML = `
    <div style="background:#fff;border-radius:14px;max-width:420px;width:100%;padding:1.5rem;box-shadow:0 8px 40px rgba(0,0,0,.3);max-height:88vh;overflow-y:auto">
      <div style="font-size:15px;font-weight:800;margin-bottom:4px">Editar ubicación</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:12px">Puedes corregir ubicaciones anteriores. No se generan nuevas inspecciones QC.</div>
      <div id="ac-grupos-wrap"></div>
      <button type="button" onclick="agregarGrupoInvAC()" style="width:100%;padding:8px;font-size:11px;font-weight:700;background:#f0f4f8;border:1.5px dashed #1558a0;border-radius:6px;cursor:pointer;color:#1558a0;margin-bottom:14px">+ Añadir invernadero</button>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button onclick="this.closest('.modal-overlay-dyn').style.display='none'" style="padding:9px 16px;font-size:12px;background:#f5f5f5;color:#555;border:1px solid #ddd;border-radius:7px;cursor:pointer">Cancelar</button>
        <button onclick="guardarAsignarCalleControl('${id}')" style="padding:9px 18px;font-size:12px;font-weight:800;background:#1558a0;color:#fff;border:none;border-radius:7px;cursor:pointer">Guardar</button>
      </div>
    </div>`;
  mo.style.display = 'flex';
  renderGruposInvAC();
}
function renderGruposInvAC(){
  const wrap = document.getElementById('ac-grupos-wrap');
  if(!wrap) return;
  const opcionesInv = sel => `<option value="">— Invernadero —</option>
    <optgroup label="Sala 1">${ALL_INV_IDS_SALA1.map(iid=>`<option value="${iid}"${iid===sel?' selected':''}>INV ${iid}</option>`).join('')}</optgroup>
    <optgroup label="Sala 2">${ALL_INV_IDS.map(iid=>`<option value="${iid}"${iid===sel?' selected':''}>INV ${iid}</option>`).join('')}</optgroup>
    <optgroup label="Sala 3">${ALL_INV_IDS_SALA3.map(iid=>`<option value="${iid}"${iid===sel?' selected':''}>INV ${iid}</option>`).join('')}</optgroup>
    <optgroup label="Sala 4">${ALL_INV_IDS_SALA4.map(iid=>`<option value="${iid}"${iid===sel?' selected':''}>INV ${iid}</option>`).join('')}</optgroup>
    <optgroup label="Sala 5">${ALL_INV_IDS_SALA5.map(iid=>`<option value="${iid}"${iid===sel?' selected':''}>INV ${iid}</option>`).join('')}</optgroup>`;
  wrap.innerHTML = acGrupos.map((g,gi)=>{
    const calles = g.invId && INV_LAYOUT[g.invId] ? [...INV_LAYOUT[g.invId].row1, ...INV_LAYOUT[g.invId].row2].sort((a,b)=>a-b) : [];
    const opts = sel => calles.map(cc=>`<option value="${cc}"${cc===sel?' selected':''}>${cc}</option>`).join('');
    const tramos = g.tramos.length ? g.tramos : [{desde:calles[0], hasta:calles[0]}];
    return `
    <div class="ac-grupo" data-gi="${gi}" data-ubic-id="${g.id||''}" style="border:1.5px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px;background:#fafbfa">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <select class="ac-grupo-inv" onchange="cambiarInvGrupoAC(${gi}, this.value)" style="flex:1;padding:9px 10px;border:1.5px solid var(--border);border-radius:7px;font-size:13px">${opcionesInv(g.invId)}</select>
        ${acGrupos.length>1 ? `<button type="button" onclick="quitarGrupoInvAC(${gi})" title="Quitar este invernadero" style="width:32px;height:32px;background:#fdecea;color:#c62828;border:1px solid #f3c2bd;border-radius:6px;cursor:pointer;font-size:13px;flex-shrink:0">✕</button>` : ''}
      </div>
      ${g.invId ? `
      <div class="ac-tramos-rows">
        ${tramos.map((t,ti)=>`
          <div class="ac-tramo-row" style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;margin-bottom:6px">
            <select class="ac-tramo-desde" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:7px;font-size:13px">${opts(t.desde)}</select>
            <select class="ac-tramo-hasta" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:7px;font-size:13px">${opts(t.hasta)}</select>
            ${tramos.length>1 ? `<button type="button" onclick="quitarTramoRowAC(${gi},${ti})" style="width:30px;background:#fdecea;color:#c62828;border:1px solid #f3c2bd;border-radius:6px;cursor:pointer;font-size:12px">✕</button>` : '<span></span>'}
          </div>`).join('')}
      </div>
      <button type="button" onclick="agregarTramoRowAC(${gi})" style="width:100%;padding:5px;font-size:10px;font-weight:700;background:#fff;border:1.5px dashed #a8c4e8;border-radius:6px;cursor:pointer;color:#1558a0">+ Añadir tramo en este invernadero</button>` : ''}
    </div>`;
  }).join('');
}
// Lee del DOM el estado actual de TODOS los grupos (invernadero + sus
// tramos) — se llama antes de cualquier operación que reordene/modifique
// acGrupos, para no perder lo que el usuario ya haya tocado en pantalla.
function leerGruposDesdeDOMAC(){
  return Array.from(document.querySelectorAll('.ac-grupo')).map(div=>({
    id:div.dataset.ubicId||'',
    invId: div.querySelector('.ac-grupo-inv')?.value || '',
    tramos: Array.from(div.querySelectorAll('.ac-tramo-row')).map(row=>({
      desde: parseInt(row.querySelector('.ac-tramo-desde').value, 10),
      hasta: parseInt(row.querySelector('.ac-tramo-hasta').value, 10)
    }))
  }));
}
function agregarGrupoInvAC(){
  acGrupos = leerGruposDesdeDOMAC();
  acGrupos.push({id:'',invId:'', tramos:[]});
  renderGruposInvAC();
}
function quitarGrupoInvAC(gi){
  acGrupos = leerGruposDesdeDOMAC();
  if(acGrupos[gi]?.id && !confirm('¿Retirar ubicación del mapa? El control QC se conserva.'))return;
  acGrupos.splice(gi,1);
  renderGruposInvAC();
}
function cambiarInvGrupoAC(gi, invId){
  acGrupos = leerGruposDesdeDOMAC();
  const calles = invId && INV_LAYOUT[invId] ? [...INV_LAYOUT[invId].row1, ...INV_LAYOUT[invId].row2].sort((a,b)=>a-b) : [];
  acGrupos[gi] = {id:acGrupos[gi].id,invId,tramos:invId?[{desde:calles[0],hasta:calles[0]}]:[]};
  renderGruposInvAC();
}
function agregarTramoRowAC(gi){
  acGrupos = leerGruposDesdeDOMAC();
  const invId = acGrupos[gi].invId;
  const calles = invId && INV_LAYOUT[invId] ? [...INV_LAYOUT[invId].row1, ...INV_LAYOUT[invId].row2].sort((a,b)=>a-b) : [];
  acGrupos[gi].tramos.push({desde:calles[0], hasta:calles[0]});
  renderGruposInvAC();
}
function quitarTramoRowAC(gi, ti){
  acGrupos = leerGruposDesdeDOMAC();
  acGrupos[gi].tramos.splice(ti,1);
  renderGruposInvAC();
}

/* Ocupación adicional: vinculada al QC original, no nueva inspección. */
function raizQCPartida(c){
  return c?.tipo==='ubicacion'?
    controlChecksData.find(x=>x.id===c.qcOrigenId&&x.tipo==='tunel')||null:c;
}
function otrasUbicacionesPartida(id){
  return controlChecksData.filter(x=>x.tipo==='ubicacion'&&x.qcOrigenId===id)
    .sort((a,b)=>(a.ordenUbicacion||0)-(b.ordenUbicacion||0));
}
function partidaParaPintar(c){
  if(c?.tipo!=='ubicacion')return c;
  const r=raizQCPartida(c);
  return r?{...r,...c,partida:r.partida,clienteVariedad:r.clienteVariedad,
    numBandejas:r.numBandejas,dia:r.dia,creadoEn:r.creadoEn}:c;
}
function nuevoIdUbicacion(){
  return 'ubicacion_'+Date.now()+'_'+Math.random().toString(36).slice(2,10);
}
function validarUbicaciones(grupos){
  if(!Array.isArray(grupos)||!grupos.length){showToast('Falta una ubicación');return null;}
  const inv=new Set(),res=[];
  for(const g of grupos){
    const lay=INV_LAYOUT[g.invId];
    if(!lay||inv.has(g.invId)){showToast('Invernadero inválido o repetido');return null;}
    inv.add(g.invId);
    const calles=[...lay.row1,...lay.row2];
    if(!g.tramos?.length){showToast('Selecciona calles');return null;}
    const tr=[];
    for(const t of g.tramos){
      const a=Number(t.desde),b=Number(t.hasta);
      if(!Number.isInteger(a)||!Number.isInteger(b)||!calles.includes(a)||!calles.includes(b)){
        showToast('Calle inválida');return null;
      }
      tr.push({desde:Math.min(a,b),hasta:Math.max(a,b)});
    }
    res.push({id:g.id||'',invId:g.invId,tramos:tr});
  }
  return res;
}
async function guardarAsignarCalleControl(id){
  const r=raizQCPartida(controlChecksData.find(x=>x.id===id));
  if(!r||r.tipo!=='tunel')return false;
  const g=validarUbicaciones(leerGruposDesdeDOMAC());
  if(!g)return false;
  const actuales=otrasUbicacionesPartida(r.id);
  g.slice(1).forEach(x=>{if(!actuales.some(e=>e.id===x.id))x.id=nuevoIdUbicacion();});
  return aplicarEditarUbicacionesPartida(r.id,g,
    'edicion_'+Date.now()+'_'+Math.random().toString(36).slice(2,8));
}
// Compatibilidad: la cola anterior no vuelve a clonar registros Túnel.
async function aplicarAsignarCalleControl(id,invId,tramos){
  const raiz=raizQCPartida(controlChecksData.find(x=>x.id===id));
  if(!raiz)return false;
  return aplicarEditarUbicacionesPartida(raiz.id,[{id:raiz.id,invId,tramos},
    ...otrasUbicacionesPartida(raiz.id).map(x=>({id:x.id,invId:x.invId,tramos:x.tramos}))]);
}
async function aplicarAsignarCalleControlMulti(id,grupos){
  const r=raizQCPartida(controlChecksData.find(x=>x.id===id));
  if(!r)return false;
  return aplicarEditarUbicacionesPartida(r.id,(grupos||[]).map((g,i)=>({...g,
    id:i===0?r.id:(g.id||'ubicacion_'+r.id.replace(/[^A-Za-z0-9_-]/g,'_')+'_'+i)
  })));
}
async function aplicarEditarUbicacionesPartida(id,grupos,marca){
  const r=raizQCPartida(controlChecksData.find(x=>x.id===id));
  if(!r||r.tipo!=='tunel')return false;
  const g=validarUbicaciones(grupos);
  if(!g)return false;
  const anteriores=otrasUbicacionesPartida(r.id);
  const antes=[r,...anteriores].map(x=>({invId:x.invId,
    tramos:(x.tramos||[{desde:x.calleDesde,hasta:x.calleHasta}]).map(t=>({...t}))}));
  const ids=new Set();
  for(const x of g.slice(1)){
    if(!x.id||x.id===r.id)x.id=nuevoIdUbicacion();
    if(ids.has(x.id)||controlChecksData.some(e=>e.id===x.id&&
       !(e.tipo==='ubicacion'&&e.qcOrigenId===r.id))){
      showToast('Conflicto de ubicación');return false;
    }
    ids.add(x.id);
  }
  r.invId=g[0].invId;r.tramos=g[0].tramos.map(t=>({...t}));
  r.calleDesde=r.tramos[0].desde;r.calleHasta=r.tramos[0].hasta;
  const dirty=new Set([r.id]);
  g.slice(1).forEach((x,i)=>{
    let a=controlChecksData.find(e=>e.id===x.id&&e.tipo==='ubicacion');
    if(!a){a={id:x.id,tipo:'ubicacion',qcOrigenId:r.id,
        creadoEn:new Date().toISOString()};controlChecksData.push(a);}
    a.invId=x.invId;a.tramos=x.tramos.map(t=>({...t}));
    a.calleDesde=x.tramos[0].desde;a.calleHasta=x.tramos[0].hasta;
    a.dia=r.dia;a.partida=r.partida;a.ordenUbicacion=i+1;
    dirty.add(a.id);
  });
  for(const a of anteriores){
    if(!ids.has(a.id)){
      controlChecksData=controlChecksData.filter(x=>x.id!==a.id);
      dirty.add(a.id);
    }
  }
  const despues=g.map(x=>({invId:x.invId,tramos:x.tramos.map(t=>({...t}))}));
  if(JSON.stringify(antes)!==JSON.stringify(despues)&&
     !(marca&&(r.historialUbicaciones||[]).some(h=>h.marca===marca))){
    r.historialUbicaciones=[...(r.historialUbicaciones||[]),{
      marca:marca||'ubicacion_'+Date.now(),fecha:new Date().toISOString(),
      usuario:typeof currentUser==='string'?currentUser:currentUser?.email||currentUser?.nombre||'Usuario',
      antes,despues
    }];
  }
  const modal=document.getElementById('control-calle-overlay');
  if(modal)modal.style.display='none';
  showToast('✓ Ubicaciones guardadas ('+g.length+')');
  if(document.getElementById('control-overlay')?.style.display==='flex')
    renderControlContent(document.getElementById('control-overlay'));
  if(document.getElementById('partidas-overlay')?.style.display==='flex'){
    partidasSalaSel=salaDeInv(g[0].invId);partidasInvSel=g[0].invId;
    partidasSemanaOffset=partidasSemanaDeFecha(riegoDiaToDate(r.dia));
    renderPartidasMapaContent(document.getElementById('partidas-overlay'));
  }
  if(document.getElementById('partidas-historial-overlay')?.style.display==='flex')
    mostrarHistorialPartida(controlChecksData.some(x=>x.id===window.__ultimaFichaPartidaId)?
      window.__ultimaFichaPartidaId:r.id);
  const qid=encolarAccionOffline('aplicarEditarUbicacionesPartida',[r.id,g,marca]);
  dirty.forEach(marcarControlCheckSucio);
  const ok=await persistControlChecksData();
  if(ok)desencolarAccion(qid);else avisarGuardadoLocalPendiente(leerColaOffline().length);
  return ok;
}
function mostrarEditarControlCheck(id){
  const c = controlChecksData.find(x=>x.id===id);
  if(!c) return;
  const mo = getOrCreateOverlay('control-editar-overlay');
  const escapar = s => String(s==null?'':s).replace(/"/g,'&quot;');
  mo.innerHTML = `
    <div style="background:#fff;border-radius:14px;max-width:420px;width:100%;padding:1.5rem;box-shadow:0 8px 40px rgba(0,0,0,.3)">
      <div style="font-size:15px;font-weight:800;margin-bottom:12px">Editar partida</div>
      <div style="margin-bottom:10px">
        <label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px">Día</label>
        <select id="ec-dia" style="width:100%;padding:9px 10px;border:1.5px solid var(--border);border-radius:7px;font-size:13px">${generarOpcionesDiaControl(c.dia)}</select>
      </div>
      <label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px">Cliente y variedad</label>
      <input id="ec-cliente-variedad" type="text" value="${escapar(c.clienteVariedad)}" style="width:100%;padding:9px 10px;border:1.5px solid var(--border);border-radius:7px;font-size:13px;margin-bottom:10px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px">Partida</label>
          <input id="ec-partida" type="text" value="${escapar(c.partida)}" style="width:100%;padding:9px 10px;border:1.5px solid var(--border);border-radius:7px;font-size:13px">
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:4px">Nº bandejas</label>
          <input id="ec-bandejas" type="text" value="${escapar(c.numBandejas)}" style="width:100%;padding:9px 10px;border:1.5px solid var(--border);border-radius:7px;font-size:13px">
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button onclick="cerrarEdicionControlBackoffice(this)" style="padding:9px 16px;font-size:12px;background:#f5f5f5;color:#555;border:1px solid #ddd;border-radius:7px;cursor:pointer">Cancelar</button>
        <button onclick="guardarEditarControlCheck('${id}')" style="padding:9px 18px;font-size:12px;font-weight:800;background:#2e7d32;color:#fff;border:none;border-radius:7px;cursor:pointer">Guardar</button>
      </div>
    </div>`;
  mo.style.display = 'flex';
}
async function guardarEditarControlCheck(id){
  const c = controlChecksData.find(x=>x.id===id);
  if(!c) return;
  const diaNuevo = parseInt(document.getElementById('ec-dia')?.value, 10);
  const diaCambio = !isNaN(diaNuevo) && diaNuevo !== c.dia;
  const dia = isNaN(diaNuevo) ? c.dia : diaNuevo;
  if(diaCambio && bloquearAltaPasadaControlQC(dia))return false;
  const clienteVariedad = document.getElementById('ec-cliente-variedad')?.value?.trim() || '';
  const partida = document.getElementById('ec-partida')?.value?.trim() || '';
  const numBandejas = document.getElementById('ec-bandejas')?.value?.trim() || '';
  const saved=await aplicarEditarControlCheck(id, dia, clienteVariedad, partida, numBandejas, diaCambio);
  if(saved) volverTrasGuardarDatosControlBackoffice(id);
}
async function aplicarEditarControlCheck(id, dia, clienteVariedad, partida, numBandejas, diaCambio, loc, cliente, variedad){
  const c = controlChecksData.find(x=>x.id===id);
  if(!c) return;
  if(dia!==c.dia && bloquearAltaPasadaControlQC(dia))return false;
  c.dia = dia; c.clienteVariedad = clienteVariedad; c.partida = partida; c.numBandejas = numBandejas;
  if(cliente&&variedad){c.cliente=cliente;c.variedad=variedad;}
  if(loc?.invId&&INV_LAYOUT[loc.invId]){c.invId=loc.invId;c.tramos=[{desde:loc.desde,hasta:loc.hasta}];c.calleDesde=loc.desde;c.calleHasta=loc.hasta;}
  const popup=document.getElementById('control-editar-overlay');if(popup)popup.style.display='none';
  showToast(diaCambio ? `✓ Línea actualizada y movida a ${riegoDiaLabelCorto(dia)}` : '✓ Línea actualizada');
  renderControlContent(document.getElementById('control-overlay'));
  const qid = encolarAccionOffline('aplicarEditarControlCheck', [id, dia, clienteVariedad, partida, numBandejas, diaCambio, loc, cliente, variedad]);
  marcarControlCheckSucio(id);
  const ok = await persistControlChecksData();
  if(ok){
    desencolarAccion(qid);
    await registrarCambioControlBackoffice(id, 'Editó datos');
  } else avisarGuardadoLocalPendiente(leerColaOffline().length);
  return ok;
}
async function toggleControlCheckOpcion(id, categoriaKey, opcionKey){
  const c = controlChecksData.find(x=>x.id===id);
  if(!c) return;
  c[categoriaKey] = c[categoriaKey] || {};
  const nuevoValor = !c[categoriaKey][opcionKey];
  await aplicarControlCheckOpcion(id, categoriaKey, opcionKey, nuevoValor);
}
async function aplicarControlCheckOpcion(id, categoriaKey, opcionKey, valor){
  const c = controlChecksData.find(x=>x.id===id);
  if(!c) return;
  c[categoriaKey] = c[categoriaKey] || {};
  c[categoriaKey][opcionKey] = valor;
  // Marca de presencia en Carga (a petición de Paula, 2026-08-19, para "La
  // Sala en Vivo": "si hay hombres cargando o no") — se aproxima con la
  // misma ventana de 5 min que ya usa Plaguicidas/Específicos: tocar
  // cualquier casilla de una línea de Carga cuenta como "hay actividad
  // ahora mismo" en ese invernadero.
  if(c.tipo==='carga' && c.invId) marcarPresenciaInvernadero('carga', c.invId);
  // Repintar ANTES de esperar la red — ver comentario igual en aplicarSanidadEnfermedad.
  renderControlContent(document.getElementById('control-overlay'));
  const qid = encolarAccionOffline('aplicarControlCheckOpcion', [id, categoriaKey, opcionKey, valor]);
  marcarControlCheckSucio(id);
  const ok = await persistControlChecksData();
  if(ok){
    desencolarAccion(qid);
    await registrarCambioControlBackoffice(id, 'Evaluó '+String(categoriaKey).slice(0,30)+' / '+String(opcionKey).slice(0,40)+' = '+(valor?'Sí':'No'));
  } else avisarGuardadoLocalPendiente(leerColaOffline().length);
}
async function guardarControlObservaciones(id, valor){
  const c = controlChecksData.find(x=>x.id===id);
  if(!c) return;
  c.observaciones = valor;
  const qid = encolarAccionOffline('guardarControlObservaciones', [id, valor]);
  marcarControlCheckSucio(id);
  const ok = await persistControlChecksData();
  if(ok){
    desencolarAccion(qid);
    await registrarCambioControlBackoffice(id, 'Actualizó observaciones');
  } else avisarGuardadoLocalPendiente(leerColaOffline().length);
  return ok; // Permite a QC distinguir guardado remoto de cola pendiente.
}
function mostrarFormNuevoControlCheck(tipo,wizard=false){
  if(tipo!=='tunel')return;
  return abrirAltaQC('tunel',wizard);
}
async function aplicarNuevaLineaControl(entry,replay){
  if(!entry||entry.tipo!=='tunel')return false;
  const reentry=!!replay?.qcReplayCreatedAt;
  if(!controlChecksData.find(x=>x.id===entry.id)){
    if(!puedeCrearLineaControlQC(entry.dia)&&
       !altaQCOfflineOriginalValida(entry.dia,replay?.qcReplayCreatedAt)){
      if(reentry)throw Error('QC_TUNEL_COLA_FECHA_NO_VALIDADA');
      bloquearAltaPasadaControlQC(entry.dia);
      return false;
    }
    controlChecksData.push(entry);
  }
  showToast('✓ Línea añadida');
  renderControlContent(document.getElementById('control-overlay'));
  const qid = reentry?null:encolarAccionOffline('aplicarNuevaLineaControl', [entry]);
  marcarControlCheckSucio(entry.id);
  const ok = await persistControlChecksData();
  if(ok){if(qid)desencolarAccion(qid);}
  else if(!reentry) avisarGuardadoLocalPendiente(leerColaOffline().length);
  return ok;
}
async function eliminarControlCheck(id){
  const c = controlChecksData.find(x=>x.id===id);
  if(!c){showToast('No se ha encontrado el registro. Actualiza la lista.');return false;}
  const nombre = clienteVariedadDeCheckControl(c);
  if(!confirm(`¿Eliminar este registro de partida${nombre?' ("'+nombre+'")':''}? Esta acción no se puede deshacer.`)) return false;
  // Antes de actualizar el listado, cerrar la inspección cuantitativa abierta.
  // Respetar su protección de cambios y no eliminar si el usuario cancela la salida.
  if(!(await confirmarSalidaQC()))return false;
  await eliminarControlCheckConfirmado(id);
  return true;
}
async function eliminarControlCheckConfirmado(id){
  // El borrado es idempotente: se aplica en local y se encola si la nube no
  // responde para reintentarlo sin dejar el registro activo en pantalla.
  controlChecksData=controlChecksData.filter(x=>x.id!==id);
  Object.keys(controlGuionActivo).forEach(key=>{
    if(controlGuionActivo[key]===id)delete controlGuionActivo[key];
  });
  showToast('✓ Registro de partida eliminado');
  renderControlContent(document.getElementById('control-overlay'));
  const qid=encolarAccionOffline('eliminarControlCheckConfirmado',[id]);
  marcarControlCheckSucio(id);
  const ok=await persistControlChecksData([id]);
  if(ok)desencolarAccion(qid);else avisarGuardadoLocalPendiente(leerColaOffline().length);
}
