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
  {key:'carga', label:'QC Carga', icon:'ti-truck', color:'linear-gradient(135deg,#f5a35c,#f0715c)', conCheck:true},
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
      if(!getRes.ok) throw new Error('HTTP '+getRes.status);
      const etag=getRes.headers.get('ETag');
      if(!etag) throw new Error('Firebase no devolvió ETag');
      const val=await getRes.json();
      // El índice ya existe en PRD/TEST. Si alguna instalación nueva aún no
      // lo tiene, un null HTTP real sí puede inicializarse de forma segura.
      const fresco=val==null ? {} : JSON.parse(val);
      const unido={...fresco,...mapaIdShard};
      const putRes=await appFetch(url,{
        method:'PUT',
        headers:{'Content-Type':'application/json','if-match':etag},
        body:JSON.stringify(JSON.stringify(unido))
      });
      if(putRes.ok){
        controlFotosIndiceIdShard=unido;
        return true;
      }
      if(putRes.status!==412) throw new Error('HTTP '+putRes.status);
    }catch(e){
      if(intento===5) return false;
    }
    await new Promise(r=>setTimeout(r,120*intento));
  }
  return false;
}
async function elegirShardParaFoto(id, fotoB64Len){
  if(controlFotosShardDeId[id]) return controlFotosShardDeId[id];
  const ultimoConocido=controlFotosShardKeys[controlFotosShardKeys.length-1];
  const cabeEnShard=async key=>{
    try{
      const r=await window.storage.get(key);
      return !!r && (r.value.length+fotoB64Len<CONTROL_FOTOS_SHARD_MAX_CHARS);
    }catch(e){ return false; }
  };
  if(await cabeEnShard(ultimoConocido)) return ultimoConocido;

  // Creación concurrente segura del siguiente shard. Si otro dispositivo
  // crea uno entre GET y PUT, Firebase devuelve 412; se relee el índice y,
  // si el nuevo último shard tiene hueco, se reutiliza en vez de crear otro.
  const url=`${CLOUD_DB_URL}/${encodeURIComponent(CONTROL_FOTOS_SHARDS_INDEX_KEY)}.json`;
  for(let intento=1; intento<=5; intento++){
    try{
      const getRes=await appFetch(url,{headers:{'X-Firebase-ETag':'true'},cache:'no-store'});
      if(!getRes.ok) throw new Error('HTTP '+getRes.status);
      const etag=getRes.headers.get('ETag');
      if(!etag) throw new Error('Firebase no devolvió ETag');
      const val=await getRes.json();
      const lista=val==null ? [CONTROL_FOTOS_KEY] : JSON.parse(val);
      if(!Array.isArray(lista) || !lista.length) return null;
      const union=[...new Set([...lista,...controlFotosShardKeys])];
      const ultimo=union[union.length-1];
      if(ultimo!==ultimoConocido && await cabeEnShard(ultimo)){
        controlFotosShardKeys=union;
        return ultimo;
      }
      const nuevoKey=`lasala-control-fotos-v1-${union.length+1}`;
      const siguiente=[...union,nuevoKey];
      const putRes=await appFetch(url,{
        method:'PUT',
        headers:{'Content-Type':'application/json','if-match':etag},
        body:JSON.stringify(JSON.stringify(siguiente))
      });
      if(putRes.ok){
        controlFotosShardKeys=siguiente;
        return nuevoKey;
      }
      if(putRes.status!==412) throw new Error('HTTP '+putRes.status);
    }catch(e){
      if(intento===5) return null;
    }
    await new Promise(r=>setTimeout(r,120*intento));
  }
  return null;
}
// A diferencia del resto de persist*Data() de la app, este recibe el id de
// la foto que se acaba de tocar — necesita saber CUÁL es para decidir en
// qué shard escribir (solo se reescribe ESE shard, no todos).
async function persistControlFotosData(id){
  try{
    const shardKey=await elegirShardParaFoto(id,JSON.stringify(controlFotosData[id]||'').length);
    if(!shardKey) return false;
    controlFotosShardDeId[id]=shardKey;
    const url=`${CLOUD_DB_URL}/${encodeURIComponent(shardKey)}.json`;

    // Solo se reaplica ESTA foto sobre el shard fresco. ETag evita que dos
    // móviles subiendo fotos al mismo shard se borren mutuamente.
    for(let intento=1; intento<=5; intento++){
      const getRes=await appFetch(url,{headers:{'X-Firebase-ETag':'true'},cache:'no-store'});
      if(!getRes.ok) throw new Error('HTTP '+getRes.status);
      const etag=getRes.headers.get('ETag');
      if(!etag) throw new Error('Firebase no devolvió ETag');
      const val=await getRes.json();
      const cloud=val==null ? {} : JSON.parse(val);
      cloud[id]=controlFotosData[id];
      const putRes=await appFetch(url,{
        method:'PUT',
        headers:{'Content-Type':'application/json','if-match':etag},
        body:JSON.stringify(JSON.stringify(cloud))
      });
      if(putRes.ok){
        const okIndice=await guardarIndiceFotosPartida({[id]:shardKey});
        return !!okIndice;
      }
      if(putRes.status!==412) throw new Error('HTTP '+putRes.status);
      await new Promise(r=>setTimeout(r,120*intento));
    }
    return false;
  }catch(e){ return false; }
}
// Una línea de check: {id, tipo:'tunel'|'carga', dia, clienteVariedad,
// partida, numBandejas, invId, calleDesde, calleHasta, color:{verde,
// amarillo,verdeClaro}, tamano:{grande,pequeno,ok}, sanidad:{ok,enferma},
// flores:{si,no}, raices:{pocaRaiz,raizVariedad}, observaciones, creadoPor,
// creadoEn}. Lista plana, igual que trabajosData — merge-by-id, nunca borra
// sola (ver eliminarControlCheckConfirmado).
const CONTROL_KEY = 'lasala-control-checks-v1'; // legado — array entero, solo se usa para la migración de una vez

// A petición real (2026-08-26), tras perder ~93 líneas marcadas de Check
// Carga con wifi inestable: guardar TODAS las líneas juntas en un único
// documento obligaba a leer-fusionar-escribir el array ENTERO en cada
// guardado — si dos de esas operaciones se cruzaban en el tiempo (un
// guardado en curso + una recarga por reconexión, dos toques seguidos...),
// una podía acabar escribiendo por encima de datos que la otra todavía no
// había terminado de fusionar, perdiendo checks sin avisar de nada. Se
// corrigió un caso concreto de esa carrera, pero la única forma de que sea
// IMPOSIBLE de raíz (no solo improbable) es que cada línea sea su PROPIO
// documento en la nube: cada guardado toca solo el documento de la línea
// que cambió, sin tocar ni depender de las demás — no hay nada que
// fusionar ni nada que se pueda pisar entre dos guardados que no comparten
// documento.
const CONTROL_ITEMS_KEY = 'lasala-control-items-v1';
const CONTROL_ITEMS_V2_INDEX_KEY = 'lasala-control-items-v2-index';
const CONTROL_ITEMS_V2_PREFIX = 'lasala-control-items-v2-';
function controlItemUrl(id){ return `${CLOUD_DB_URL}/${CONTROL_ITEMS_KEY}/${encodeURIComponent(id)}.json`; }
function controlV2QDeDia(dia){
  const n=parseInt(dia,10);
  return Number.isFinite(n) ? Math.max(0, Math.floor((n-15)/14)) : null;
}
function controlV2ShardKey(tipo,q){
  return `${CONTROL_ITEMS_V2_PREFIX}${tipo}-q${q}`;
}
function controlV2ShardDeItem(item){
  if(!item || (item.tipo!=='tunel' && item.tipo!=='carga' && item.tipo!=='ubicacion')) return null;
  const q=controlV2QDeDia(item.dia);
  return q==null ? null : controlV2ShardKey(item.tipo,q);
}
function controlV2ItemUrl(shardKey,id){
  return `${CLOUD_DB_URL}/${encodeURIComponent(shardKey)}/${encodeURIComponent(id)}.json`;
}
let controlV2Index = null;
let controlV2IndexCargadoEn = 0;
let controlV2ShardCargadoEn = {};
let controlV2ShardPorId = new Map();
async function loadControlV2Index(forzar){
  if(forzar===false && controlV2Index && controlV2IndexCargadoEn &&
     (Date.now()-controlV2IndexCargadoEn)<CONTROL_CHECKS_CACHE_TTL_MS) return true;
  try{
    const r=await fetchConReintentos(`${CLOUD_DB_URL}/${CONTROL_ITEMS_V2_INDEX_KEY}.json`);
    const idx=await r.json();
    if(!idx || typeof idx!=='object' || !idx.shards) return false;
    controlV2Index=idx;
    controlV2IndexCargadoEn=Date.now();
    return true;
  }catch(e){ return false; }
}
function controlV2TotalTipo(tipo){
  if(!controlV2Index || !controlV2Index.shards) return null;
  return Object.values(controlV2Index.shards)
    .filter(m=>m && m.tipo===tipo)
    .reduce((sum,m)=>sum+(parseInt(m.count,10)||0),0);
}
async function loadControlChecksSlice(tipo,q,forzar){
  const shardKey=controlV2ShardKey(tipo,q);
  if(forzar===false && controlV2ShardCargadoEn[shardKey] &&
     (Date.now()-controlV2ShardCargadoEn[shardKey])<CONTROL_CHECKS_CACHE_TTL_MS) return true;
  try{
    const r=await fetchConReintentos(`${CLOUD_DB_URL}/${encodeURIComponent(shardKey)}.json`);
    if(!r.ok)throw Error('HTTP '+r.status); // No sobrescribir caché con una respuesta de error.
    const obj=await r.json();
    const cloud=(obj && typeof obj==='object') ? obj : {};

    // Refrescar SOLO este shard. Los dirty locales ganan para no perder una
    // edición en curso mientras llega una lectura fresca de Firebase.
    const dirty=new Set(controlChecksDirtyIds);
    controlChecksData=controlChecksData.filter(t=>
      controlV2ShardPorId.get(t.id)!==shardKey || dirty.has(t.id)
    );
    const map=new Map(controlChecksData.map(t=>[t.id,t]));
    Object.values(cloud).forEach(t=>{
      if(!t || !t.id) return;
      if(!dirty.has(t.id)) map.set(t.id,t);
      controlV2ShardPorId.set(t.id,shardKey);
    });
    controlChecksData=Array.from(map.values());
    controlV2ShardCargadoEn[shardKey]=Date.now();
    // La copia local incluye SOLO referencias del shard recibidas del servidor.
    // No copiar ediciones dirty, ni clientes, fotos, observaciones o contraseñas.
    if(currentUser&&window.QCOfflineOperarios&&navigator.onLine!==false&&
      (currentUserRole==='ADMIN'||currentUserRole==='TECNICO'||
       (currentUserRole==='CARGADOR'&&tipo==='carga')) && (tipo==='tunel'||tipo==='carga')){
      const source=Object.values(cloud).filter(t=>t&&t.tipo===tipo&&
        Number.isInteger(t.dia)&&controlV2QDeDia(t.dia)===q);
      void window.QCOfflineOperarios.save(currentUser,currentUserRole,tipo,q,source)
        .catch(()=>{}); // Nunca bloquear la operación normal por almacenamiento local.
    }
    return true;
  }catch(e){ return false; }
}
// Carga completa de UN SOLO tipo de Control. Necesaria para consumidores
// heredados que buscan una partida por número sin conocer su quincena
// (Trabajos → Mujeres, por ejemplo). Evita descargar el otro tipo entero:
// para calles de trabajos solo hace falta Túnel, nunca Carga.
async function loadControlTipoCompleto(tipo,forzar){
  const okIndice=await loadControlV2Index(false);
  if(!okIndice){
    // Fallback de seguridad si el índice v2 no estuviera disponible.
    await loadControlChecksData(forzar);
    return true;
  }
  const qs=[...new Set(
    Object.values(controlV2Index.shards||{})
      .filter(m=>m && m.tipo===tipo && Number.isFinite(parseInt(m.q,10)))
      .map(m=>parseInt(m.q,10))
  )].sort((a,b)=>a-b);
  if(!qs.length) return true;
  const resultados=await Promise.all(qs.map(q=>loadControlChecksSlice(tipo,q,forzar)));
  return resultados.every(Boolean);
}
// Consumidores que necesitan cruzar Túnel + Carga (por ejemplo Partidas,
// donde la visibilidad semanal depende de la fecha real de Carga) pueden
// cargar ambos tipos completos sin volver al nodo monolítico v1.
async function loadControlCompletoV2(forzar){
  const tunelOk=await loadControlTipoCompleto('tunel',forzar);
  if(!tunelOk) return false;
  const ok=await loadControlTipoCompleto('carga',forzar);
  return ok && await loadControlTipoCompleto('ubicacion',forzar);
}
async function loadControlSeccionSlice(tipo,q,forzar){
  const ok=await loadControlChecksSlice(tipo,q,forzar);
  if(!ok) return false;

  // La mayoría de Carga trae la calle en su propio campo "invernadero".
  // Solo si alguna línea necesita el fallback histórico por nº de partida
  // cargamos Túnel de la misma quincena y, si hace falta, la anterior.
  if(tipo==='carga'){
    const dias=new Set(riegoQuincenaDias(q));
    let pendientes=controlChecksData.filter(c=>
      c.tipo==='carga' && dias.has(c.dia) && c.partida && !calleTramoDeCargaDirecta(c)
    );
    if(pendientes.length){
      await loadControlChecksSlice('tunel',q,forzar);
      pendientes=pendientes.filter(c=>!calleTramoDeCarga(c));
      if(pendientes.length && q>0) await loadControlChecksSlice('tunel',q-1,forzar);
    }
  }
  return true;
}
async function actualizarControlV2IndexConteos(shardKeys){
  const claves=[...new Set((shardKeys||[]).filter(Boolean))];
  if(!claves.length) return true;
  try{
    const conteos={};
    await Promise.all(claves.map(async key=>{
      const r=await appFetch(`${CLOUD_DB_URL}/${encodeURIComponent(key)}.json?shallow=true`, {cache:'no-store'});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const v=await r.json();
      conteos[key]=(v && typeof v==='object') ? Object.keys(v).length : 0;
    }));

    const url=`${CLOUD_DB_URL}/${CONTROL_ITEMS_V2_INDEX_KEY}.json`;
    for(let intento=1; intento<=4; intento++){
      const r=await appFetch(url,{headers:{'X-Firebase-ETag':'true'},cache:'no-store'});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const etag=r.headers.get('ETag');
      const idx=await r.json();
      if(!etag || !idx || typeof idx!=='object') return false;
      if(!idx.shards) idx.shards={};
      for(const key of claves){
        const m=/^lasala-control-items-v2-(tunel|carga|ubicacion)-q(\d+)$/.exec(key);
        if(!m) continue;
        const tipo=m[1], q=parseInt(m[2],10), k=tipo+'|'+q;
        idx.shards[k]={...(idx.shards[k]||{}),key,tipo,q,count:conteos[key]};
      }
      const put=await appFetch(url,{
        method:'PUT',
        headers:{'Content-Type':'application/json','if-match':etag},
        body:JSON.stringify(idx)
      });
      if(put.ok){
        controlV2Index=idx;
        controlV2IndexCargadoEn=Date.now();
        return true;
      }
      if(put.status!==412) return false;
    }
  }catch(e){}
  return false;
}
// Escritura dual durante la transición: v1 se conserva para los módulos
// heredados y v2 se mantiene sincronizado para que Control pueda leer shards.
// El shard anterior se recuerda al cargar cada línea; así mover de día/quincena
// o borrar elimina también la copia v2 antigua.
async function guardarControlItemAtomico(id, item){
  const shardAnterior=controlV2ShardPorId.get(id)||null;
  const shardNuevo=item ? controlV2ShardDeItem(item) : null;
  try{
    if(item===null){
      await fetchConReintentos(controlItemUrl(id), { method:'DELETE' });
      if(shardAnterior) await fetchConReintentos(controlV2ItemUrl(shardAnterior,id), { method:'DELETE' });
    } else {
      await fetchConReintentos(controlItemUrl(id), {
        method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(item)
      });
      if(shardAnterior && shardAnterior!==shardNuevo){
        await fetchConReintentos(controlV2ItemUrl(shardAnterior,id), { method:'DELETE' });
      }
      if(shardNuevo){
        await fetchConReintentos(controlV2ItemUrl(shardNuevo,id), {
          method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(item)
        });
      }
    }

    if(item===null) controlV2ShardPorId.delete(id);
    else if(shardNuevo) controlV2ShardPorId.set(id,shardNuevo);
    if(shardAnterior!==shardNuevo) actualizarControlV2IndexConteos([shardAnterior,shardNuevo]);
    return true;
  }catch(e){ return false; }
}
// Ids de líneas que han cambiado en memoria desde el último guardado con
// éxito — cada punto que muta controlChecksData (toggle de check,
// observaciones, nueva línea, borrado...) añade aquí el/los id(s) que tocó
// justo antes de llamar a persistControlChecksData(). Guardar solo relee
// este conjunto, así que no hace falta que cada sitio recuerde pasar nada.
let controlChecksDirtyIds = new Set();
function marcarControlCheckSucio(id){ controlChecksDirtyIds.add(id); }
// Caché de 30s (a petición de Paula, 2026-09-04, "¿podemos optimizar aún
// más?" tras el ahorro de datos de Riego/Tareas/Fotos) — este nodo pesa
// ~7MB (el más pesado de toda la app) y se recargaba entero cada vez que se
// abría Control, Partidas, Trabajos→Mujeres o Sala en Vivo, aunque se
// hubiera cargado hace segundos. Mismo patrón que RIEGO_DATA_CACHE_TTL_MS:
// forzar===false reutiliza si es reciente; los sitios que releen antes de
// fusionar un guardado siguen llamando SIN argumento (van siempre a la nube).
let controlChecksDataCargadaEn = 0;
const CONTROL_CHECKS_CACHE_TTL_MS = 30000;
async function loadControlChecksData(forzar){
  if(forzar===false && controlChecksDataCargadaEn && (Date.now()-controlChecksDataCargadaEn)<CONTROL_CHECKS_CACHE_TTL_MS) return;
  try{
    const res = await fetchConReintentos(`${CLOUD_DB_URL}/${CONTROL_ITEMS_KEY}.json`);
    const obj = await res.json();
    if(obj && Object.keys(obj).length){
      // Fusiona con lo que ya hubiera en memoria (gana lo local) en vez de
      // sustituir el array entero — si en este preciso instante hay algún
      // id marcado como "sucio" (un guardado todavía en el aire, ver
      // marcarControlCheckSucio), esta recarga NO puede pisarlo, porque el
      // objeto local con esa edición sigue siendo el que queda en el mapa.
      const map = {};
      Object.values(obj).forEach(t=>{
        map[t.id]=t;
        const shard=controlV2ShardDeItem(t);
        if(shard) controlV2ShardPorId.set(t.id,shard);
      });
      controlChecksData.forEach(t=>{ if(controlChecksDirtyIds.has(t.id)) map[t.id]=t; });
      controlChecksData = Object.values(map);
      controlChecksDataCargadaEn = Date.now();
      return;
    }
    // Todavía no existe la colección nueva — migración de una vez desde el
    // array-blob viejo (si lo hay), repartiendo cada línea en su propio
    // documento para que a partir de ahora ya se guarde de forma atómica.
    const r = await window.storage.get(CONTROL_KEY);
    // Si esta lectura falla, r es null — igual que si el blob viejo ya no
    // existiera. Antes se hacía controlChecksData = [] y se marcaba la
    // caché: se vaciaba en pantalla lo que ya estuviera cargado y encima se
    // daba por bueno 30s. No borra nada en la nube (los checks se guardan
    // como documentos atómicos), pero dejaba la pantalla en blanco sin
    // motivo. Se sale sin tocar nada (auditoría 2026-09-11).
    if(!r) return;
    const viejo = JSON.parse(r.value);
    if(viejo.length){
      await Promise.all(viejo.map(item => guardarControlItemAtomico(item.id, item)));
    }
    controlChecksData = viejo;
    controlChecksDataCargadaEn = Date.now();
  }catch(e){}
}
// ids opcional: si se pasa, guarda SOLO esos documentos (lo normal — cada
// sitio que muta controlChecksData marca su propio id con
// marcarControlCheckSucio ANTES de llamar aquí). Si se omite, cae en los
// ids marcados como "sucios" desde el último guardado — pensado como red
// de seguridad, nunca hace falta pasarlo a mano salvo casos excepcionales.
async function persistControlChecksData(ids){
  const objetivo = ids && ids.length ? ids : Array.from(controlChecksDirtyIds);
  if(!objetivo.length) return true;
  controlChecksDirtyIds = new Set([...controlChecksDirtyIds].filter(id=>!objetivo.includes(id)));
  const resultados = await Promise.all(objetivo.map(id=>{
    const item = controlChecksData.find(c=>c.id===id);
    return guardarControlItemAtomico(id, item || null); // null = ya no existe en local -> borrar en la nube
  }));
  const ok = resultados.every(Boolean);
  if(!ok){
    objetivo.forEach(id=>controlChecksDirtyIds.add(id)); // reintentar en el próximo guardado
    avisarFalloGuardado();
  }
  return ok;
}
// ════════════════════════════════════════════════════════════════
// GUARDADO SIN CONEXIÓN para Check Túnel/Carga (a petición de Paula,
// 2026-08-04): en vez de guardar una "foto" entera de los datos para
// reenviarla luego (arriesga pisar cambios de otro dispositivo hechos
// mientras se estaba offline), se guarda solo la ACCIÓN concreta
// (marcar tal check, tal observación...). Al volver la conexión, antes de
// reaplicarla se relee lo último de la nube (loadControlChecksData) y la
// acción se reaplica sobre esos datos frescos — el único riesgo que queda
// es que dos personas toquen EXACTAMENTE el mismo campo mientras una está
// sin cobertura, el mismo riesgo que ya existe hoy si dos guardan casi a
// la vez, no uno nuevo. Antes de reaplicar se reconstruye Túnel + Carga desde
// los shards v2 (loadControlCompletoV2), no desde el nodo monolítico v1.
// Las acciones se guardan como "aplicar valor X"
// (no "alternar/toggle") para que reaplicarlas sea idempotente — si se
// reaplicara un toggle dos veces por error, revertiría el cambio.
const OFFLINE_QUEUE_KEY = 'lasala-offline-queue-v1';
function leerColaOffline(){
  try{ return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)||'[]'); }catch(e){ return []; }
}
// A petición de Paula (2026-08-19): "hago +200 cambios y al sincronizar no
// aparecen todos, encima dice 0 pendientes" — causa real: localStorage tiene
// un límite (unos 5-10 MB según el móvil) y esta cola guarda CADA acción
// pendiente, incluidas las fotos en base64 (cientos de KB cada una) de
// aplicarFotoControl. Con 200 checks + varias fotos de por medio, la cola
// podía superar ese límite; el intento de guardarla entonces fallaba
// (QuotaExceededError) y se tragaba en silencio — la acción se perdía sin
// dejar rastro, pero como el resto del flujo seguía normal, no se avisaba de
// nada: parecía que se había guardado ("0 pendientes") cuando en realidad
// nunca llegó a quedar registrada para reintentar.
function guardarColaOffline(cola){
  try{ localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(cola)); return true; }
  catch(e){ avisarFalloGuardado(); return false; }
}
// A petición de Paula (2026-08-04): "¿no puedes hacer que aunque se cierre la
// app se guarden?" — antes, la acción solo se guardaba en la cola local
// DESPUÉS de que el intento de red hubiera terminado y fallado; si el móvil
// cerraba la app del todo mientras ese intento aún estaba en curso (esperando
// los reintentos), el cambio no llegaba a encolarse y se perdía sin más. Ahora
// cada acción se escribe en la cola INMEDIATAMENTE (antes de intentar la red),
// y se retira de la cola solo si el guardado tiene éxito — así, aunque la app
// se cierre a medio intento, la acción ya está en localStorage y se reproduce
// la próxima vez que se abra (ver procesarColaOffline). No se avisa con el
// banner naranja en este punto (solo cuando el guardado realmente falla) para
// no mostrarlo de forma optimista en cada guardado normal con conexión.
function encolarAccionOffline(fn, args){
  const cola = leerColaOffline();
  const qid = 'q_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
  cola.push({qid, fn, args, t: new Date().toLocaleString('es-ES')});
  guardarColaOffline(cola);
  return qid;
}
function desencolarAccion(qid){
  guardarColaOffline(leerColaOffline().filter(a=>a.qid!==qid));
}
function avisarGuardadoLocalPendiente(n){
  let b = document.getElementById('aviso-fallo-guardado');
  if(!b){
    b = document.createElement('div');
    b.id = 'aviso-fallo-guardado';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;text-align:center;padding:12px 16px;font-size:13px;font-weight:800';
    document.body.appendChild(b);
  }
  b.style.background = '#c47f00';
  b.style.color = '#fff';
  b.innerHTML = `📴 Sin conexión — ${n} cambio${n===1?'':'s'} guardado${n===1?'':'s'} en este dispositivo, se sincronizará${n===1?'':'n'} solo${n===1?'':'s'} en cuanto vuelva la señal.`;
  b.style.display = 'block';
}
// Solo funciones "aplicar valor concreto" (no toggles) son seguras de
// reaplicar — registradas aquí para poder reaplicarlas por nombre desde la
// cola guardada en localStorage. Los nombres de función están disponibles
// aunque se declaren más abajo en el archivo (hoisting de "function" — a
// diferencia de "const", da igual el orden).
const ACCIONES_OFFLINE_REPLAYABLES = {
  aplicarControlCheckOpcion,
  aplicarSanidadEnfermedad,
  guardarControlObservaciones,
  eliminarControlCheckConfirmado,
  aplicarAsignarCalleControl,
  aplicarAsignarCalleControlMulti,
  aplicarEditarUbicacionesPartida,
  aplicarNuevaLineaControlCarga,
  aplicarNuevaLineaControl,
  aplicarEditarControlCargaCheck,
  aplicarEditarControlCheck,
  aplicarFotoControl,
  aplicarSalidaPartida,
  aplicarIntercambioPartidas,
  aplicarMoverPartidaACalle,
  aplicarColocarPartidaEnFila,
  aplicarSepararPartidaEnCalles,
  aplicarInsercionPartidaMapa
};
// A petición de Paula (2026-08-05): "ayer realizamos varios checks de túnel y
// ponía que se estaban sincronizando y ya no salen" — bug real encontrado:
// esta función vaciaba la cola ENTERA de golpe (guardarColaOffline([])) ANTES
// de intentar reaplicar nada. Si la app se cerraba (o el móvil se quedaba sin
// batería/se recargaba solo) mientras la recarga fresca de Control o el
// bucle de reaplicación todavía estaban en marcha, la cola ya estaba vacía en
// localStorage — los cambios pendientes desaparecían sin haberse guardado en
// la nube ni haberse conservado localmente. Mismo fallo de fondo que ya se
// corrigió para cada acción individual (ver aplicarControlCheckOpcion y
// compañía): ahora cada acción original solo se retira de la cola DESPUÉS de
// intentar reaplicarla, una a una — si la app se cierra a mitad, las que
// aún no se han procesado siguen intactas en la cola para la próxima vez.
// A petición de Paula (2026-08-05): "ha subido a 66 cambios" — pulsar
// Sincronizar varias veces seguidas (algo muy natural si no ves que avanza)
// podía lanzar VARIAS pasadas de procesarColaOffline en paralelo; cada pasada
// reencola su propia copia de cada acción antes de reintentarla (ver
// aplicarControlCheckOpcion y compañía) — si dos pasadas solapadas intentan
// la MISMA acción a la vez y ambas fallan (p.ej. por el problema de las fotos
// de 10 MB ya corregido, o simplemente por mala cobertura), cada una deja su
// propia copia sin retirar, duplicando lo pendiente en vez de reducirlo.
// Candado simple para que solo haya una sincronización en marcha.
let sincronizacionEnCurso = false;
async function procesarColaOffline(){
  if(sincronizacionEnCurso) return;
  const cola = leerColaOffline();
  if(!cola.length) return;
  sincronizacionEnCurso = true;
  try{
  showToast(`Sincronizando ${cola.length} cambio${cola.length===1?'':'s'} pendiente${cola.length===1?'':'s'}...`);
  // Forzar lectura fresca de Túnel + Carga v2 antes de reaplicar. No se usa
  // caché porque estas acciones pueden llevar horas/días guardadas offline y
  // deben partir del estado remoto actual. Si falla la reconstrucción, NO se
  // intenta ninguna acción y, sobre todo, NO se retira nada de la cola local.
  const controlOk = await loadControlCompletoV2();
  if(!controlOk){
    showToast(`⚠ No se ha podido leer Control para sincronizar — los ${cola.length} cambios siguen guardados en este dispositivo`);
    avisarGuardadoLocalPendiente(cola.length);
    return;
  }
  // Antes, la entrada original se retiraba SIEMPRE, incluso si la acción no
  // se había podido aplicar: si `accion.fn` no estaba en el mapa de acciones
  // reaplicables, o si la llamada lanzaba una excepción ANTES de que la
  // propia función se volviera a encolar, el cambio desaparecía de la cola
  // sin haberse guardado — y encima salía "✓ Todo sincronizado". Es justo el
  // síntoma que reportó Paula (peón hace checks sin cobertura, sincroniza,
  // ve el tick verde y los checks no están). Ahora solo se retira lo que de
  // verdad se ha podido aplicar, y si algo queda sin aplicar se dice.
  let sinAplicar = 0;
  for(const accion of cola){
    const fn = ACCIONES_OFFLINE_REPLAYABLES[accion.fn];
    if(!fn){ sinAplicar++; continue; } // no se sabe reaplicar: NO se descarta
    let lanzoExcepcion = false;
    try{
      if((accion.fn==='aplicarNuevaLineaControl'||accion.fn==='aplicarNuevaLineaControlCarga')&&accion.args?.length===1){
        // Una línea creada ayer sin conexión se sincroniza con su fecha original
        // si la acción se creó ese día o antes; no se trata de un alta retroactiva.
        // A diferencia de una acción ordinaria, NO duplicamos el cambio en la cola.
        const saved=await fn(accion.args[0],{qcReplayCreatedAt:accion.t});
        if(saved!==true){sinAplicar++;continue;}
      }else {
        const saved=await fn(...accion.args);
        // Si faltara el control original, conservar la acción de ubicación.
        if(['aplicarEditarUbicacionesPartida','aplicarColocarPartidaEnFila','aplicarInsercionPartidaMapa'].includes(accion.fn) && saved!==true){
          sinAplicar++;continue;
        }
      }
    }catch(e){ lanzoExcepcion = true; sinAplicar++; }
    // La propia fn ya gestiona su reintento (vuelve a encolarse con un qid
    // nuevo si falla) — aquí solo se retira la entrada ORIGINAL de esta
    // ronda, nunca antes de haberla intentado, y nunca si lanzó (en ese caso
    // no ha llegado a re-encolarse sola y se perdería).
    if(!lanzoExcepcion) desencolarAccionOriginal(accion);
  }
  const pendientes = leerColaOffline().length;
  if(!pendientes && !sinAplicar){
    showToast('✓ Todo sincronizado');
    ocultarAvisoFalloGuardado();
  } else {
    showToast(`⚠ Quedan ${pendientes||sinAplicar} cambio${(pendientes||sinAplicar)===1?'':'s'} sin sincronizar — siguen guardados en este dispositivo`);
    avisarGuardadoLocalPendiente(pendientes||sinAplicar);
  }
  }finally{
    sincronizacionEnCurso = false;
  }
}
// Botón "Sincronizar" del checklist de Control — fuerza un reintento inmediato
// en vez de esperar al evento 'online' o a reabrir el módulo, y avisa
// claramente si ya no queda nada pendiente (para que se pueda comprobar "a
// mano" cuando hay dudas, en vez de fiarse solo del aviso naranja automático).
async function sincronizarControlManual(){
  if(sincronizacionEnCurso){
    showToast('Ya se está sincronizando, espera un momento...');
    return;
  }
  if(!leerColaOffline().length){
    showToast('✓ No hay cambios pendientes — todo sincronizado');
    return;
  }
  await procesarColaOffline();
  renderControlContent(document.getElementById('control-overlay'));
}
// Mismo botón "Guardar/Sincronizar" que ya tiene Control, pero para
// Partidas — a petición de Paula, 2026-08-11 ("quiero un botón para
// guardar los cambios realizados de calles... en el apartado de
// Partidas"). Los intercambios/movimientos de partidas ya se guardan solos
// en cuanto se hacen (optimista + cola offline, ver
// ACCIONES_OFFLINE_REPLAYABLES), así que este botón no "guarda algo
// pendiente sin guardar" — fuerza un reintento inmediato de la cola offline
// global (misma cola que usa Control/Riego/etc.) para los casos en que un
// guardado se quedó pendiente por falta de conexión, en vez de esperar al
// evento 'online' o a volver a abrir el módulo.
function sincronizarPartidasBtnHTML(){
  const pendientes = leerColaOffline().length;
  return `
    <button onclick="sincronizarPartidasManual()" title="Reintentar sincronización de cambios pendientes" style="padding:8px 16px;border-radius:8px;font-size:12px;font-weight:800;border:1.5px solid ${pendientes>0?'transparent':'rgba(255,255,255,.4)'};cursor:pointer;background:${pendientes>0?'#c47f00':'transparent'};color:#fff;display:flex;align-items:center;gap:6px">
      <i class="ti ti-refresh" style="font-size:14px"></i> Sincronizar${pendientes>0?` (${pendientes})`:''}
    </button>`;
}
async function sincronizarPartidasManual(){
  if(sincronizacionEnCurso){
    showToast('Ya se está sincronizando, espera un momento...');
    return;
  }
  if(!leerColaOffline().length){
    showToast('✓ No hay cambios pendientes — todo guardado');
    return;
  }
  await procesarColaOffline();
  renderPartidasMapaContent(document.getElementById('partidas-overlay'));
}
function desencolarAccionOriginal(accion){
  const cola = leerColaOffline();
  const idx = accion.qid
    ? cola.findIndex(a=>a.qid===accion.qid)
    : cola.findIndex(a=>!a.qid && a.fn===accion.fn && JSON.stringify(a.args)===JSON.stringify(accion.args));
  if(idx>=0){ cola.splice(idx,1); guardarColaOffline(cola); }
}
// El cargador global reanuda esta cola al volver la conexión.
// PDF adjunto por (tipo, día) — objeto plano {`${tipo}|${dia}`: {nombre,
// pdfB64, subidoPor, subidoEn}}, mismo merge superficial que geoData (nunca
// se pisa entero, solo se añade/actualiza la clave que cambia).
// A petición real (2026-08-26): guardar TODOS los PDFs juntos en una única
// clave (CONTROL_PDFS_KEY, la de abajo, ahora solo de lectura por
// compatibilidad) hacía que ese documento fuera creciendo sin parar (ya
// pasaba de 10MB) hasta que Firebase empezó a rechazar la escritura con un
// error 400 — el mismo problema que ya se arregló para las fotos de Control
// (ver [[lasala_control_fotos_shard_2026_08_14]]). Cada PDF nuevo se guarda
// ahora en SU PROPIA clave (CONTROL_PDF_ENTRY_KEY), y un pequeño índice
// (CONTROL_PDFS_INDICE_KEY, solo una lista de "tipo|dia") dice cuáles hay
// que cargar — así cada escritura solo mueve el PDF que cambia, nunca los
// demás.
const CONTROL_PDFS_KEY = 'lasala-control-pdfs-v1'; // legado, solo lectura de migración
const CONTROL_PDFS_INDICE_KEY = 'lasala-control-pdfs-indice-v1';
function controlPdfEntryKey(tipo, dia){ return 'lasala-control-pdf-v1-'+tipo+'-'+dia; }

async function migrarControlPdfLegacyEntradaSiFalta(tipo,dia,valor){
  const url=`${CLOUD_DB_URL}/${encodeURIComponent(controlPdfEntryKey(tipo,dia))}.json`;
  for(let intento=1; intento<=5; intento++){
    try{
      const getRes=await appFetch(url,{headers:{'X-Firebase-ETag':'true'},cache:'no-store'});
      if(!getRes.ok) throw new Error('HTTP '+getRes.status);
      const etag=getRes.headers.get('ETag');
      if(!etag) throw new Error('Firebase no devolvió ETag');
      const actual=await getRes.json();
      if(actual!==null) return true;
      const putRes=await appFetch(url,{
        method:'PUT',
        headers:{'Content-Type':'application/json','if-match':etag},
        body:JSON.stringify(JSON.stringify(valor))
      });
      if(putRes.ok) return true;
      if(putRes.status!==412) throw new Error('HTTP '+putRes.status);
    }catch(e){
      if(intento===5) return false;
    }
    await new Promise(r=>setTimeout(r,120*intento));
  }
  return false;
}

async function fusionarIndiceControlPdfs(claves){
  const url=`${CLOUD_DB_URL}/${encodeURIComponent(CONTROL_PDFS_INDICE_KEY)}.json`;
  for(let intento=1; intento<=5; intento++){
    try{
      const getRes=await appFetch(url,{headers:{'X-Firebase-ETag':'true'},cache:'no-store'});
      if(!getRes.ok) throw new Error('HTTP '+getRes.status);
      const etag=getRes.headers.get('ETag');
      if(!etag) throw new Error('Firebase no devolvió ETag');
      const val=await getRes.json();
      const fresco=val==null ? [] : JSON.parse(val);
      if(!Array.isArray(fresco)) throw new Error('Índice PDF inválido');
      const unido=[...new Set([...fresco,...claves])];
      if(unido.length===fresco.length) return unido;
      const putRes=await appFetch(url,{
        method:'PUT',
        headers:{'Content-Type':'application/json','if-match':etag},
        body:JSON.stringify(JSON.stringify(unido))
      });
      if(putRes.ok) return unido;
      if(putRes.status!==412) throw new Error('HTTP '+putRes.status);
    }catch(e){
      if(intento===5) return null;
    }
    await new Promise(r=>setTimeout(r,120*intento));
  }
  return null;
}
let controlPdfsData = {};
// Carga PEREZOSA (a petición de Paula, 2026-09-04, "¿podemos optimizar aún
// más?"): antes se bajaban las 51 entradas del índice ENTERAS de golpe cada
// vez que se abría Control (cada PDF pesa 250-500KB en base64 → 15-20MB por
// apertura, solo para mostrar el enlace "Ver" del día seleccionado). Ahora
// solo se carga el índice (una lista de claves, <1KB) — el contenido de cada
// PDF se pide bajo demanda con cargarControlPdfDia(), solo para el día que
// se está viendo, y se guarda en memoria para no volver a pedirlo.
let controlPdfsIndice = [];
async function loadControlPdfsData(){
  try{
    const rIndice = await window.storage.get(CONTROL_PDFS_INDICE_KEY);
    // rIndice=null es ambiguo (índice vacío de verdad vs. fallo de red) —
    // si se asumiera "vacío de verdad" sin más, se relanzaría la
    // migración de abajo (pensada para ejecutarse UNA sola vez, hace
    // semanas) y se SOBRESCRIBIRÍA el índice actual con solo las claves
    // del blob viejo, perdiendo cualquier PDF de Túnel/Carga subido desde
    // entonces (el PDF en sí no se pierde, pero deja de aparecer en la
    // app). Se comprueba de forma fiable si la clave realmente no existe
    // (reutilizando esClaveRealmenteVacia, ya usado para USERS/ROLES)
    // antes de decidir — si es solo un fallo de red, se aborta sin tocar
    // nada. Detectado en la auditoría completa del 2026-09-09.
    if(!rIndice && !(await esClaveRealmenteVacia(CONTROL_PDFS_INDICE_KEY))) return;
    let indice = rIndice ? JSON.parse(rIndice.value) : [];
    if(!indice.length){
      // Migración de una sola vez: el blob viejo (todo-en-uno) todavía
      // existe pero el índice nuevo está vacío — se reparte cada entrada en
      // su propia clave y se rellena el índice, así esta migración no hace
      // falta repetirla en cargas futuras.
      const rViejo = await window.storage.get(CONTROL_PDFS_KEY);
      const viejo = rViejo ? JSON.parse(rViejo.value) : {};
      const clavesViejas = Object.keys(viejo);
      if(clavesViejas.length){
      const migrados=await Promise.all(clavesViejas.map(claveTipoDia=>{
        const parts=claveTipoDia.split('|');
        return migrarControlPdfLegacyEntradaSiFalta(parts[0],parts[1],viejo[claveTipoDia]);
      }));
      if(!migrados.every(Boolean)) return;
      const indiceMigrado=await fusionarIndiceControlPdfs(clavesViejas);
      if(!indiceMigrado) return;
      indice=indiceMigrado;
      }
      controlPdfsData = viejo; // ya migrado, el blob viejo cabe entero en memoria de todas formas
      controlPdfsIndice = indice;
      return;
    }
    controlPdfsIndice = indice;
  }catch(e){}
}
// Pide UN solo PDF (tipo|día) si existe en el índice y todavía no está en
// memoria — se llama al pintar el día seleccionado de Control (no bloquea el
// primer pintado: si no está listo aún, se repinta solo cuando llegue).
// `controlPdfsClavesPedidas` + repintado agrupado: mismo arreglo que
// cargarFotoControlSiFalta — sin esto, cada repintado (incluidos los que
// dispara este mismo mecanismo) volvía a pedir el mismo PDF otra vez antes
// de que la petición anterior terminara.
const controlPdfsClavesPedidas = new Set();
async function cargarControlPdfDia(seccionKey, dia){
  const clave = seccionKey+'|'+dia;
  if(controlPdfsData[clave] || !controlPdfsIndice.includes(clave) || controlPdfsClavesPedidas.has(clave)) return;
  controlPdfsClavesPedidas.add(clave);
  try{
    const r = await window.storage.get(controlPdfEntryKey(seccionKey, dia));
    if(r){
      controlPdfsData[clave] = JSON.parse(r.value);
      programarRepintadoControl();
    }
  }catch(e){}
  finally{ controlPdfsClavesPedidas.delete(clave); }
}
async function guardarControlPdf(tipo, dia, nombre, pdfB64){
  try{
    const claveTipoDia=tipo+'|'+dia;
    const valor={nombre,pdfB64,subidoPor:currentUser||'—',subidoEn:new Date().toLocaleString('es-ES')};
    const okPdf=await window.storage.set(controlPdfEntryKey(tipo,dia),JSON.stringify(valor));
    if(!okPdf) return false;

    const url=`${CLOUD_DB_URL}/${encodeURIComponent(CONTROL_PDFS_INDICE_KEY)}.json`;
    let indiceGuardado=null;
    for(let intento=1; intento<=5; intento++){
      const getRes=await appFetch(url,{headers:{'X-Firebase-ETag':'true'},cache:'no-store'});
      if(!getRes.ok) throw new Error('HTTP '+getRes.status);
      const etag=getRes.headers.get('ETag');
      if(!etag) throw new Error('Firebase no devolvió ETag');
      const val=await getRes.json();
      const indice=val==null ? [] : JSON.parse(val);
      if(!Array.isArray(indice)) throw new Error('Índice PDF inválido');
      if(indice.includes(claveTipoDia)){
        indiceGuardado=indice;
        break;
      }
      const siguiente=[...indice,claveTipoDia];
      const putRes=await appFetch(url,{
        method:'PUT',
        headers:{'Content-Type':'application/json','if-match':etag},
        body:JSON.stringify(JSON.stringify(siguiente))
      });
      if(putRes.ok){
        indiceGuardado=siguiente;
        break;
      }
      if(putRes.status!==412) throw new Error('HTTP '+putRes.status);
      await new Promise(r=>setTimeout(r,120*intento));
    }
    if(!indiceGuardado) return false;
    controlPdfsData[claveTipoDia]=valor;
    controlPdfsIndice=indiceGuardado;
    return true;
  }catch(e){
    avisarFalloGuardado();
    return false;
  }
}
let controlSeccion = null;
let controlQuincenaOffset = 0;
let controlDiaSel = null;
// Navegador compartido de fechas QC: Túnel, Carga, Ginés y jornadas vacías.
function renderControlQCDateNav(offset,selected,mode){
  const wizard=mode==='wizard';
  const onPeriod=wizard?'cambiarControlWizardQuincena':'cambiarControlQuincena';
  const onDay=wizard?'seleccionarControlWizardDia':'cambiarControlDia';
  const days=riegoQuincenaDias(offset);
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const period='Quincena '+(offset+1)+' · '+riegoQuincenaLabel(offset);
  const buttons=days.map(d=>{
    const active=d===selected;
    const date=esc(riegoDiaLabelCorto(d)),weekday=esc(riegoDiaSemana(d));
    return '<button type="button" class="qc-date-day'+(active?' is-active':'')+'"'+
      ' data-qc-day="'+d+'" aria-pressed="'+(active?'true':'false')+'"'+
      ' aria-label="'+esc('Seleccionar '+riegoDiaLabelCorto(d)+' · '+riegoDiaSemana(d))+'"'+
      ' onclick="'+onDay+'('+d+')">'+
      '<span class="qc-date-day-date">'+date+'</span>'+
      '<span class="qc-date-day-weekday">'+weekday+'</span></button>';
  }).join('');
  return '<section class="qc-date-nav" data-qc-period="'+offset+'" aria-label="Fechas de control de calidad">'+
    '<div class="qc-date-period">'+
    '<button type="button" class="qc-date-arrow" onclick="'+onPeriod+'(-1)"'+
      (offset<=0?' disabled':'')+' aria-label="Quincena anterior">&#8249;</button>'+
    '<span class="qc-date-period-label">'+esc(period)+'</span>'+
    '<button type="button" class="qc-date-arrow" onclick="'+onPeriod+'(1)"'+
      ' aria-label="Quincena siguiente">&#8250;</button>'+
    '</div>'+
    '<div class="qc-date-days" role="group" aria-label="Seleccionar día">'+buttons+'</div>'+
    '</section>';
}
/* 0.106 QC Túnel: fecha elegible, paneles e impresión; Carga usa navegador anterior. */
function qcFechaHTML(modo){
 const d=(modo==='wizard'?controlWizardDiaSel:controlDiaSel)??riegoDiaDeHoy();
 const iso=fechaLocalISO(riegoDiaToDate(d));
 return `<section class="qc-work-panel qc-work-date" aria-label="Fecha de trabajo">
 <h3 class="qc-work-title"><i class="ti ti-calendar-event"></i> Fecha de trabajo</h3>
 <div class="qc-work-date-controls">
 <button type="button" class="qc-work-date-arrow" ${d<=15?'disabled':''} aria-label="Día anterior" onclick="qcMoverDia(-1,'${modo}')"><i class="ti ti-chevron-left"></i></button>
 <input type="date" class="qc-work-date-input" min="${fechaLocalISO(riegoDiaToDate(15))}" value="${iso}" aria-label="Seleccionar día" onchange="qcSeleccionarFecha(this.value,'${modo}')">
 <button type="button" class="qc-work-date-arrow" aria-label="Día siguiente" onclick="qcMoverDia(1,'${modo}')"><i class="ti ti-chevron-right"></i></button>
 </div></section>`;
}
async function qcSeleccionarFecha(iso,modo){
 const wizard=modo==='wizard',old=wizard?controlWizardDiaSel:controlDiaSel;
 const restore=()=>{const input=document.querySelector('#control-overlay .qc-work-date-input');if(input)input.value=fechaLocalISO(riegoDiaToDate(old??riegoDiaDeHoy()));};
 const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso||''));
 if(!m){restore();return;}
 const f=new Date(+m[1],+m[2]-1,+m[3]);
 if(f.getFullYear()!==+m[1]||f.getMonth()!==+m[2]-1||f.getDate()!==+m[3]){restore();return;}
 const a=new Date(RIEGO_ANCHOR_DATE);a.setHours(0,0,0,0);
 const dia=15+Math.round((f-a)/86400000);
 if(dia<15){restore();return;}
 if(dia===old)return;
 const offset=Math.floor((dia-15)/14);
 let changed=false;
 await navegarControlQC(async()=>{
   const prev=wizard?controlWizardQuincenaOffset:controlQuincenaOffset;
   if(prev!==offset){
     if(!await loadControlSeccionSlice(wizard?'tunel':controlSeccion,offset,false)){avisarFalloCarga();return;}
   }
   if(wizard){controlWizardDiaSel=dia;controlWizardQuincenaOffset=offset;controlWizardNivel='partidas';controlWizardPartidaId=null;controlWizardPaso=0;controlWizardEnfermedades=false;}
   else{controlDiaSel=dia;controlQuincenaOffset=offset;}
   changed=true;
   renderControlContent(document.getElementById('control-overlay'));
 });
 if(!changed)restore();
}
function qcMoverDia(delta,modo){
 const d=(modo==='wizard'?controlWizardDiaSel:controlDiaSel)??riegoDiaDeHoy();
 if(d+delta<15)return;
 return qcSeleccionarFecha(fechaLocalISO(riegoDiaToDate(d+delta)),modo);
}
function qcImprimirDia(){
 const tipo=controlSeccion;
 if(tipo!=='tunel'&&tipo!=='carga')return;
 const dia=controlDiaSel;
 if(!Number.isInteger(dia))return;
 const filtradas=controlLineasFiltradasInv(controlChecksData.filter(c=>c.tipo===tipo&&c.dia===dia),tipo);
 const lista=controlFiltroEstado==='completados'?filtradas.filter(controlLineaFinalizadaQC):controlFiltroEstado==='pendientes'?filtradas.filter(c=>!controlLineaFinalizadaQC(c)):filtradas;
 if(!lista.length){showToast('No hay inspecciones para imprimir.');return;}
 window.__controlListadoActual={titulo:(tipo==='tunel'?'QC Túnel':'QC Carga')+' · '+riegoDiaLabelCorto(dia),lineas:lista};
 imprimirListadoPartidasControl();
}
function qcPanel(title,content,cls){
 return `<section class="qc-work-panel ${cls||''}"><h3 class="qc-work-title">${title}</h3>${content}</section>`;
}
// A petición de Paula (2026-08-04): una misma partida puede repartirse en
// varios "guiones" — el mismo Nº de partida repetido en el PDF en días
// distintos, cada uno con su propio Nº de bandejas (p.ej. la partida
// 26X00664 con 40/5/53 bandejas en los días 61/61/60). Antes cada guión
// generaba su propia línea repetida en el checklist; ahora se muestran
// unidas en UNA sola tarjeta con flechas ‹ › para pasar de un guión a otro,
// indicando "Registro X de N" y fecha/bandejas de cada uno. Cada guión
// sigue siendo su propio documento en controlChecksData (con su propio
// check/foto/observaciones) — esto es solo una agrupación visual.
let controlGuionActivo = {};
let controlGuionCambioPendiente=false;
async function cambiarGuionControl(groupKey, delta){
  if(controlGuionCambioPendiente)return;
  controlGuionCambioPendiente=true;
  try{
  const idxBarra = groupKey.indexOf('|');
  const tipo = groupKey.slice(0, idxBarra), partida = groupKey.slice(idxBarra+1);
  const grupo = controlChecksData.filter(x=>x.tipo===tipo && x.partida===partida).sort((a,b)=>a.dia-b.dia);
  if(!grupo.length) return;
  let idx = grupo.findIndex(x=>x.id===controlGuionActivo[groupKey]);
  if(idx<0) idx = grupo.findIndex(x=>x.dia===controlDiaSel);
  if(idx<0) idx = 0;
  const from=grupo[idx];
  const target=grupo[(idx+delta+grupo.length)%grupo.length];
  if(from.id===target.id)return;
  const navigation=await window.QCOperativo?.prepareRecordSwitch?.(from.id);
  if(navigation?.allowed===false)return; // No abandonar una edición pendiente.
  controlGuionActivo[groupKey] = target.id;
  renderControlContent(document.getElementById('control-overlay'));
  // Cada guión tiene su propia medición y observaciones.
  if(navigation?.reopen)abrirMedicionesControl(target.id);
  }finally{controlGuionCambioPendiente=false;}
}
function renderControlCardConGuionesHTML(grupo, seccion){
  const groupKey = seccion.key+'|'+grupo[0].partida;
  let activo = grupo.find(x=>x.id===controlGuionActivo[groupKey]);
  if(!activo) activo = grupo.find(x=>x.dia===controlDiaSel) || grupo[0];
  controlGuionActivo[groupKey] = activo.id;
  const idx = grupo.indexOf(activo);
  const pagerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:6px 10px;background:#fff3dc;border:1.5px solid #e0c080;border-bottom:none;border-radius:12px 12px 0 0;font-size:11px;font-weight:800;color:#7a5000">
      <button onclick="cambiarGuionControl('${groupKey}',-1)" title="Registro anterior" style="background:none;border:none;font-size:18px;font-weight:900;color:#7a5000;cursor:pointer;padding:0 6px;line-height:1">&#8249;</button>
      <span>Registro ${idx+1} de ${grupo.length} · ${riegoDiaToDate(activo.dia).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit'})} · ${activo.numBandejas||'—'} bandejas</span>
      <button onclick="cambiarGuionControl('${groupKey}',1)" title="Registro siguiente" style="background:none;border:none;font-size:18px;font-weight:900;color:#7a5000;cursor:pointer;padding:0 6px;line-height:1">&#8250;</button>
    </div>`;
  const cardHTML = (seccion.key==='carga' ? renderControlCargaCardHTML(activo, seccion) : renderControlCardHTML(activo, seccion))
    .replace('border-radius:12px;', 'border-radius:0 0 12px 12px;');
  return `<div class="qc-card-guion-group">${pagerHTML}${cardHTML}</div>`;
}
async function controlShowControlModule(){
  // Entrada ligera: el resumen solo necesita el índice v2 (~1 KB). Túnel y
  // Carga cargan después exclusivamente la quincena que el usuario abre.
  // Si el índice no estuviera disponible, se conserva el loader v1 como
  // fallback de seguridad; los módulos heredados siguen usándolo aparte.
  const esCargador=currentUserRole==='CARGADOR';
  controlCargaInvFiltro='';
  controlTunelInvFiltro='';
  const [v2ok] = await Promise.all([
    loadControlV2Index(false),
    ...(esCargador?[]:[loadConteoTutaData(),loadControlInvernaderoData()])
  ]);
  if(!v2ok) await loadControlChecksData(false);

  // CARGADOR puede trabajar en QC Carga, pero no debe entrar al resto
  // de apartados. Su permiso se comprueba también en la API.
  if(esCargador){
    const offset=riegoQuincenaOffsetActual();
    if(!(await loadControlSeccionSlice('carga',offset,false))){
      avisarFalloCarga();return;
    }
    controlSeccion='carga';
    controlQuincenaOffset=offset;
    controlDiaSel=riegoDiaDeHoy();
  }else{
    controlSeccion=null;
  }
  const overlay = getOrCreateOverlay('control-overlay');
  overlay.style.padding = '0';
  renderControlContent(overlay);
  overlay.style.display = 'flex';

  // Una cola offline pendiente necesita reconstruir el estado global antes
  // de reaplicar acciones; es la única excepción deliberada al lazy-load.
  if(leerColaOffline().length) procesarColaOffline();
  Promise.all([loadControlFotosData(false), loadControlPdfsData()]).then(()=>{
    renderControlContent(document.getElementById('control-overlay'));
  });
}
async function seleccionarSeccionControl(sec){
  if(currentUserRole==='CARGADOR' && sec!==null && sec!=='carga')return;
  if(sec===controlSeccion)return;
  return navegarControlQC(async()=>{
    const offset=riegoQuincenaOffsetActual();
    if(sec==='tunel'||sec==='carga'){
      const ok=await loadControlSeccionSlice(sec,offset,false);
      if(!ok){ avisarFalloCarga(); return; }
    }
    controlSeccion=sec;
    if(sec){
      controlQuincenaOffset=offset;
      controlDiaSel=riegoDiaDeHoy();
    }
    if(sec==='tunel'){
      // Solo reiniciar el wizard tras confirmar que podemos abandonar QC.
      controlWizardNivel='dias';
      controlWizardQuincenaOffset=null;
      controlWizardDiaSel=null;
      controlWizardPartidaId=null;
      controlWizardPaso=0;
      controlWizardEnfermedades=false;
      controlWizardVista='partidas';
    }
    if(sec==='conteo_tuta'){
      conteoTutaQuincenaOffset=offset;
      conteoTutaDiaSel=riegoDiaDeHoy();
      conteoTutaVista='datos';
    }
    renderControlContent(document.getElementById('control-overlay'));
  });
}
// La última sección renderizada se usa exclusivamente para restaurar scroll
// dentro de una sección, pero volver arriba al cambiar de apartado.
let controlUltimaSeccionRenderizada = undefined;
let controlQCConfirmandoSalida=false;
let controlQCNavegacionPendiente=false;
async function navegarControlQC(action){
  if(controlQCNavegacionPendiente)return;
  controlQCNavegacionPendiente=true;
  try{
    if(!(await confirmarSalidaQC()))return;
    return await action();
  }finally{controlQCNavegacionPendiente=false;}
}
async function confirmarSalidaQC(){
  if(controlQCConfirmandoSalida)return false;
  controlQCConfirmandoSalida=true;
  try{
    const navigation=await window.QCOperativo?.prepareRecordSwitch?.();
    return navigation?.allowed!==false;
  }finally{controlQCConfirmandoSalida=false;}
}
async function cerrarControlModule(){
  if(controlDesdeBackoffice){
    await volverAlListadoControlBackoffice();
    return;
  }
  if(!(await confirmarSalidaQC()))return;
  const overlay=document.getElementById('control-overlay');
  if(overlay) overlay.style.display='none';
  controlUltimaSeccionRenderizada=undefined;
}
// Navegar a QC local desde la MISMA sesión, incluido el contexto de la PWA.
async function abrirQCOfflineDesdeControl(){
  if(!['ADMIN','TECNICO','CARGADOR'].includes(currentUserRole)||!currentUser)return;
  if(!(await confirmarSalidaQC()))return;
  window.location.assign('qc-offline.html');
}
function renderControlContent(overlay){
  // Protección para actualizaciones desde otras pantallas (p. ej. Partidas).
  if(!overlay) return;
  const wrapAnterior=overlay.querySelector('#control-content-wrap');
  const navAnterior=overlay.querySelector('.control-ui-nav');
  const daysAnterior=overlay.querySelector('.qc-date-days');
  const periodAnterior=overlay.querySelector('.qc-date-nav')?.dataset.qcPeriod;
  const dateScrollAnterior=daysAnterior?.scrollLeft||0;
  const scrollAnterior=wrapAnterior ? wrapAnterior.scrollTop : 0;
  const navScrollAnterior=navAnterior ? navAnterior.scrollLeft : 0;
  const cambioSeccion=controlUltimaSeccionRenderizada!==controlSeccion;
  controlUltimaSeccionRenderizada=controlSeccion;
  const navBtn=s=>{
    const activo=controlSeccion===s.key;
    const pendiente=controlSeccionEsProximamente(s);
    return `<button type="button" class="control-ui-tab${activo?' is-active':''}"
      ${pendiente ? 'disabled aria-disabled="true"' : `onclick="seleccionarSeccionControl('${s.key}')"`}
      ${activo?'aria-current="page"':''}
      title="${pendiente?'Próximamente':s.label}">
      <i class="ti ${s.icon}" aria-hidden="true"></i><span>${s.label}</span>
    </button>`;
  };
  const navHTML=controlSeccion===null ? '' : `<nav class="control-ui-nav" aria-label="Apartados de Control de Calidad">
        ${CONTROL_SECCIONES.filter(s=>currentUserRole!=='CARGADOR'||s.key==='carga').map(navBtn).join('')}
      </nav>`;
  overlay.innerHTML=`
    <div class="control-ui-shell${controlSeccion==='tunel'?' qc-tunel-work':controlSeccion==='carga'?' qc-carga-work':''}">
      <header class="control-ui-header">
        <button type="button" class="control-ui-home" onclick="seleccionarSeccionControl(null)"
          aria-label="Volver al resumen de Control de Calidad" title="Volver al resumen">
          <i class="ti ti-clipboard-check" aria-hidden="true"></i>
          <span>Control de Calidad</span>
        </button>
        <div class="control-ui-header-right">
          ${!controlDesdeBackoffice && ['ADMIN','TECNICO','CARGADOR'].includes(currentUserRole) ? `<button type="button" onclick="abrirQCOfflineDesdeControl()"
            style="background:#1558a0;border:1px solid #a8c4e8;color:#fff;border-radius:7px;font-size:12px;font-weight:800;padding:7px 9px;cursor:pointer;white-space:nowrap"
            title="Consulta local de partidas y borradores QC">Sin conexión</button>` : ''}
          ${controlDesdeBackoffice ? `<button type="button" onclick="volverAlListadoControlBackoffice()"
            style="background:#1558a0;border:1px solid #a8c4e8;color:#fff;border-radius:7px;font-size:12px;font-weight:800;padding:7px 11px;cursor:pointer;white-space:nowrap"
            title="Volver al listado de Control del Backoffice">← Backoffice</button>` : ''}
          ${(controlSeccion==='tunel'||controlSeccion==='carga')?'<button type="button" class="qc-work-print" onclick="qcImprimirDia()" aria-label="Imprimir listado del día" title="Imprimir listado del día"><i class="ti ti-printer" aria-hidden="true"></i></button>':''}
          <span class="control-ui-section-label" aria-live="polite">${controlSeccion ? (CONTROL_SECCIONES.find(s=>s.key===controlSeccion)?.label || '') : 'Resumen'}</span>
          <button type="button" class="control-ui-close" onclick="cerrarControlModule()"
            title="Cerrar Control de Calidad" aria-label="Cerrar Control de Calidad">&times;</button>
        </div>
      </header>
      ${navHTML}
      <main id="control-content-wrap" class="control-ui-content">
        ${controlSeccion===null ? renderControlResumenHTML() : renderControlSeccionHTML(CONTROL_SECCIONES.find(s=>s.key===controlSeccion))}
      </main>
    </div>`;
  const wrapNuevo=overlay.querySelector('#control-content-wrap');
  if(wrapNuevo) wrapNuevo.scrollTop=cambioSeccion ? 0 : scrollAnterior;
  const daysNuevo=overlay.querySelector('.qc-date-days');
  if(daysNuevo){
    if(!cambioSeccion && periodAnterior===overlay.querySelector('.qc-date-nav')?.dataset.qcPeriod){
      daysNuevo.scrollLeft=dateScrollAnterior;
    }else{
      const dayActive=daysNuevo.querySelector('.qc-date-day.is-active');
      if(dayActive)daysNuevo.scrollLeft=Math.max(0,
        dayActive.offsetLeft-(daysNuevo.clientWidth-dayActive.offsetWidth)/2);
    }
  }
  const navNuevo=overlay.querySelector('.control-ui-nav');
  if(navNuevo){
    navNuevo.scrollLeft=cambioSeccion ? 0 : navScrollAnterior;
    if(cambioSeccion){
      const activo=navNuevo.querySelector('.control-ui-tab.is-active');
      if(activo) navNuevo.scrollLeft=Math.max(0,activo.offsetLeft-(navNuevo.clientWidth-activo.offsetWidth)/2);
    }
  }
  // Backoffice: consultar y editar, pero nunca ofrecer la acción Eliminar.
  if(controlDesdeBackoffice){
    overlay.querySelectorAll('[onclick^="eliminarControlCheck"]').forEach(btn=>btn.remove());
  }
}
function renderControlResumenHTML(){
  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px">
      ${CONTROL_SECCIONES.filter(s=>currentUserRole!=='CARGADOR'||s.key==='carga').map(s=>{
        const totalV2 = s.conCheck ? controlV2TotalTipo(s.key) : null;
        const n = s.conCheck ? (totalV2==null ? controlChecksData.filter(c=>c.tipo===s.key).length : totalV2) : null;
        const pendiente=controlSeccionEsProximamente(s);
        return `
        <div ${pendiente?'aria-disabled="true" title="Próximamente"':`onclick="seleccionarSeccionControl('${s.key}')"`}
          style="cursor:${pendiente?'not-allowed':'pointer'};background:${pendiente?'#d8dde3':'linear-gradient(120deg,#2b6fae,#3c80c2 55%,#5b9bd5)'};color:${pendiente?'#68717c':'#fff'};border:1px solid ${pendiente?'#c7cdd5':'transparent'};border-radius:14px;padding:.65rem .9rem;box-shadow:${pendiente?'none':'0 6px 18px rgba(0,0,0,.12)'}">
          <div style='display:flex;align-items:center;gap:8px;min-height:28px'>
            <i class='ti ${s.icon}' style='font-size:19px;opacity:.9;flex-shrink:0'></i>
            <div style='font-size:13px;font-weight:700;line-height:1.25'>${s.label}</div>
          </div>
          ${n!=null ? `<div style='font-size:11px;opacity:.9;margin-top:3px;line-height:1.25'><strong style='font-size:16px'>${n}</strong> ${n===1?'línea registrada':'líneas registradas'}</div>` : (s.tabla ? `<div style='font-size:11px;opacity:.9;margin-top:3px'>Tabla semanal</div>` : `<div style='font-size:11px;opacity:.9;margin-top:3px;font-style:italic'>Próximamente</div>`)}
        </div>`;}).join('')}
    </div>`;
}
// Pantalla alternativa de Check Túnel para pruebas (a petición de Vigueras,
// 2026-09-15): paso a paso, botones grandes para móvil, sin PDF (reservado
// a ADMIN) — ver más abajo, bloque "WIZARD CHECK TÚNEL". De momento solo
// para GINES, antes de decidir si se lanza al resto de técnicos. La vista
// clásica (renderControlChecklistHTML/renderControlCardHTML) no se toca ni
// una coma para nadie, incluido Ginés cuando esta lista esté vacía.
const CONTROL_TUNEL_WIZARD_USUARIOS = [];
let controlWizardNivel = 'dias'; // 'dias' | 'partidas' | 'evaluar'
let controlWizardQuincenaOffset = null;
let controlWizardDiaSel = null;
let controlWizardPartidaId = null;
let controlWizardPaso = 0; // índice dentro de CONTROL_CHECK_CATEGORIAS
let controlWizardEnfermedades = false; // sub-paso de Sanidad→Enferma
let controlWizardVista = 'partidas'; // 'partidas' | 'dashboard' (a petición de Vigueras, 2026-09-15: conservar el dashboard del día también en el wizard)
function renderControlSeccionHTML(seccion){
  if(!seccion) return '';
  if(seccion.tabla) return renderControlConteoTutaHTML(seccion);
  if(seccion.key==='invernadero') return renderControlInvernaderoHTML();
  if(seccion.key==='tunel') return renderControlChecklistHTML(seccion); // 0.106: misma vista para todos; wizard queda histórico inactivo
  if(!seccion.conCheck){
    return `
      <div style="margin-bottom:1.25rem">
        <h2 style="font-size:22px;font-weight:800;color:var(--text);margin-bottom:4px">${seccion.label}</h2>
      </div>
      <div style="text-align:center;padding:3rem;color:var(--muted);font-style:italic;font-size:13px">Próximamente. Dime qué campos debe llevar esta comprobación y lo construyo.</div>`;
  }
  return renderControlChecklistHTML(seccion);
}

// ════════════════════════════════════════════════════════════════
// WIZARD CHECK TÚNEL (pruebas, solo CONTROL_TUNEL_WIZARD_USUARIOS)
// ════════════════════════════════════════════════════════════════
// 3 niveles: 'dias' (solo los días, nada más) → 'partidas' (lista de la
// partidas de ese día, botones grandes) → 'evaluar' (una categoría a la
// vez, botón grande por opción, avanza sola al tocar). Reutiliza los
// mismos datos y funciones de guardado que la vista clásica
// (controlChecksData, aplicarControlCheckOpcion, toggleControlSanidadEnfermedad,
// guardarControlObservaciones, mostrarAsignarCalleControl) para que lo que
// marque Ginés aquí se vea exactamente igual en la vista de ADMIN.
async function cambiarControlWizardQuincena(delta){
  const siguiente=Math.max(0,(controlWizardQuincenaOffset||0)+delta);
  if(siguiente===controlWizardQuincenaOffset)return;
  return navegarControlQC(async()=>{
    const ok=await loadControlChecksSlice('tunel',siguiente,false);
    if(!ok){avisarFalloCarga();return;}
    controlWizardQuincenaOffset=siguiente;
    controlWizardDiaSel=riegoQuincenaDias(siguiente)[0];
    controlWizardNivel='partidas';
    controlWizardPartidaId=null;
    renderControlContent(document.getElementById('control-overlay'));
  });
}
async function cambiarControlWizardVista(v){
  if(v===controlWizardVista)return;
  return navegarControlQC(()=>{
    controlWizardVista=v;
    renderControlContent(document.getElementById('control-overlay'));
  });
}
async function seleccionarControlWizardDia(dia){
  const siguiente=parseInt(dia,10);
  if(siguiente===controlWizardDiaSel&&controlWizardNivel==='partidas')return;
  return navegarControlQC(()=>{
    controlWizardDiaSel=siguiente;
    controlWizardNivel='partidas';
    controlWizardPartidaId=null;
    renderControlContent(document.getElementById('control-overlay'));
  });
}
function abrirControlWizardPartida(id){
  controlWizardPartidaId = id;
  controlWizardNivel = 'evaluar';
  controlWizardPaso = 0;
  controlWizardEnfermedades = false;
  renderControlContent(document.getElementById('control-overlay'));
}
function volverControlWizardALista(){
  controlWizardNivel = 'partidas';
  controlWizardPartidaId = null;
  controlWizardPaso = 0;
  controlWizardEnfermedades = false;
  renderControlContent(document.getElementById('control-overlay'));
}
async function seleccionarOpcionControlWizard(id, categoriaKey, opcionKey){
  if(categoriaKey==='sanidad'){
    controlWizardEnfermedades = (opcionKey==='enferma');
    if(!controlWizardEnfermedades) controlWizardPaso++;
  } else {
    controlWizardPaso++;
  }
  await aplicarControlCheckOpcion(id, categoriaKey, opcionKey, true);
}
function avanzarControlWizardTrasEnfermedades(){
  controlWizardEnfermedades = false;
  controlWizardPaso++;
  renderControlContent(document.getElementById('control-overlay'));
}
function retrocederControlWizard(){
  if(controlWizardEnfermedades) controlWizardEnfermedades = false;
  else if(controlWizardPaso>0) controlWizardPaso--;
  else { controlWizardNivel = 'partidas'; controlWizardPartidaId = null; }
  renderControlContent(document.getElementById('control-overlay'));
}
function guardarControlWizardYVolver(){
  controlWizardNivel = 'partidas';
  controlWizardPartidaId = null;
  controlWizardPaso = 0;
  controlWizardEnfermedades = false;
  renderControlContent(document.getElementById('control-overlay'));
}
function botonAtrasWizardHTML(){
  return `<button onclick="retrocederControlWizard()" style="width:100%;margin-top:14px;padding:16px;border-radius:14px;font-size:15px;font-weight:700;background:#fff;border:2px solid var(--border);color:var(--muted);cursor:pointer">‹ Atrás</button>`;
}
function wizardCabeceraPartidaHTML(c){
  const escapar = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return `
    <button onclick="volverControlWizardALista()" style="background:none;border:none;color:#1558a0;font-size:14px;font-weight:700;cursor:pointer;padding:10px 4px;margin-bottom:6px">‹ Lista de partidas</button>
    <div style="text-align:center;margin-bottom:20px">
      <div style="font-size:13px;font-weight:700;color:var(--muted)">${escapar(c.clienteVariedad)||''}</div>
      <div style="font-size:26px;font-weight:900;color:#1558a0">${escapar(c.partida)||'— Sin partida —'}</div>
    </div>`;
}

/* 0.99. Presentación única de metadatos QC (no altera documentos Túnel/Carga).
 * Túnel usa invId y tramos; Carga interpreta NN-inicio-fin solo para mostrar.
 * No deducir lados A/B si el parte de Carga no los identifica.
 */
function controlQCInfoVisual(c){
  const tunel=c.tipo==='tunel';
  const tramo=tunel?calleTramoDeTunel(c):calleTramoDeCarga(c);
  const inv=tunel?String(c.invId||'').trim():String(tramo?.invId||'').trim();
  const tramos=tunel
    ?((Array.isArray(c.tramos)&&c.tramos.length)?c.tramos:[{desde:c.calleDesde,hasta:c.calleHasta}])
    :(tramo?[{desde:tramo.desde,hasta:tramo.hasta}]:[]);
  const calles=tramos.map(t=>{
    const desde=Number(t.desde),hasta=t.hasta==null?desde:Number(t.hasta);
    if(!Number.isInteger(desde)||desde<0||!Number.isInteger(hasta)||hasta<0)return '';
    return desde===hasta?String(desde):Math.min(desde,hasta)+'–'+Math.max(desde,hasta);
  }).filter(Boolean).join(', ');
  return {inv:inv?'INV '+inv:'—',calles:calles||'—'};
}
function renderControlIdentidadQC(c,estadoWizard=false){
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
  const tunel=c.tipo==='tunel';
  const principal=tunel?c.clienteVariedad:c.cliente;
  const inspeccionada=qcEstadoCuantificado(c);
  const legacyCompletada=estadoWizard&&!inspeccionada&&controlLineaCompletada(c);
  return '<div class="qc-card-ident">'
    +'<strong class="qc-card-partida">'+(esc(c.partida)||'Sin partida')+'</strong>'
    +(inspeccionada?'<span class="qc-card-medido">✓ Inspeccionado</span>':
      legacyCompletada?'<span class="qc-card-medido">✓ Completado</span>':'')
    +'<div class="qc-card-cliente">'+(esc(principal)||'Sin cliente / variedad')+'</div>'
    +(!tunel&&c.variedad?'<div class="qc-card-variedad">'+esc(c.variedad)+'</div>':'')
    +'</div>';
}
function renderControlDatosQC(c){
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
  const ubicacion=controlQCInfoVisual(c);
  return '<div class="qc-card-facts qc-card-facts-ordenado">'
    +'<span><i class="ti ti-box" aria-hidden="true"></i> Bandejas declaradas: <strong>'+ (esc(c.numBandejas)||'—')+'</strong></span>'
    +'<span><i class="ti ti-building-warehouse" aria-hidden="true"></i> Invernadero: <strong>'+esc(ubicacion.inv)+'</strong></span>'
    +'<span><i class="ti ti-map-pin" aria-hidden="true"></i> Calle: <strong>'+esc(ubicacion.calles)+'</strong></span>'
    +'</div>';
}
/* 1.00. Mismo botón operativo de inspección en Túnel y Carga. */
function renderControlAbrirInspeccionHTML(c){
  return `<button type="button" class="qc-card-inspect" onclick="abrirMedicionesControl('${c.id}')"><i class="ti ti-clipboard-check" aria-hidden="true"></i> Abrir inspección</button>`;
}
function renderControlWizardFilaHTML(c, guionInfo){
  const escapar = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const completada = controlLineaCompletada(c);
  return `
    <div class="qc-card-compact qc-wizard-ficha" style="border:2px solid ${completada?'#3fa864':'#d0dfec'}">
      <div class="qc-card-main">
        ${renderControlIdentidadQC(c,true)}
        ${guionInfo?`<div class="qc-card-guion-info">Guión ${guionInfo.n} de ${guionInfo.total}</div>`:''}
        ${renderControlDatosQC(c)}
        ${renderControlAbrirInspeccionHTML(c)}
      </div>
      ${anclaCuantificacionControlHTML(c)}
    </div>`;
}
function renderControlWizardFinalHTML(c){
  const escapar = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  cargarFotoControlSiFalta(c.id);
  const fotoHTML = controlFotosData[c.id]
    ? `<div style="text-align:center;margin-bottom:10px"><img src="${fotoSrcMiniatura(controlFotosData[c.id])}" onclick="mostrarFotoControlAmpliada('${c.id}')" style="max-height:100px;border-radius:12px;border:2px solid var(--border);cursor:pointer"></div>`
    : '';
  return `
    <div style="max-width:480px;margin:0 auto">
      ${wizardCabeceraPartidaHTML(c)}
      <div style="text-align:center;font-size:44px;margin-bottom:4px">✅</div>
      <div style="text-align:center;font-size:17px;font-weight:800;color:#2e7d32;margin-bottom:24px">Evaluación completa</div>
      <div data-qc-legacy-extras="${c.id}" style="margin-bottom:16px">
        <div style="font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:7px">Observaciones (opcional)</div>
        <input type="text" value="${escapar(c.observaciones)}" placeholder="Escribe aquí si hace falta..."
          onchange="guardarControlObservaciones('${c.id}', this.value)"
          style="width:100%;padding:16px;border:2px solid var(--border);border-radius:12px;font-size:15px">
      </div>
      <div data-qc-legacy-extras="${c.id}" style="margin-bottom:24px;text-align:center">
        ${fotoHTML}
        <label style="display:inline-flex;align-items:center;gap:8px;padding:15px 24px;background:#eaf5ea;border:2px solid #a5d6a7;border-radius:12px;cursor:pointer;font-size:14px;font-weight:700;color:#2e7d32">
          <i class="ti ti-camera" style="font-size:18px"></i> ${controlFotosData[c.id]?'Cambiar foto':'Añadir foto'}
          <input type="file" accept="image/*" capture="environment" style="display:none" onchange="handleControlFotoInput(this,'${c.id}')">
        </label>
      </div>
      ${botonCuantificacionControlHTML(c)}
      <button onclick="guardarControlWizardYVolver()" style="width:100%;padding:24px;border-radius:16px;font-size:19px;font-weight:800;background:#2e7d32;color:#fff;border:none;cursor:pointer">Guardar</button>
      ${botonAtrasWizardHTML()}
    </div>`;
}
function renderControlWizardEvaluarHTML(c){
  if(controlWizardEnfermedades){
    return `
      <div style="max-width:480px;margin:0 auto">
        ${wizardCabeceraPartidaHTML(c)}
        <div style="font-size:13px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:16px;text-align:center">¿Qué tiene? (puedes marcar varias)</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${SANIDAD_ENFERMEDADES.map(e=>{
            const activo = !!(c.sanidadEnfermedades && c.sanidadEnfermedades[e.key]);
            return `<button onclick="toggleControlSanidadEnfermedad('${c.id}','${e.key}')" style="padding:20px;border-radius:14px;font-size:16px;font-weight:800;cursor:pointer;border:2px solid transparent;background:${activo?'#c62828':'#fdece5'};color:${activo?'#fff':'var(--text)'}">${activo?'✓ ':''}${e.label}</button>`;
          }).join('')}
        </div>
        <button onclick="avanzarControlWizardTrasEnfermedades()" style="width:100%;margin-top:22px;padding:22px;border-radius:16px;font-size:18px;font-weight:800;background:#2e7d32;color:#fff;border:none;cursor:pointer">Continuar →</button>
        ${botonAtrasWizardHTML()}
      </div>`;
  }
  if(controlWizardPaso >= CONTROL_CHECK_CATEGORIAS.length) return renderControlWizardFinalHTML(c);
  const cat = CONTROL_CHECK_CATEGORIAS[controlWizardPaso];
  const opcionesHTML = cat.opciones.map(o=>{
    const activo = !!(c[cat.key] && c[cat.key][o.key]);
    return `<button onclick="seleccionarOpcionControlWizard('${c.id}','${cat.key}','${o.key}')" style="padding:28px 16px;border-radius:16px;font-size:20px;font-weight:800;cursor:pointer;border:2px solid transparent;background:${activo?cat.gradiente:cat.tinte};color:${activo?'#fff':'var(--text)'}">${activo?'✓ ':''}${o.label}</button>`;
  }).join('');
  return `
    <div style="max-width:480px;margin:0 auto">
      ${wizardCabeceraPartidaHTML(c)}
      <div style="text-align:center;margin-bottom:8px">
        <span style="font-size:12px;font-weight:800;color:var(--muted)">Paso ${controlWizardPaso+1} de ${CONTROL_CHECK_CATEGORIAS.length}</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:center;gap:9px;margin-bottom:18px">
        <i class="ti ${cat.icon}" style="font-size:24px"></i>
        <span style="font-size:21px;font-weight:800;color:var(--text)">${cat.label}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px">${opcionesHTML}</div>
      ${botonAtrasWizardHTML()}
    </div>`;
}
function renderControlTunelWizardHTML(){
  const seccion = CONTROL_SECCIONES.find(s=>s.key==='tunel');
  if(controlWizardQuincenaOffset==null) controlWizardQuincenaOffset = riegoQuincenaOffsetActual();
  const diasQ = riegoQuincenaDias(controlWizardQuincenaOffset);
  if(controlWizardDiaSel==null || !diasQ.includes(controlWizardDiaSel))
    controlWizardDiaSel=diasQ.includes(riegoDiaDeHoy())?riegoDiaDeHoy():diasQ[0];

  const cabeceraHTML=qcFechaHTML('wizard');
  const filtroInvHTML=renderControlFiltroYAltaHTML('tunel',controlWizardDiaSel,true);

  if(controlWizardDiaSel==null){
    return cabeceraHTML + filtroInvHTML + `<div style="text-align:center;padding:2.5rem 1rem;color:var(--muted);font-style:italic">Elige un día para ver sus partidas.</div>`;
  }

  if(controlWizardNivel==='evaluar' && controlWizardPartidaId){
    const c = controlChecksData.find(x=>x.id===controlWizardPartidaId);
    if(c) return cabeceraHTML + qcPanel('Inspección',renderControlWizardEvaluarHTML(c),'qc-work-inspections');
    controlWizardNivel = 'partidas';
    controlWizardPartidaId = null;
  }

  // Misma agrupación en guiones que la vista clásica (partida repetida en
  // varios días → 1 tarjeta), sin tocar renderControlChecklistHTML — ver
  // [[lasala_control_tunel_intocable]].
  const listaDia = controlLineasFiltradasInv(controlChecksData.filter(c=>c.tipo==='tunel' && c.dia===controlWizardDiaSel),'tunel');
  const gruposYaPintados = new Set();
  const filasHTML = listaDia.map(c=>{
    if(!c.partida) return renderControlWizardFilaHTML(c, null);
    const groupKey = 'tunel|'+c.partida;
    if(gruposYaPintados.has(groupKey)) return '';
    const grupo = controlLineasFiltradasInv(controlChecksData.filter(x=>x.tipo==='tunel' && x.partida===c.partida),'tunel').sort((a,b)=>a.dia-b.dia);
    gruposYaPintados.add(groupKey);
    const guionInfo = grupo.length>1 ? {n: grupo.findIndex(x=>x.id===c.id)+1, total: grupo.length} : null;
    return renderControlWizardFilaHTML(c, guionInfo);
  }).join('');
  const numCompletados = listaDia.filter(controlLineaCompletada).length;
  // Ginés: con cero partidas, ocultar Dashboard y CSV, que no aportan datos.
  // Se conserva su cinta de fechas y el wizard existente.
  if(!listaDia.length){
    return cabeceraHTML+qcPanel('Operativa del día',filtroInvHTML,'qc-work-operations')+
      qcPanel('Inspecciones','<div class="qc-list-none">Sin partidas para este invernadero y día.</div>','qc-work-inspections');
  }

  const counters='<div class="qc-work-counter">'+listaDia.length+' partida'+(listaDia.length===1?'':'s')+
    ' · '+numCompletados+' inspeccionada'+(numCompletados===1?'':'s')+'</div>';
  return cabeceraHTML+qcPanel('Operativa del día',filtroInvHTML,'qc-work-operations')+
    qcPanel('Inspecciones',counters+'<div class="qc-list-cards">'+filasHTML+'</div>','qc-work-inspections');
}
async function cambiarControlQuincena(delta){
  const siguiente=Math.max(0,controlQuincenaOffset+delta);
  if(siguiente===controlQuincenaOffset)return;
  return navegarControlQC(async()=>{
    if(controlSeccion==='tunel'||controlSeccion==='carga'){
      const ok=await loadControlSeccionSlice(controlSeccion,siguiente,false);
      if(!ok){avisarFalloCarga();return;}
    }
    controlQuincenaOffset=siguiente;
    controlDiaSel=riegoQuincenaDias(siguiente)[0];
    renderControlContent(document.getElementById('control-overlay'));
  });
}
async function cambiarControlDia(dia){
  const siguiente=parseInt(dia,10);
  if(siguiente===controlDiaSel)return;
  return navegarControlQC(()=>{
    controlDiaSel=siguiente;
    renderControlContent(document.getElementById('control-overlay'));
  });
}
// Estado QC cuantitativo por documento. Lectura agrupada limitada al día (sin escrituras).
const controlQCEstados=new Map();
const controlQCEstadosCargando=new Set();
const controlQCEstadosUltimoError=new Map();
function claveEstadosQC(tipo,dia){return tipo+'|'+dia;}
function qcEstadoCuantificado(c){
  const entry=controlQCEstados.get(claveEstadosQC(c.tipo,c.dia));
  return entry?.partidas?.[c.id]===c.partida && entry?.estados?.[c.id]===true;
}
function controlLineaFinalizadaQC(c){return controlLineaCompletada(c)||qcEstadoCuantificado(c);}
function marcarControlQCMedido(ref){
  if(!ref||!['tunel','carga'].includes(ref.tipo))return;
  const key=claveEstadosQC(ref.tipo,ref.dia);
  const entry=controlQCEstados.get(key);
  if(entry){
    entry.estados[ref.id]=true;
    entry.partidas[ref.id]=ref.partida;
    entry.at=Date.now();
  }
  // Actualizar estado sin regenerar ni cerrar el formulario todavía activo.
  const overlay=document.getElementById('control-overlay');
  if(overlay && controlSeccion===ref.tipo && controlDiaSel===ref.dia &&
     !document.querySelector('#qco-inline'))
    renderControlContent(overlay);
}
async function cargarEstadosQCDia(tipo,dia,registros){
  if(!registros.length||!(currentUserRole==='ADMIN'||currentUserRole==='TECNICO'||
      (currentUserRole==='CARGADOR'&&tipo==='carga')))return;
  const key=claveEstadosQC(tipo,dia);
  if(controlQCEstadosCargando.has(key))return;
  const vistos=new Set();
  const firmados=registros.filter(c=>{
    if(!/^[A-Za-z0-9_-]{1,180}$/.test(String(c.id))||
       !/^[A-Za-z0-9._-]{1,100}$/.test(String(c.partida||''))||vistos.has(c.id))return false;
    vistos.add(c.id);return true;
  });
  if(!firmados.length)return;
  const signature=firmados.map(c=>c.id+':'+c.partida).sort().join('|');
  const previous=controlQCEstados.get(key);
  if(previous?.signature===signature && Date.now()-previous.at<120000)return;
  if(Date.now()-(controlQCEstadosUltimoError.get(key)||0)<30000)return;
  controlQCEstadosCargando.add(key);
  const user=currentUser;
  try{
    if(!(await ensureFirebaseIdTokenFresh())||!firebaseIdToken)throw Error('LOGIN_REQUIRED');
    const resultados=Object.create(null);
    for(let i=0;i<firmados.length;i+=60){
      const response=await fetch('/api/admin-qc-mediciones',{
        method:'POST',headers:{Authorization:'Bearer '+firebaseIdToken,'Content-Type':'application/json'},
        body:JSON.stringify({modo:'estados',tipo,dia,registros:firmados.slice(i,i+60).map(c=>({id:c.id,partida:c.partida}))}),
        cache:'no-store'
      });
      if(!response.ok)throw Error('QC_STATUS_UNAVAILABLE');
      const data=await response.json();
      if(!data.ok||data.tipo!==tipo||data.dia!==dia||!data.estados)throw Error('QC_STATUS_INVALID');
      Object.entries(data.estados).forEach(([id,value])=>{resultados[id]=value===true;});
    }
    if(user!==currentUser)return;
    const partidas=Object.create(null);
    firmados.forEach(c=>{partidas[c.id]=c.partida});
    controlQCEstados.set(key,{signature,estados:resultados,partidas,at:Date.now()});
    controlQCEstadosUltimoError.delete(key);
    const overlay=document.getElementById('control-overlay');
    if(overlay && overlay.style.display==='flex' && controlSeccion===tipo && controlDiaSel===dia &&
        !document.querySelector('#qco-inline'))
      renderControlContent(overlay);
  }catch(_){
    // Ante un fallo, conservar lo conocido, con espera entre reintentos.
    controlQCEstadosUltimoError.set(key,Date.now());
  }finally{
    controlQCEstadosCargando.delete(key);
  }
}
// Una línea se considera "completada" cuando TODAS las categorías de check
// (Color/Tamaño/Sanidad/Flores/Raíces) tienen al menos una opción marcada —
// a petición de Paula (2026-08-01), para poder separar Completados/
// Pendientes dentro de cada día en Túnel y Carga (comparten esta misma
// función porque renderControlChecklistHTML ya es compartida entre ambos).
function controlLineaCompletada(c){
  return CONTROL_CHECK_CATEGORIAS.every(cat => c[cat.key] && Object.values(c[cat.key]).some(v=>v));
}
let controlFiltroEstado = 'todos'; // 'todos' | 'completados' | 'pendientes'
async function cambiarControlFiltroEstado(v){
  if(v===controlFiltroEstado)return;
  return navegarControlQC(()=>{
    controlFiltroEstado=v;
    renderControlContent(document.getElementById('control-overlay'));
  });
}
// Filtro por invernadero, solo en Check Carga (a petición de Paula,
// 2026-08-10): muestra únicamente las partidas que se van de ese
// invernadero, ordenadas por su calle real (ver calleTramoDeCarga) de
// número más bajo a más alto — no existe en Check Túnel, no se toca su
// código (ver [[lasala_control_tunel_intocable]]).
let controlCargaInvFiltro = '';
let controlTunelInvFiltro = '';

function renderControlFiltroInvHTML(tipo){
  const actual=tipo==='carga'?controlCargaInvFiltro:controlTunelInvFiltro;
  const cambiar=tipo==='carga'?'cambiarControlCargaInvFiltro':'cambiarControlTunelInvFiltro';
  // Mismo orden que QC Carga: títulos de Sala no clicables (<optgroup>).
  const salas=[['Sala 1',ALL_INV_IDS_SALA1],['Sala 2',ALL_INV_IDS],
    ['Sala 3',ALL_INV_IDS_SALA3],['Sala 4',ALL_INV_IDS_SALA4],['Sala 5',ALL_INV_IDS_SALA5]];
  return '<div class="qc-list-inv" style="box-sizing:border-box;min-width:0;width:100%;max-width:100%;margin:0">'
   +'<label for="qc-inv-filtro-'+tipo+'" style="display:block;font-size:12px;font-weight:800;color:#1558a0;margin-bottom:4px">Invernadero</label>'
   +'<select id="qc-inv-filtro-'+tipo+'" onchange="'+cambiar+'(this.value)" class="qc-list-select" aria-label="Filtrar invernadero" '
   +'style="box-sizing:border-box;width:100%;max-width:100%;min-width:0;min-height:42px;padding:8px;border:1px solid #b5c9df;border-radius:7px;background:#fff;color:#17324e;font-size:14px">'
   +'<option value=""'+(!actual?' selected':'')+'>Todos los invernaderos</option>'
   +salas.map(([sala,ids])=>'<optgroup label="'+sala+'">'+ids.map(id=>
     '<option value="'+id+'"'+(actual===id?' selected':'')+'>INV '+id+'</option>').join('')+'</optgroup>').join('')
   +'</select></div>';
}
/* 0.104. CTA común junto al filtro INV, una única línea compacta. */
function renderControlFiltroYAltaHTML(tipo,dia,wizard=false){
  const accion=tipo==='tunel' ? "mostrarFormNuevoControlCheck('tunel',"+(wizard?'true':'false')+")" :
    'mostrarFormNuevoControlCargaCheck()';
  const alta=puedeCrearLineaControlQC(dia)
    ? '<button type="button" class="qc-list-add" onclick="'+accion+'" '+
      'style="flex:0 0 auto;width:auto;min-height:42px;padding:9px 11px;font-size:12px;white-space:nowrap;background:#1558a0;color:#fff;border:0;border-radius:8px;cursor:pointer;align-self:flex-end">'+
      '<i class="ti ti-plus" aria-hidden="true"></i> Añadir línea</button>'
    : '';
  return '<div class="qc-alta-toolbar" style="display:flex;flex-wrap:nowrap;align-items:flex-end;gap:8px;min-width:0;margin-bottom:11px">'+
    '<div style="flex:1 1 0;min-width:0">'+renderControlFiltroInvHTML(tipo)+'</div>'+alta+'</div>'+
    '<div id="nuevo-control-form-wrap"></div>';
}
function controlLineasFiltradasInv(lista,tipo){
  const selected=tipo==='carga'?controlCargaInvFiltro:controlTunelInvFiltro;
  if(!selected)return lista;
  return lista.map(c=>({c,part:tipo==='carga'?calleTramoDeCarga(c):calleTramoDeTunel(c)}))
    .filter(({part})=>part&&(tipo==='carga'?coincideInvernaderoCarga(part.invId,selected):part.invId===selected))
    .sort((a,b)=>a.part.desde-b.part.desde).map(x=>x.c);
}
async function cambiarControlCargaInvFiltro(v){
  if(v===controlCargaInvFiltro)return;
  let applied=false;
  await navegarControlQC(()=>{
    controlCargaInvFiltro=v;
    applied=true;
    renderControlContent(document.getElementById('control-overlay'));
  });
  if(!applied){
    const field=document.querySelector('#control-overlay select[onchange^="cambiarControlCargaInvFiltro"]');
    if(field)field.value=controlCargaInvFiltro;
  }
}
async function cambiarControlTunelInvFiltro(v){
  if(v===controlTunelInvFiltro)return;
  let applied=false;
  await navegarControlQC(()=>{
    controlTunelInvFiltro=v;
    applied=true;
    renderControlContent(document.getElementById('control-overlay'));
  });
  if(!applied){
    const field=document.querySelector('#control-overlay select[onchange^="cambiarControlTunelInvFiltro"]');
    if(field)field.value=controlTunelInvFiltro;
  }
}
// Dashboard propio POR DÍA (a petición de Paula, 2026-08-01) — comparte
// vista entre Túnel y Carga (misma renderControlChecklistHTML), pero
// siempre analiza solo el día actualmente seleccionado (controlDiaSel), no
// la quincena entera ni otros días.
let controlVistaChecklist = 'lineas'; // 'lineas' | 'dashboard'
async function cambiarControlVistaChecklist(v){
  if(v===controlVistaChecklist)return;
  return navegarControlQC(()=>{
    controlVistaChecklist=v;
    renderControlContent(document.getElementById('control-overlay'));
  });
}
// Listado genérico imprimible de partidas (a petición de Paula, 2026-08-12):
// reutilizado por "Comprobar extensiones" y por las estadísticas pinchables
// del dashboard del día — muestra Partida/Cliente y variedad/Calle real de
// cada línea, con botón Imprimir.
// Cliente/variedad y calle real de una línea de check, sea de Túnel o de
// Carga — corregido 2026-09-07: esta función asumía siempre el formato de
// Túnel (c.clienteVariedad, c.invId/c.tramos), pero Carga guarda el cliente
// y la variedad en campos separados (c.cliente/c.variedad) y no tiene calle
// propia (la hereda de su línea "hermana" de Túnel, ver calleTramoDeCarga)
// — por eso las partidas de Carga salían siempre sin cliente/variedad y con
// "Calle sin asignar" en estos informes (Dashboard del día → pinchar una
// barra), aunque en el listado normal de Carga sí se veían bien.
function clienteVariedadDeCheckControl(c){
  return c.clienteVariedad || [c.cliente, c.variedad].filter(Boolean).join(' — ');
}
function calleLabelDeCheckControl(c, escapar, sinAsignarHTML){
  if(c.tipo === 'carga'){
    const t = calleTramoDeCarga(c);
    return t ? `INV ${escapar(t.invId)} — ${escapar(t.label)}` : sinAsignarHTML;
  }
  return c.invId ? `INV ${escapar(c.invId)} — ${escapar(formatTramosLabel(c.invId, (c.tramos&&c.tramos.length)?c.tramos:[{desde:c.calleDesde,hasta:c.calleHasta}]))}` : sinAsignarHTML;
}
function mostrarListadoPartidasControl(titulo, lineas){
  const escapar = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const overlay = getOrCreateOverlay('control-listado-partidas-overlay');
  overlay.style.zIndex = 2200;
  const calleLabelDe = c => calleLabelDeCheckControl(c, escapar, '<span style="font-style:italic;color:var(--muted)">Sin asignar</span>');
  const filasHTML = lineas.map(c=>`
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-weight:800;color:#1558a0">${escapar(c.partida)||'—'}</td>
      <td style="padding:8px 10px;border-bottom:1px solid var(--border)">${escapar(clienteVariedadDeCheckControl(c))||'—'}</td>
      <td style="padding:8px 10px;border-bottom:1px solid var(--border);white-space:nowrap">${calleLabelDe(c)}</td>
    </tr>`).join('');
  window.__controlListadoActual = { titulo, lineas };
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:14px;max-width:640px;width:100%;max-height:85vh;padding:1.5rem;box-shadow:0 8px 40px rgba(0,0,0,.3);display:flex;flex-direction:column">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;flex-shrink:0">
        <div style="font-size:16px;font-weight:800">${escapar(titulo)} <span style="font-weight:600;color:var(--muted);font-size:13px">(${lineas.length})</span></div>
        <div style="display:flex;gap:8px">
          <button onclick="imprimirListadoPartidasControl()" style="padding:8px 14px;font-size:12px;font-weight:800;background:#1558a0;color:#fff;border:none;border-radius:7px;cursor:pointer;display:flex;align-items:center;gap:5px"><i class="ti ti-printer" style="font-size:14px"></i> Imprimir</button>
          <button onclick="document.getElementById('control-listado-partidas-overlay').style.display='none'" style="background:rgba(0,0,0,.06);border:none;color:#555;border-radius:6px;padding:6px 11px;cursor:pointer;font-size:13px">✕</button>
        </div>
      </div>
      <div style="overflow:auto;flex:1">
        ${lineas.length===0 ? `<div style="text-align:center;padding:2rem;color:var(--muted);font-style:italic;font-size:13px">Sin partidas.</div>` : `
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr><th style="padding:8px 10px;text-align:left;font-size:11px;color:var(--muted);text-transform:uppercase">Partida</th><th style="padding:8px 10px;text-align:left;font-size:11px;color:var(--muted);text-transform:uppercase">Cliente y variedad</th><th style="padding:8px 10px;text-align:left;font-size:11px;color:var(--muted);text-transform:uppercase">Calle real</th></tr>
          ${filasHTML}
        </table>`}
      </div>
    </div>`;
  overlay.style.display = 'flex';
}
function imprimirListadoPartidasControl(){
  const { titulo, lineas } = window.__controlListadoActual || { titulo:'', lineas:[] };
  const escapar = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const calleLabelDe = c => calleLabelDeCheckControl(c, escapar, 'Sin asignar');
  const filasHTML = lineas.map(c=>`<tr><td>${escapar(c.partida)||'—'}</td><td>${escapar(clienteVariedadDeCheckControl(c))||'—'}</td><td>${calleLabelDe(c)}</td></tr>`).join('');
  let iframe = document.getElementById('print-control-listado-iframe');
  if(!iframe){
    iframe = document.createElement('iframe');
    iframe.id = 'print-control-listado-iframe';
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none';
    document.body.appendChild(iframe);
  }
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapar(titulo)}</title>
    <style>
      body{font-family:Arial,Helvetica,sans-serif;color:#1a1e18;padding:20px}
      h1{font-size:18px;margin-bottom:14px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{padding:7px 10px;border-bottom:1px solid #ccc;text-align:left}
      th{font-size:11px;text-transform:uppercase;color:#555}
    </style></head><body>
      <h1>${escapar(titulo)} (${lineas.length})</h1>
      <table><tr><th>Partida</th><th>Cliente y variedad</th><th>Calle real</th></tr>${filasHTML}</table>
    </body></html>`);
  doc.close();
  setTimeout(()=>{ iframe.contentWindow.focus(); iframe.contentWindow.print(); }, 200);
}
// Informe CSV de un día (a petición de Vigueras, 2026-09-15) — se abre
// directo en Excel con un doble clic, sin depender de ninguna librería
// externa (nada de SheetJS: más fiable si el móvil/PC del campo tiene mala
// conexión). Punto y coma como separador porque Excel en español lo espera
// así por defecto (coma = separador decimal en ese locale). Reutilizable
// desde la vista clásica (ADMIN/técnicos) y desde el wizard de Ginés.
function generarControlCSVDia(tipo, dia){
  const esc = v => {
    const s = String(v==null?'':v);
    return /[",;\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
  };
  const opcionesMarcadas = (c, cat) => cat.opciones.filter(o=>c[cat.key] && c[cat.key][o.key]).map(o=>o.label).join(' + ');
  const enfermedadesMarcadas = c => (c.sanidad && c.sanidad.enferma && c.sanidadEnfermedades)
    ? SANIDAD_ENFERMEDADES.filter(e=>c.sanidadEnfermedades[e.key]).map(e=>e.label).join(' + ')
    : '';
  const catColor = CONTROL_CHECK_CATEGORIAS.find(c=>c.key==='color');
  const catTamano = CONTROL_CHECK_CATEGORIAS.find(c=>c.key==='tamano');
  const catSanidad = CONTROL_CHECK_CATEGORIAS.find(c=>c.key==='sanidad');
  const catFlores = CONTROL_CHECK_CATEGORIAS.find(c=>c.key==='flores');
  const catRaices = CONTROL_CHECK_CATEGORIAS.find(c=>c.key==='raices');
  const cabecera = ['Partida','Cliente/Variedad','Nº bandejas','Calle real','Color','Tamaño','Sanidad','Enfermedades','Flores','Raíces','Completada','Observaciones'];
  const listaDia = controlChecksData.filter(c=>c.tipo===tipo && c.dia===dia);
  const filas = listaDia.map(c=>{
    const calleReal = c.invId ? `INV ${c.invId} — ${formatTramosLabel(c.invId, (c.tramos && c.tramos.length) ? c.tramos : [{desde:c.calleDesde, hasta:c.calleHasta}])}` : '';
    return [
      c.partida||'', c.clienteVariedad||'', c.numBandejas||'', calleReal,
      opcionesMarcadas(c, catColor), opcionesMarcadas(c, catTamano), opcionesMarcadas(c, catSanidad),
      enfermedadesMarcadas(c), opcionesMarcadas(c, catFlores), opcionesMarcadas(c, catRaices),
      controlLineaCompletada(c) ? 'Sí' : 'No', c.observaciones||''
    ].map(esc).join(';');
  });
  return [cabecera.map(esc).join(';'), ...filas].join('\r\n');
}
function exportarControlCSV(tipo, dia){
  const listaDia = controlChecksData.filter(c=>c.tipo===tipo && c.dia===dia);
  if(!listaDia.length){ showToast('No hay líneas ese día todavía.'); return; }
  const csv = generarControlCSVDia(tipo, dia);
  const blob = new Blob(['﻿' + csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const nombreTipo = tipo==='tunel' ? 'CheckTunel' : tipo==='carga' ? 'CheckCarga' : tipo;
  const f = riegoDiaToDate(dia);
  const fechaStr = `${f.getFullYear()}-${String(f.getMonth()+1).padStart(2,'0')}-${String(f.getDate()).padStart(2,'0')}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombreTipo}_${fechaStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}
function renderControlDashboardDiaHTML(seccion, listaDia){
  if(!listaDia.length){
    const inv=seccion.key==='carga'?controlCargaInvFiltro:controlTunelInvFiltro;
    return `<div style="text-align:center;padding:2rem;color:var(--muted);font-style:italic;font-size:13px">${inv?'Sin partidas para este invernadero y día.':'Sin líneas para este día todavía.'}</div>`;
  }
  const total = listaDia.length;
  const completados = listaDia.filter(controlLineaFinalizadaQC).length;
  const pendientes = total - completados;
  const pctCompletado = Math.round((completados/total)*100);
  const totalBandejas = listaDia.reduce((sum,c)=> sum + (parseFloat(c.numBandejas)||0), 0);

  const statCard = (label, valor, color) => `
    <div style="background:${color};color:#fff;border-radius:12px;padding:1rem 1.2rem;box-shadow:var(--shadow-sm)">
      <div style="font-size:11px;font-weight:700;opacity:.85;text-transform:uppercase;letter-spacing:.03em">${label}</div>
      <div style="font-size:26px;font-weight:800;margin-top:4px">${valor}</div>
    </div>`;
  const statsHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:1.25rem">
      ${statCard('Total líneas', total, 'linear-gradient(135deg,#1558a0,#2a72c4)')}
      ${statCard('Completados', `${completados} (${pctCompletado}%)`, 'linear-gradient(135deg,#1a5c2e,#3fa864)')}
      ${statCard('Pendientes', pendientes, 'linear-gradient(135deg,#c47f00,#e0a530)')}
      ${statCard('Nº bandejas', Math.round(totalBandejas), 'linear-gradient(135deg,#7b5cf0,#5c8df0)')}
    </div>`;

  // Cada barra se puede pinchar para ver el listado de partidas exacto (a
  // petición de Paula, 2026-08-12) — las líneas se guardan en una caché
  // global por índice (evita escapar comillas de clienteVariedad en el
  // onclick) y se recuperan al pinchar.
  window.controlDashboardCacheListas = [];
  const barraCategoria = (label, n, max, gradiente, tinte, lineasDeEsta) => {
    const idx = window.controlDashboardCacheListas.length;
    window.controlDashboardCacheListas.push({ titulo: label, lineas: lineasDeEsta });
    return `
    <div onclick="mostrarListadoPartidasControl(window.controlDashboardCacheListas[${idx}].titulo, window.controlDashboardCacheListas[${idx}].lineas)" title="Ver partidas" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;cursor:pointer">
      <div style="width:120px;font-size:11px;font-weight:700;color:var(--text);flex-shrink:0">${label}</div>
      <div style="flex:1;background:${tinte};border-radius:6px;height:18px;overflow:hidden">
        <div style="width:${Math.round((n/max)*100)}%;height:100%;background:${gradiente};border-radius:6px"></div>
      </div>
      <div style="width:26px;text-align:right;font-size:12px;font-weight:800;color:var(--text);flex-shrink:0">${n}</div>
    </div>`;
  };

  const categoriasHTML = CONTROL_CHECK_CATEGORIAS.map(cat=>{
    const conteos = cat.opciones.map(o=>({label:o.label, n: listaDia.filter(c=>c[cat.key] && c[cat.key][o.key]).length, lineas: listaDia.filter(c=>c[cat.key] && c[cat.key][o.key])}));
    const max = Math.max(1, ...conteos.map(x=>x.n));
    return `
    <div style="border:1.5px solid var(--border);border-radius:12px;padding:14px;background:#fff">
      <div style="font-size:12px;font-weight:800;color:var(--text);margin-bottom:10px;display:flex;align-items:center;gap:6px">
        <i class="ti ${cat.icon}" style="font-size:14px"></i> ${cat.label}
      </div>
      ${conteos.map(x=>barraCategoria(`${cat.label} — ${x.label}`, x.n, max, cat.gradiente, cat.tinte, x.lineas)).join('')}
    </div>`;
  }).join('');

  const conEnferma = listaDia.filter(c=>c.sanidad && c.sanidad.enferma);
  const conteosEnfermedades = SANIDAD_ENFERMEDADES.map(e=>({label:e.label, n: conEnferma.filter(c=>c.sanidadEnfermedades && c.sanidadEnfermedades[e.key]).length, lineas: conEnferma.filter(c=>c.sanidadEnfermedades && c.sanidadEnfermedades[e.key])})).filter(x=>x.n>0);
  const enfermedadesHTML = conteosEnfermedades.length ? (()=>{
    const max = Math.max(1, ...conteosEnfermedades.map(x=>x.n));
    return `
    <div style="border:1.5px solid var(--border);border-radius:12px;padding:14px;background:#fff">
      <div style="font-size:12px;font-weight:800;color:#c62828;margin-bottom:10px;display:flex;align-items:center;gap:6px">
        <i class="ti ti-alert-triangle" style="font-size:14px"></i> Enfermedades (${conEnferma.length} línea${conEnferma.length===1?'':'s'} enferma${conEnferma.length===1?'':'s'})
      </div>
      ${conteosEnfermedades.map(x=>barraCategoria(x.label, x.n, max, 'linear-gradient(135deg,#c62828,#e57373)', '#fdece5', x.lineas)).join('')}
    </div>`;
  })() : '';

  return statsHTML + `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">${categoriasHTML}${enfermedadesHTML}</div>`;
}
function renderControlChecklistHTML(seccion){
  const diasQ = riegoQuincenaDias(controlQuincenaOffset);
  if(controlDiaSel==null || !diasQ.includes(controlDiaSel)) controlDiaSel = diasQ[0];
  const escapar = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const listaDia = controlChecksData.filter(c=>c.tipo===seccion.key && c.dia===controlDiaSel);
  // Los filtros modifican solo la consulta, nunca los registros persistidos.
  void cargarEstadosQCDia(seccion.key,controlDiaSel,listaDia);
  const listaInv=controlLineasFiltradasInv(listaDia,seccion.key);
  const numCompletados = listaInv.filter(controlLineaFinalizadaQC).length;
  const numPendientes = listaInv.length - numCompletados;
  const lista = controlFiltroEstado==='completados' ? listaInv.filter(controlLineaFinalizadaQC)
    : controlFiltroEstado==='pendientes' ? listaInv.filter(c=>!controlLineaFinalizadaQC(c))
    : listaInv;
  const pdf = controlPdfsData[seccion.key+'|'+controlDiaSel];
  // Carga bajo demanda (no bloquea este pintado): si el índice dice que hay
  // un PDF para este día pero todavía no está en memoria, se pide en segundo
  // plano y se repinta cuando llegue (ver cargarControlPdfDia).
  cargarControlPdfDia(seccion.key, controlDiaSel);
  // La misma estructura operativa se mantiene incluso si el día no tiene partidas.

  const filtrosHTML = '<label class="qc-list-state"><span>Estado</span><select class="qc-list-select" onchange="cambiarControlFiltroEstado(this.value)" aria-label="Filtrar por estado">'+[
    {value:'todos',label:'Todos ('+listaInv.length+')'},
    {value:'pendientes',label:'Pendientes ('+numPendientes+')'},
    {value:'completados',label:'Completados ('+numCompletados+')'}
  ].map(o=>'<option value="'+o.value+'"'+(controlFiltroEstado===o.value?' selected':'')+'>'+o.label+'</option>').join('')+'</select></label>';
  const filtroInvHTML = renderControlFiltroYAltaHTML(seccion.key,controlDiaSel,false);
  // Líneas cuya calle real todavía no se puede resolver (Túnel: no se le ha
  // asignado calle todavía; Carga: su línea "hermana" de Túnel no existe o
  // tampoco tiene calle) muestran "Calle: —" en la tarjeta. A petición de
  // Paula (2026-08-26): mostrarlas bajo CUALQUIER filtro de invernadero (a
  // petición de un cambio anterior) rompía el filtro — al elegir un
  // invernadero concreto aparecían también líneas de otros invernaderos sin
  // asignar, mezcladas, así que "filtrar no funcionaba bien". Ahora el
  // filtro por invernadero vuelve a ser estricto (solo esa calle real); las
  // líneas sin calle asignada siguen siendo visibles, pero solo en la vista
  // "Todos los invernaderos" (sin filtro) — ahí es donde hay que fijarse
  // para acabar de asignarles la calle, no mezcladas con otro invernadero.
  // Misma lista para tarjetas, estados y panel de métricas, sin doble filtrado.
  const listaMostrada = lista;

  // Partidas con más de un guión (mismo Nº de partida repetido en días
  // distintos) se agrupan en una sola tarjeta con flechas — ver
  // renderControlCardConGuionesHTML. Solo se pinta una vez por grupo aunque
  // dos guiones del mismo grupo caigan el mismo día.
  // En Check Carga esto queda DESACTIVADO a petición de Paula, 2026-08-10:
  // cada línea sale siempre suelta, nunca agrupada en guiones — el agrupado
  // por partida escondía líneas que en realidad pertenecían a otro
  // invernadero (ver bug corregido en calleTramoDeCarga) y hacía imposible
  // verlas todas al filtrar por invernadero.
  const gruposYaPintados = new Set();
  const filas = listaMostrada.map(c=>{
    if(seccion.key==='carga' || !c.partida) return renderControlCardHTML(c, seccion);
    const groupKey = seccion.key+'|'+c.partida;
    if(gruposYaPintados.has(groupKey)) return '';
    const grupo = controlLineasFiltradasInv(controlChecksData.filter(x=>x.tipo===seccion.key && x.partida===c.partida),seccion.key).sort((a,b)=>a.dia-b.dia);
    if(grupo.length<=1) return renderControlCardHTML(c, seccion);
    gruposYaPintados.add(groupKey);
    return renderControlCardConGuionesHTML(grupo, seccion);
  }).join('');

  // Botón "Sincronizar" manual (a petición de Paula, 2026-08-05: "que aparezca
  // algún botón de sincronizar para estar seguros porque falla mucho") — el
  // recuento es global (la cola offline no distingue tipo/día), y sirve tanto
  // para forzar un reintento como para comprobar de un vistazo que no queda
  // nada pendiente sin tener que fiarse solo del aviso naranja automático.
  const pendientesGlobal = leerColaOffline().length;
  const addAllowed=puedeCrearLineaControlQC(controlDiaSel);
  const pdfInfoHTML = pdf ? `<div class="qc-list-pdf-existing"><i class="ti ti-file-check" aria-hidden="true"></i> ${escapar(pdf.nombre)} · <a href="${pdf.pdfB64}" target="_blank" rel="noopener noreferrer">Ver PDF</a></div>` : '';
  const syncHTML = pendientesGlobal>0 ? `<button type="button" class="qc-list-sync" onclick="sincronizarControlManual()"><i class="ti ti-refresh"></i> ${pendientesGlobal} pendiente${pendientesGlobal===1?'':'s'} · Sincronizar</button>` : '';
  const extraTunelHTML = seccion.key==='tunel' ? `
    <label class="qc-list-option"><i class="ti ti-file-upload"></i> Añadir extensiones<input type="file" accept="application/pdf" onchange="handleExtensionesPdfInput(this)"></label>
    <button type="button" class="qc-list-option" onclick="mostrarComprobarExtensiones()"><i class="ti ti-list-check"></i> Comprobar extensiones</button>` : '';
  const cardsHTML = listaMostrada.length===0
    ? `<div class="qc-list-none">${listaDia.length===0?'Sin partidas para este día.':((seccion.key==='carga'?controlCargaInvFiltro:controlTunelInvFiltro)?'No hay partidas para ese invernadero y día.':'No hay líneas con el estado seleccionado.')}</div>`
    : `<div class="qc-list-cards">${filas}</div>`;
  if(seccion.key==='tunel'||seccion.key==='carga'){
    const pdfAction=addAllowed ? '<label class="qc-list-option"><i class="ti ti-file-type-pdf"></i> '+(pdf?'Sustituir PDF':'Insertar PDF')+
      '<input type="file" accept="application/pdf" onchange="handleControlPdfInput(this,\''+seccion.key+'\','+controlDiaSel+')"></label>' : '';
    const operativa=filtroInvHTML+
      '<div class="qc-list-tools"><div class="qc-list-search">'+
      '<input id="control-buscar-partida" type="search" placeholder="Buscar Nº partida" aria-label="Buscar número de partida" onkeydown="if(event.key===\'Enter\'){event.preventDefault();buscarControlPartida(\''+seccion.key+'\')}" />'+
      '<button type="button" onclick="buscarControlPartida(\''+seccion.key+'\')" aria-label="Buscar"><i class="ti ti-search"></i></button></div></div>'+
      syncHTML+
      '<details class="qc-list-more"><summary>Más opciones</summary><div class="qc-list-more-actions">'+
      pdfAction+extraTunelHTML+'</div>'+pdfInfoHTML+'</details>';
    const total='<div class="qc-work-counter">'+listaInv.length+' partida'+(listaInv.length===1?'':'s')+
      ' · '+numCompletados+' inspeccionada'+(numCompletados===1?'':'s')+'</div>';
    const filtrosInspecciones='<div class="qc-work-list-tools">'+total+filtrosHTML+'</div>';
    return '<div class="qc-work-tunel">'+qcFechaHTML('list')+
      qcPanel('Operativa del día',operativa,'qc-work-operations')+
      qcPanel('Inspecciones',filtrosInspecciones+cardsHTML,'qc-work-inspections')+'</div>';
  }

}
function handleControlPdfInput(input, tipo, dia){
  // La importación manual de un PDF también puede crear líneas QC.
  if(bloquearAltaPasadaControlQC(dia)){if(input)input.value='';return;}
  if(!input.files || !input.files[0]) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = async function(e){
    if(bloquearAltaPasadaControlQC(dia))return;
    const pdfOk=await guardarControlPdf(tipo,dia,file.name,e.target.result);
    if(!pdfOk){
      showToast('❌ Error al guardar el PDF — inténtalo de nuevo');
      return;
    }
    // El check de Carga tiene otra plantilla de PDF (Cliente/Partida/
    // Variedad/Nº Band/Invernadero en columnas distintas a las de Túnel) —
    // a la espera de que Paula mande un PDF real de Carga para calibrar su
    // lectura (mismo proceso que se siguió con Túnel), de momento solo se
    // guarda como adjunto y las líneas de Carga se añaden a mano. IMPORTANTE:
    // NO tocar la lectura automática de Túnel, que ya funciona perfecta.
    if(tipo === 'carga'){
      showToast('Leyendo PDF y creando líneas...');
      const creadasCarga = await autoCrearLineasDesdePdfControlCarga(dia, e.target.result);
      if(creadasCarga === -2) showToast('❌ Error al GUARDAR las líneas leídas del PDF — no se ha llegado a subir a la nube, inténtalo de nuevo (si se repite, avisa)');
      else if(creadasCarga === -3) showToast(`⚠️ Se han visto ${window.ultimaCargaPdfNoReconocidas.length} línea${window.ultimaCargaPdfNoReconocidas.length===1?'':'s'} con nº de partida pero con un formato distinto al esperado (falta la hora, el invernadero o algún campo) — no se ha creado ninguna. Mira la consola (F12) para ver el texto exacto.`);
      else if(creadasCarga > 0) showToast(`✓ ${creadasCarga} línea${creadasCarga===1?'':'s'} creada${creadasCarga===1?'':'s'} desde el PDF — falta el check`);
      else if(creadasCarga === 0) showToast('✓ PDF adjuntado (no se han detectado partidas nuevas que añadir)');
      else showToast('✓ PDF adjuntado, pero no se ha podido leer automáticamente — añade las líneas a mano');
      // Independientemente de si se creó alguna línea o no (incluso con
      // creadasCarga===0, que puede significar "todo lo que se leyó ya
      // existía" y esconder que ALGUNA otra partida del PDF ni siquiera se
      // llegó a leer) — avisar siempre que queden líneas con partida sin
      // reconocer, con el texto exacto en consola para poder diagnosticar.
      if(creadasCarga !== -3 && window.ultimaCargaPdfNoReconocidas?.length){
        showToast(`⚠️ Además, ${window.ultimaCargaPdfNoReconocidas.length} línea${window.ultimaCargaPdfNoReconocidas.length===1?'':'s'} con partida no se ha podido leer (formato distinto) — revisa la consola (F12)`);
      }
      if(window.ultimaCargaPdfNoReconocidas?.length) console.warn('Líneas de Carga con partida no reconocidas:', window.ultimaCargaPdfNoReconocidas);
      renderControlContent(document.getElementById('control-overlay'));
      return;
    }
    showToast('Leyendo PDF y creando líneas...');
    const creadas = await autoCrearLineasDesdePdfControl(tipo, dia, e.target.result);
    // A petición de Paula (2026-08-01): además de las líneas de check, el
    // PDF de Túnel también programa el PINZADO automáticamente (2HV → 10
    // días antes de la Fecha Entrega, 3HV/4HV → 7 días antes), en Trabajos
    // de Mujeres → Pinzar. Ver autoCrearPinzadosDesdePdfTunel.
    const creadosPinzado = await autoCrearPinzadosDesdePdfTunel(e.target.result);
    // A petición de Paula (2026-08-31): el mismo PDF de Túnel programa además
    // Recomponer/Quitar raíces (todas las partidas) y, si son Jiffy,
    // Plantar/Separar — usando FecRealSal del PDF como día de salida real.
    // Ver autoCrearTrabajosMujeresDesdePdfTunel.
    await loadTrabajosData();
    const creadosMujeres = await autoCrearTrabajosMujeresDesdePdfTunel(e.target.result);
    if(creadas === -2) showToast('❌ Error al GUARDAR las líneas leídas del PDF — no se ha llegado a subir a la nube, inténtalo de nuevo (si se repite, avisa)');
    else if(creadas > 0) showToast(`✓ ${creadas} línea${creadas===1?'':'s'} creada${creadas===1?'':'s'} desde el PDF — falta la calle real y el check`);
    else if(creadas === 0) showToast('✓ PDF adjuntado (no se han detectado partidas nuevas que añadir)');
    else showToast('✓ PDF adjuntado, pero no se ha podido leer automáticamente — añade las líneas a mano');
    if(creadosPinzado > 0) showToast(`✓ ${creadosPinzado} pinzado${creadosPinzado===1?'':'s'} programado${creadosPinzado===1?'':'s'} automáticamente`);
    if(creadosMujeres > 0) showToast(`✓ ${creadosMujeres} trabajo${creadosMujeres===1?'':'s'} de Mujeres (Recomponer/Quitar raíces/Plantar/Separar) programado${creadosMujeres===1?'':'s'}`);
    renderControlContent(document.getElementById('control-overlay'));
  };
  reader.readAsDataURL(file);
}
// Lectura automática del PDF de salidas (a petición de Paula, 2026-07-31,
// una vez nos mandó un PDF real: "Listado Salidas Previstas de Prendimiento
// con Ubicación"). Cada partida ocupa 1-3 líneas de texto en el PDF: una
// línea principal con Nº Parte/Fecha Entrega/Nº Partida/Band.Sol/Cliente/Nº
// Plantas/Nº Band./Localizacion/Fec Entrada(/FecRealSal), seguida (a veces
// tras 1-2 líneas de "Obs Inj" que caen en su propia línea) de la Variedad,
// en la MISMA columna de Cliente. Se usa pdf.js (ya cargado en la app para
// bulkParsePdfFile) para reconstruir cada línea agrupando por coordenada Y y
// ordenando por X — a diferencia de bulkParsePdfLines (pensado para el
// formato "Nº Partida: ..., Cliente: ..." de Introducir partida), aquí se
// necesita ADEMÁS la coordenada X de cada línea para distinguir la columna
// Cliente/Variedad (x≈237pt) de una línea huérfana de Obs Inj que por
// casualidad cae sola en su propia línea (x≈602pt) — sin la X, un valor de
// observación se cuela como si fuera la variedad. Solo Nº Partida,
// Cliente+Variedad y Nº Band se usan (lo único que pidió Paula); el resto de
// columnas del PDF (Localizacion, fechas, Obs...) se ignoran.
async function extraerLineasControlPdf(bytes){
  await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({data:bytes}).promise;
  const lineas = [];
  for(let p=1;p<=pdf.numPages;p++){
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const byY = {};
    content.items.forEach(it=>{
      const y = Math.round(it.transform[5]);
      if(!byY[y]) byY[y]=[];
      byY[y].push(it);
    });
    Object.keys(byY).map(Number).sort((a,b)=>b-a).forEach(y=>{
      const items = byY[y].sort((a,b)=>a.transform[4]-b.transform[4]);
      lineas.push({ texto: items.map(it=>it.str).join(' ').trim(), x0: items[0].transform[4] });
    });
  }
  return lineas;
}
function parseControlPdfPartidas(lineas){
  const PARTIDA_RE = '\\d{2}[A-Z]{1,2}\\d{4,5}';
  // Nº Band viene a veces con punto decimal ("65.0") y a veces con coma
  // ("1,0", "30,0") según el PDF concreto que exporta el ERP — Paula subió
  // varios días con formato distinto y solo el punto estaba contemplado,
  // así que esos PDFs no generaban ninguna línea (0 partidas encontradas).
  // Aceptar ambos separadores decimales arregla esos días sin afectar a los
  // que ya funcionaban con punto.
  // A petición real (2026-08-26): una partida con MUCHAS bandejas (más de
  // 999, ej. "1,110.0") lleva ADEMÁS una coma de millares delante del
  // decimal — el patrón exigía exactamente un separador seguido de un solo
  // dígito ("71.0"), así que esa línea entera no encajaba y no se creaba
  // ninguna ficha (caso real: partida 26X01875, PDF de Túnel del 23 de
  // agosto). Ahora se admite un grupo opcional de miles antes del decimal.
  const mainRe = new RegExp('^(?<parte>\\d{6,9})?\\s*(?<fentrega>\\d{2}/\\d{2}/\\d{4})?\\s*(?<partida>'+PARTIDA_RE+')\\s+(?:(?<bandsol>[\\d.,]+)\\s+)?(?<cliente>.+?)\\s+(?<nplantas>[\\d.,]+)\\s+(?<nband>\\d{1,3}(?:,\\d{3})*[.,]\\d)\\s+(?<localiz>\\S*)\\s*(?<fentrada>\\d{2}/\\d{2}/\\d{4})?');
  const loneRe = new RegExp('^'+PARTIDA_RE+'$');
  const records = [];
  for(let i=0;i<lineas.length;i++){
    const t = lineas[i].texto;
    if(!t) continue;
    const m = mainRe.exec(t);
    if(m && m.groups.partida && lineas[i].x0 < 100){
      // fentrega (Fecha Entrega, 2ª columna del PDF) se captura aquí además
      // de partida/cliente/nband — a petición de Paula (2026-08-01) para
      // programar el pinzado automático (ver autoCrearPinzadosDesdePdfTunel).
      const rec = { partida: m.groups.partida, cliente: m.groups.cliente.replace(/\s{2,}/g,' ').trim(), variedad: '', nband: m.groups.nband, fentrega: m.groups.fentrega || '' };
      for(let j=i+1, visto=0; j<lineas.length && visto<4; j++){
        const t2 = lineas[j].texto;
        if(!t2) continue;
        visto++;
        const m2 = mainRe.exec(t2);
        if(m2 && m2.groups.partida && lineas[j].x0 < 100) break;
        const esSubtotal = /^[\d.,]+(\s+[\d.,]+)*$/.test(t2);
        const esGuion = /^_+$/.test(t2);
        const esCabecera = /^(Empresa|G\.Semilleros|N[ºo°]?\s*Parte|Cliente)\b/i.test(t2);
        const esPartidaSuelta = loneRe.test(t2);
        // La columna Variedad cae en torno a x≈237pt; una línea huérfana de
        // Obs Inj (x≈602pt) o un subtotal (x≈383pt) quedan fuera de rango.
        const columnaOk = lineas[j].x0 > 200 && lineas[j].x0 < 300;
        if(!esSubtotal && !esGuion && !esCabecera && !esPartidaSuelta && columnaOk){
          rec.variedad = t2.split(/\s{2,}/)[0];
          break;
        }
      }
      records.push(rec);
    }
  }
  // A petición de Paula (2026-08-04): las partidas cuyo código contiene "ZE" o
  // "YE" (p.ej. 26YE0066, 25ZE0353) no deben generar ni línea de Check ni
  // pinzado automático — se filtran aquí, en el origen común de ambos.
  return records.filter(r => !/ZE|YE/i.test(r.partida));
}
// Programación automática de PINZADO a partir del PDF de salida de Túnel (a
// petición de Paula, 2026-08-01): las partidas 2HV se pinzan 10 días antes
// de su Fecha Entrega (2ª columna del PDF), las 3HV/4HV 7 días antes. Crea
// un "trabajo" en Trabajos → Mujeres → Pinzar (misma trabajosData de
// siempre) por cada partida que tenga el nº de HV detectable en su
// Variedad y una Fecha Entrega válida — idempotente por partida+fecha de
// pinzado, para poder volver a procesar el mismo PDF sin duplicar.
function detectarHV(variedad){
  const m = /(\d)\s*HV\b/i.exec(variedad||'');
  return m ? parseInt(m[1],10) : null;
}
// Programación automática de RECOMPONER/QUITAR RAÍCES/PLANTAR/SEPARAR (a
// petición de Paula, 2026-08-31, corregido el mismo día: "RECOMPONER SE
// APLICA A TODAS LAS PARTIDAS"): Recomponer y Quitar raíces se programan
// para CUALQUIER partida el día después de su salida de túnel; Plantar (2
// días después) y Separar (1 día después de Plantar = 3 días después de la
// salida) solo para partidas en soporte JIFFY. La fecha de referencia es la
// salida REAL de túnel (p.entrada — en "Introducir partida" es la fecha en
// que se confirma la salida pendiente, ver confirmarSalidaPendiente; desde
// el PDF de Control es FecRealSal, ver autoCrearTrabajosMujeresDesdePdfTunel).
// Se crea un "trabajo" normal en Trabajos → Mujeres (misma trabajosData de
// siempre, editable a mano igual que el resto) por cada subsección —
// idempotente por partida+subsección para poder reprocesar sin duplicar.
const TODAS_PARTIDAS_SUBSECCIONES_DIAS = [
  {subseccion:'recomponer', dias:1},
  {subseccion:'quitarRaices', dias:1}
];
const JIFFY_SOLO_SUBSECCIONES_DIAS = [
  {subseccion:'plantar', dias:2},
  {subseccion:'separar', dias:3}
];
function esSoporteJiffy(soporte){ return /jiffy/i.test(soporte||''); }
async function autoCrearTrabajosMujeresPartida(p){
  if(!p.entrada) return 0;
  const [dd,mm,yyyy] = String(p.entrada).split('/');
  if(!dd || !mm || !yyyy) return 0;
  const fechaSalida = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  if(isNaN(fechaSalida.getTime())) return 0;
  const esJiffy = p.esJiffy || esSoporteJiffy(p.soporte);
  const reglas = TODAS_PARTIDAS_SUBSECCIONES_DIAS.concat(esJiffy ? JIFFY_SOLO_SUBSECCIONES_DIAS : []);
  const existentes = new Set(trabajosData.filter(t=>t.seccion==='mujeres' && t.origenPartidaJiffy===p.num).map(t=>t.subseccion));
  let creados = 0;
  reglas.forEach(({subseccion, dias})=>{
    if(existentes.has(subseccion)) return;
    const fechaDate = new Date(fechaSalida);
    fechaDate.setDate(fechaDate.getDate() + dias);
    const fechaISO = fechaLocalISO(fechaDate);
    const fecha = fechaDate.toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'}).replace('.','');
    const clienteVariedad = p.variedad ? `${p.cliente} — ${p.variedad}` : p.cliente;
    trabajosData.push({
      id: 'trabajo_'+Date.now()+'_'+subseccion+'_'+Math.random().toString(36).slice(2,8),
      seccion:'mujeres', subseccion,
      fechaISO, fecha, descripcion: `${p.num} — ${clienteVariedad}`, personas:[], horaInicio:'',
      inv: p.inv||'', origenPartidaJiffy: p.num,
      creadoPor: currentUser||'—', creadoEn: new Date().toLocaleString('es-ES')
    });
    creados++;
  });
  if(creados) await persistTrabajosData();
  return creados;
}
// Igual que parseControlPdfPartidas pero, además, extrae FecRealSal (última
// fecha de la fila, después de Fec Entrada) y detecta si la partida cae bajo
// una sección de cabecera tipo soporte JIFFY (p.ej. "TIJ6 - TINJ JIFFY 5x5")
// — necesario para programar Recomponer/Quitar raíces/Plantar/Separar desde
// el mismo PDF que ya se sube en Control → Túnel.
function parseControlPdfPartidasConSalida(lineas){
  const PARTIDA_RE = '\\d{2}[A-Z]{1,2}\\d{4,5}';
  const mainRe = new RegExp('^(?<parte>\\d{6,9})?\\s*(?<fentrega>\\d{2}/\\d{2}/\\d{4})?\\s*(?<partida>'+PARTIDA_RE+')\\s+(?:(?<bandsol>[\\d.,]+)\\s+)?(?<cliente>.+?)\\s+(?<nplantas>[\\d.,]+)\\s+(?<nband>\\d{1,3}(?:,\\d{3})*[.,]\\d)\\s+(?<localiz>\\S*)\\s*(?<fentrada>\\d{2}/\\d{2}/\\d{4})?(?<resto>.*)$');
  const loneRe = new RegExp('^'+PARTIDA_RE+'$');
  const seccionHeaderRe = /^TI[A-Z0-9]*\d*\s*-\s*/;
  const records = [];
  let seccionJiffy = false;
  for(let i=0;i<lineas.length;i++){
    const t = lineas[i].texto;
    if(!t) continue;
    if(seccionHeaderRe.test(t)){ seccionJiffy = /jiffy/i.test(t); continue; }
    const m = mainRe.exec(t);
    if(m && m.groups.partida && lineas[i].x0 < 100){
      const fechasResto = (m.groups.resto||'').match(/\d{2}\/\d{2}\/\d{4}/g) || [];
      const fecrealsal = fechasResto.length ? fechasResto[fechasResto.length-1] : '';
      const rec = { partida: m.groups.partida, cliente: m.groups.cliente.replace(/\s{2,}/g,' ').trim(), variedad: '', nband: m.groups.nband, fentrega: m.groups.fentrega || '', fecrealsal, esJiffy: seccionJiffy };
      for(let j=i+1, visto=0; j<lineas.length && visto<4; j++){
        const t2 = lineas[j].texto;
        if(!t2) continue;
        visto++;
        if(seccionHeaderRe.test(t2)) break;
        const m2 = mainRe.exec(t2);
        if(m2 && m2.groups.partida && lineas[j].x0 < 100) break;
        const esSubtotal = /^[\d.,]+(\s+[\d.,]+)*$/.test(t2);
        const esGuion = /^_+$/.test(t2);
        const esCabecera = /^(Empresa|G\.Semilleros|N[ºo°]?\s*Parte|Cliente)\b/i.test(t2);
        const esPartidaSuelta = loneRe.test(t2);
        const columnaOk = lineas[j].x0 > 200 && lineas[j].x0 < 300;
        if(!esSubtotal && !esGuion && !esCabecera && !esPartidaSuelta && columnaOk){
          rec.variedad = t2.split(/\s{2,}/)[0];
          break;
        }
      }
      records.push(rec);
    }
  }
  return records.filter(r => !/ZE|YE/i.test(r.partida));
}
// Se llama junto a autoCrearPinzadosDesdePdfTunel al subir el PDF de salida
// de Túnel en Control — idempotente por partida (ver autoCrearTrabajosMujeresPartida).
async function autoCrearTrabajosMujeresDesdePdfTunel(pdfB64){
  try{
    const base64 = pdfB64.split(',')[1];
    const binStr = atob(base64);
    const bytes = new Uint8Array(binStr.length);
    for(let i=0;i<binStr.length;i++) bytes[i] = binStr.charCodeAt(i);
    const lineas = await extraerLineasControlPdf(bytes);
    const partidas = parseControlPdfPartidasConSalida(lineas);
    if(!partidas.length) return 0;
    let creados = 0;
    for(const p of partidas){
      if(!p.fecrealsal) continue;
      creados += await autoCrearTrabajosMujeresPartida({num:p.partida, cliente:p.cliente, variedad:p.variedad, entrada:p.fecrealsal, esJiffy:p.esJiffy, inv:''});
    }
    return creados;
  }catch(e){
    console.error('Error programando trabajos de mujeres desde PDF de Túnel:', e);
    return -1;
  }
}
async function autoCrearPinzadosDesdePdfTunel(pdfB64){
  try{
    const base64 = pdfB64.split(',')[1];
    const binStr = atob(base64);
    const bytes = new Uint8Array(binStr.length);
    for(let i=0;i<binStr.length;i++) bytes[i] = binStr.charCodeAt(i);
    const lineas = await extraerLineasControlPdf(bytes);
    const partidas = parseControlPdfPartidas(lineas);
    if(!partidas.length) return 0;
    const existentes = new Set(trabajosData.filter(t=>t.seccion==='mujeres' && t.subseccion==='pinzar' && t.origenPdfPartida).map(t=>t.origenPdfPartida+'|'+t.fechaISO));
    let creados = 0;
    partidas.forEach(p=>{
      const hv = detectarHV(p.variedad);
      if(!hv || !p.fentrega) return;
      const diasAntes = hv===2 ? 10 : (hv===3 || hv===4) ? 7 : null;
      if(diasAntes==null) return;
      const [dd,mm,yyyy] = p.fentrega.split('/');
      if(!dd || !mm || !yyyy) return;
      const fechaEntregaDate = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
      if(isNaN(fechaEntregaDate.getTime())) return;
      const fechaPinzarDate = new Date(fechaEntregaDate);
      fechaPinzarDate.setDate(fechaPinzarDate.getDate() - diasAntes);
      // fechaLocalISO (no toISOString, que convierte a UTC y desplaza la
      // fecha un día en zonas horarias adelantadas a UTC) — mismo bug que
      // ya se evita en el resto de la app.
      const fechaISO = fechaLocalISO(fechaPinzarDate);
      const clave = p.partida+'|'+fechaISO;
      if(existentes.has(clave)) return;
      existentes.add(clave);
      const fecha = fechaPinzarDate.toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'}).replace('.','');
      const clienteVariedad = p.variedad ? `${p.cliente} — ${p.variedad}` : p.cliente;
      trabajosData.push({
        id: 'trabajo_'+Date.now()+'_pinzar_'+Math.random().toString(36).slice(2,8),
        seccion:'mujeres', subseccion:'pinzar',
        fechaISO, fecha, hv,
        descripcion: `PINZAR ${p.partida} — ${clienteVariedad} (${hv}HV, entrega ${p.fentrega})`,
        personas: [],
        creadoPor: currentUser||'—', creadoEn: new Date().toLocaleString('es-ES'),
        origenPdfPartida: p.partida
      });
      creados++;
    });
    if(creados) await persistTrabajosData();
    return creados;
  }catch(e){
    console.error('Error programando pinzados desde PDF de Túnel:', e);
    return -1;
  }
}
async function autoCrearLineasDesdePdfControl(tipo, dia, pdfB64){
  if(bloquearAltaPasadaControlQC(dia))return -4;
  try{
    const base64 = pdfB64.split(',')[1];
    const binStr = atob(base64);
    const bytes = new Uint8Array(binStr.length);
    for(let i=0;i<binStr.length;i++) bytes[i] = binStr.charCodeAt(i);
    const lineas = await extraerLineasControlPdf(bytes);
    const partidas = parseControlPdfPartidas(lineas);
    if(!partidas.length) return -1;
    // Evita duplicar líneas si el mismo PDF se procesa más de una vez (p.ej.
    // al sustituir el PDF por el mismo archivo) — una partida puede aparecer
    // legítimamente más de una vez (repartida en varios destinos), así que
    // la clave de duplicado incluye también el Nº Band y el cliente/variedad.
    const existentes = new Set(controlChecksData.filter(c=>c.tipo===tipo && c.dia===dia).map(c=>c.partida+'|'+c.numBandejas+'|'+c.clienteVariedad));
    let creadas = 0;
    partidas.forEach((p,idx)=>{
      const clienteVariedad = p.variedad ? `${p.cliente} — ${p.variedad}` : p.cliente;
      // Normaliza tanto "65.0" como "1,0"/"30,0" (coma o punto decimal según
      // el PDF) a un entero limpio ("65", "1", "30").
      const numBandejas = p.nband.replace(',', '.').replace(/\.0$/, '');
      const clave = p.partida+'|'+numBandejas+'|'+clienteVariedad;
      if(existentes.has(clave)) return;
      existentes.add(clave);
      const nuevoId = 'control_'+Date.now()+'_'+idx+'_'+Math.random().toString(36).slice(2,8);
      controlChecksData.push({
        id: nuevoId,
        tipo, dia, clienteVariedad, partida: p.partida, numBandejas,
        // fentrega (Fecha Entrega del PDF) se guarda ahora también en la línea
        // — a petición de Paula (2026-08-05, módulo "Partidas") para poder
        // mostrarla en el mapa de calles, no solo usarla de paso para el
        // pinzado automático como hasta ahora.
        fentrega: p.fentrega || '',
        invId: null, calleDesde: null, calleHasta: null,
        color:{}, tamano:{}, sanidad:{}, flores:{}, raices:{}, observaciones:'',
        creadoPor: currentUser||'—', creadoEn: new Date().toLocaleString('es-ES'),
        origenPdf: true
      });
      marcarControlCheckSucio(nuevoId);
      creadas++;
    });
    // Bug real encontrado 2026-08-14: este persist no comprobaba el
    // resultado — si fallaba (p.ej. porque controlFotosData/controlChecksData
    // ya estaba al límite de tamaño de Firebase por fotos embebidas, ver
    // CONTROL_FOTOS_SHARD_MAX_CHARS más arriba), la función igual devolvía
    // "creadas" como si hubiera ido bien, y handleControlPdfInput mostraba
    // "✓ N líneas creadas" — una MENTIRA: las líneas solo existían en la
    // memoria del navegador, nunca llegaron a la nube. Un "Sincronizar"
    // posterior (que relee la nube fresca) las hacía desaparecer sin avisar,
    // como si se hubiera borrado todo. Ahora se comprueba de verdad y se
    // devuelve -2 (creadas pero SIN GUARDAR) para que el aviso sea honesto.
    if(creadas){
      const ok = await persistControlChecksData();
      if(!ok) return -2;
    }
    return creadas;
  }catch(e){
    console.error('Error leyendo PDF de Control:', e);
    return -1;
  }
}
// Lectura automática del PDF de Carga ("PARTE DE CARGA", formato de Grupo
// Semilleros La Sala, a petición de Paula 2026-07-31 tras subir dos PDFs
// reales) — MUCHO más simple que el de Túnel: cada partida cabe en UNA sola
// línea de texto ("HORA  CLIENTE  PARTIDA  VARIEDAD  Nº BAND  INVERNA
// CARROS..."), sin variedad en línea aparte. Reutiliza `extraerLineasControlPdf`
// (genérica, ya usada por Túnel) para la extracción por coordenadas — NO se
// toca ni se comparte lógica de parsing con parseControlPdfPartidas (el de
// Túnel), que Paula pidió no tocar.
function parseControlCargaPdfPartidas(lineas){
  // El campo INVERNA del PDF siempre es "nn-n-n" (invernadero-lado-tramo) —
  // exigir ese formato exacto es lo que evita que una VARIEDAD con un número
  // suelto en medio (p.ej. "TINJ KM 387 KRO") se confunda con Nº Band/Inverna:
  // sin esta exigencia el número "387" y la palabra "KRO" podían colarse como
  // si fueran Nº Band/Invernadero, cortando la Variedad a medias.
  // Formato "con hora" — el que traían los primeros PDFs de Carga (línea
  // empieza por "HH:MM").
  const mainReConHora = /^(?<hora>\d{2}:\d{2})\s+(?<cliente>.+?)\s+(?<partida>\d{2}[A-Z]{0,2}\d{4,6})\s+(?<variedad>.+?)\s+(?<nband>\d+)\s+(?<inverna>\d{1,2}-\d{1,2}-\d{1,2})(?:\s+(?<carros>.*))?$/;
  // Formato "sin hora" (a petición de Paula, 2026-08-26, tras un PDF real
  // donde ya no viene la columna de hora): la línea empieza directamente por
  // el cliente, con un prefijo opcional de una o dos letras (T, S/H, SH...)
  // delante del cliente en algunas filas.
  const mainReSinHora = /^(?:(?<prefijo>S\/H|SH|T)\s+)?(?<cliente>.+?)\s+(?<partida>\d{2}[A-Za-z]{0,2}\d{4,6})\s+(?<variedad>.+?)\s+(?<nband>\d+)\s+(?<inverna>\d{1,2}-\d{1,2}-\d{1,2})(?:\s+(?<carros>.*))?$/i;
  const cabeceraRe = /^(HORA|DIA:|PARTE DE CARGA|Página|Grupo Semilleros)/i;
  // Detección laxa de "aquí hay una partida" (solo el código, sin exigir el
  // resto de campos) — sirve para avisar cuando una línea SÍ trae una
  // partida real pero el resto del formato no encaja con ninguno de los dos
  // patrones de arriba (por ejemplo, el invernadero no viene como "nn-n-n",
  // o el texto se partió en dos líneas), en vez de descartarla en silencio
  // sin que nadie se entere de por qué no se creó la ficha.
  const partidaSueltaRe = /\d{2}[A-Z]{0,2}\d{4,6}/i;
  const records = [];
  const noReconocidas = [];
  lineas.forEach(l=>{
    const t = l.texto;
    if(!t || t==='***' || cabeceraRe.test(t)) return;
    const m = mainReConHora.exec(t) || mainReSinHora.exec(t);
    if(!m){
      if(partidaSueltaRe.test(t) && !/ZE|YE/i.test(t)) noReconocidas.push(t);
      return;
    }
    records.push({
      cliente: m.groups.cliente.trim(),
      partida: m.groups.partida.toUpperCase(),
      variedad: m.groups.variedad.trim(),
      nband: m.groups.nband,
      inverna: m.groups.inverna
    });
  });
  // Mismo filtro que en Túnel (parseControlPdfPartidas) — ver comentario allí.
  return { records: records.filter(r => !/ZE|YE/i.test(r.partida)), noReconocidas };
}
async function autoCrearLineasDesdePdfControlCarga(dia, pdfB64){
  if(bloquearAltaPasadaControlQC(dia))return -4;
  try{
    const base64 = pdfB64.split(',')[1];
    const binStr = atob(base64);
    const bytes = new Uint8Array(binStr.length);
    for(let i=0;i<binStr.length;i++) bytes[i] = binStr.charCodeAt(i);
    const lineas = await extraerLineasControlPdf(bytes);
    const { records: partidas, noReconocidas } = parseControlCargaPdfPartidas(lineas);
    // Guardado global (no solo devuelto) para poder mostrarlo también desde
    // el toast de aviso sin tener que rehacer el parseo — ver
    // handleControlPdfInput, que lo usa cuando no se creó ninguna línea pero
    // SÍ había texto de partida en el PDF (formato de fila distinto al
    // esperado, en vez de "no había nada que leer").
    window.ultimaCargaPdfNoReconocidas = noReconocidas;
    if(!partidas.length) return noReconocidas.length ? -3 : -1;
    // Misma partida puede repetirse en varias franjas horarias/invernaderos
    // el mismo día (confirmado en los PDF reales) — clave de duplicado con
    // todos los campos, igual que en Túnel.
    const existentes = new Set(controlChecksData.filter(c=>c.tipo==='carga' && c.dia===dia).map(c=>c.partida+'|'+c.numBandejas+'|'+c.cliente+'|'+c.variedad+'|'+c.invernadero));
    let creadas = 0;
    partidas.forEach((p,idx)=>{
      const clave = p.partida+'|'+p.nband+'|'+p.cliente+'|'+p.variedad+'|'+p.inverna;
      if(existentes.has(clave)) return;
      existentes.add(clave);
      const nuevoId = 'control_'+Date.now()+'_'+idx+'_'+Math.random().toString(36).slice(2,8);
      controlChecksData.push({
        id: nuevoId,
        tipo:'carga', dia,
        cliente: p.cliente, partida: p.partida, variedad: p.variedad, numBandejas: p.nband, invernadero: p.inverna,
        color:{}, tamano:{}, sanidad:{}, flores:{}, raices:{}, observaciones:'',
        creadoPor: currentUser||'—', creadoEn: new Date().toLocaleString('es-ES'),
        origenPdf: true
      });
      marcarControlCheckSucio(nuevoId);
      creadas++;
    });
    // Mismo arreglo que Túnel (2026-08-14): comprobar de verdad si se guardó.
    if(creadas){
      const ok = await persistControlChecksData();
      if(!ok) return -2;
    }
    return creadas;
  }catch(e){
    console.error('Error leyendo PDF de Carga:', e);
    return -1;
  }
}
// ════════════════════════════════════════════════════════════════
// "AÑADIR EXTENSIONES" en Check Túnel — a petición EXPLÍCITA de Paula,
// 2026-08-11 (la única excepción admitida a "no tocar Check Túnel", ver
// [[lasala_control_tunel_intocable]]): un PDF con 5 columnas (fecha de
// extensión, nº partida, invernadero, calle inicio, calle final) que
// asigna/actualiza AUTOMÁTICAMENTE la calle real de partidas YA EXISTENTES
// en Túnel (busca por nº de partida, tipo:'tunel') — NO crea líneas nuevas,
// solo actualiza su ubicación, reutilizando tal cual la función ya probada
// aplicarAsignarCalleControl (el mismo camino que usa el modal manual
// "Asignar calle") para no arriesgar nada del resto de Túnel. Solo cuentan
// las partidas cuyo código empieza por dígitos seguidos de X y/o F (26X,
// 26F...) — el resto de líneas del PDF se ignoran.
// ════════════════════════════════════════════════════════════════
// La fecha de extensión (1ª columna del PDF) ES la Salida de Túnel de esa
// partida (a petición de Paula, 2026-08-11) — se usa para fijar c.dia (el
// campo que ya usa el mapa de Partidas para el badge "ST:d/m", ver
// renderPartidasBloqueHTML). Conversión inversa de riegoDiaToDate: esa
// función hace `RIEGO_ANCHOR_DATE + (dia-15) días`, así que aquí se cuentan
// los días de diferencia con el ancla y se le suma 15.
function fechaExtensionADiaRiego(fechaTexto){
  const m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec((fechaTexto||'').trim());
  if(!m) return null;
  let [_, d, mo, y] = m;
  if(y.length===2) y = '20'+y;
  const fecha = new Date(+y, +mo-1, +d);
  if(isNaN(fecha.getTime())) return null;
  const diffDias = Math.round((fecha - RIEGO_ANCHOR_DATE) / 86400000);
  return 15 + diffDias;
}
// Los invernaderos de Sala 1 (0,1,2,3,4) y los pares 10/11 de Sala 2 se
// escriben en el PDF como un número SUELTO (ej. "1"), pero en la app esos
// invernaderos siempre llevan letra (1A/1B) — un simple "¿coincide con un
// invId real?" los descartaba TODOS (bug real, encontrado por Paula:
// "los invernaderos que solo tienen un número no los coge", partida
// 26X00020 → INV 1 se quedaba sin asignar). Se desambigua A/B probando en
// qué de los dos encaja el rango de calles — sus calles reales nunca se
// solapan entre A y B (confirmado en INV_LAYOUT_SALA1) — y probando
// también la calle "tal cual" y "sin el prefijo del código del
// invernadero" (por si el PDF trae la calle ya en el formato combinado
// código+calle que usa el resto de la app, ej. "173" = código "1" + calle
// "73", ver formatCalleConInv).
function resolverInvernaderoYCalles(codigoToken, calleDesdeTok, calleHastaTok){
  // El PDF real trae el invernadero con ceros a la izquierda ("01","02",
  // "03","04" para Sala 1) — hay que quitarlos (parseInt+toString) antes de
  // comparar, si no "01" nunca coincide con el código real "1" de 1A/1B
  // (bug real encontrado con la partida 26X00020, PDF "12 AGOSTO
  // EXTENSIONES.pdf": invernadero venía como "01").
  const codigoDigitos = String(codigoToken).replace(/[^0-9]/g,'');
  const codigo = codigoDigitos ? String(parseInt(codigoDigitos,10)) : '';
  if(!codigo) return null;
  const candidatas = Object.keys(INV_LAYOUT).filter(id=>codigoInv(id)===codigo);
  if(!candidatas.length) return null;
  const aNumero = t => { const n = parseInt(String(t).replace(',','.'),10); return isNaN(n)?null:n; };
  const desdeCrudo = aNumero(calleDesdeTok), hastaCrudo = aNumero(calleHastaTok);
  if(desdeCrudo==null) return null;
  const sinPrefijo = t => {
    const s = String(t);
    return (s.startsWith(codigo) && s.length>codigo.length) ? parseInt(s.slice(codigo.length),10) : null;
  };
  const intentos = [
    {desde:desdeCrudo, hasta:hastaCrudo??desdeCrudo},
    {desde:sinPrefijo(calleDesdeTok), hasta:sinPrefijo(calleHastaTok)??sinPrefijo(calleDesdeTok)}
  ].filter(t=>t.desde!=null && t.hasta!=null);
  for(const intento of intentos){
    for(const invId of candidatas){
      const todas = [...INV_LAYOUT[invId].row1, ...INV_LAYOUT[invId].row2];
      if(todas.includes(intento.desde) && todas.includes(intento.hasta)) return {invId, calleDesde:Math.min(intento.desde,intento.hasta), calleHasta:Math.max(intento.desde,intento.hasta)};
    }
  }
  // Sin ambigüedad (una sola candidata) — mejor asignar aproximado (el rango
  // crudo) que dejarla sin asignar del todo.
  if(candidatas.length===1 && desdeCrudo!=null) return {invId:candidatas[0], calleDesde:Math.min(desdeCrudo,hastaCrudo??desdeCrudo), calleHasta:Math.max(desdeCrudo,hastaCrudo??desdeCrudo)};
  return null;
}
function parseExtensionesPdf(lineas){
  const PARTIDA_RE = /^\d+[XF]+\d{3,6}$/i;
  const FECHA_RE = /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/;
  const registros = [];
  lineas.forEach(({texto})=>{
    if(!texto) return;
    const tokens = texto.split(/\s+/).filter(Boolean);
    const idxPartida = tokens.findIndex(t=>PARTIDA_RE.test(t));
    if(idxPartida===-1) return;
    const partida = tokens[idxPartida].toUpperCase();
    const fecha = tokens.slice(0, idxPartida).reverse().find(t=>FECHA_RE.test(t)) || '';
    const resto = tokens.slice(idxPartida+1);
    if(resto.length<2) return;
    const resuelto = resolverInvernaderoYCalles(resto[0], resto[1], resto[2]);
    if(!resuelto) return;
    registros.push({ fecha, partida, ...resuelto });
  });
  return registros;
}
async function handleExtensionesPdfInput(input){
  if(!input.files || !input.files[0]) return;
  const file = input.files[0];
  try{
    const bytes = new Uint8Array(await file.arrayBuffer());
    const lineas = await extraerLineasControlPdf(bytes);
    const registros = parseExtensionesPdf(lineas);
    if(!registros.length){ showToast('No se encontraron partidas 26X/26F reconocibles en ese PDF'); input.value=''; return; }
    // Este import solo busca y modifica líneas de Túnel. Cargar Carga
    // completa era innecesario. Se fuerza lectura fresca de todos los shards
    // v2 de Túnel porque después se modifican líneas y hay que partir del
    // estado actual de Firebase, no de una caché parcial.
    const tunelOk = await loadControlTipoCompleto('tunel');
    if(!tunelOk){ avisarFalloCarga(); input.value=''; return; }
    // aplicarAsignarCalleControl cierra el modal #control-calle-overlay al
    // terminar — si nunca se abrió en esta sesión el elemento no existe
    // todavía y esa línea lanzaría un error; se crea aquí (oculto) para que
    // el cierre no falle al llamarla en lote desde este import.
    getOrCreateOverlay('control-calle-overlay');
    let asignadas = 0, sinEncontrar = 0;
    for(const r of registros){
      const coincidencias = controlChecksData.filter(c=>c.tipo==='tunel' && c.partida===r.partida);
      if(!coincidencias.length){ sinEncontrar++; continue; }
      const diaExtension = fechaExtensionADiaRiego(r.fecha);
      for(const c of coincidencias){
        // La fecha de extensión ES su Salida de Túnel (a petición de Paula) —
        // se fija en el propio objeto ANTES de llamar a
        // aplicarAsignarCalleControl, que es quien persiste de verdad; así el
        // guardado de invId/tramos y el de "dia" van en la misma escritura.
        if(diaExtension!=null) c.dia = diaExtension;
        // Marca de "asignada por extensión" (a petición de Paula, 2026-08-12:
        // botón "Comprobar extensiones") — no afecta a nada más, solo permite
        // listar después qué partidas recibieron su calle por esta vía.
        c.extensionFecha = r.fecha;
        c.extensionAplicadaEn = new Date().toLocaleString('es-ES');
        await aplicarAsignarCalleControl(c.id, r.invId, [{desde:r.calleDesde, hasta:r.calleHasta}]);
        asignadas++;
      }
    }
    logHistorial(`Añadió extensiones desde PDF: ${asignadas} línea(s) de Túnel actualizadas (${registros.length} partidas leídas, ${sinEncontrar} sin encontrar)`);
    showToast(`✓ ${asignadas} línea(s) actualizadas${sinEncontrar?` · ${sinEncontrar} partida(s) del PDF no encontradas en Túnel`:''}`);
    renderControlContent(document.getElementById('control-overlay'));
  }catch(e){
    console.error('Error leyendo PDF de extensiones:', e);
    showToast('Error al leer el PDF de extensiones');
  }
  input.value = '';
}
// "Comprobar extensiones" (a petición de Paula, 2026-08-12): lista todas las
// líneas de Túnel que tienen calle asignada por esta vía (marca
// c.extensionFecha), no solo las de la última subida — reutiliza el mismo
// listado imprimible que las estadísticas del dashboard.
function mostrarComprobarExtensiones(){
  const lineas = controlChecksData.filter(c=>c.tipo==='tunel' && c.extensionFecha)
    .sort((a,b)=> String(b.extensionAplicadaEn||'').localeCompare(String(a.extensionAplicadaEn||'')));
  mostrarListadoPartidasControl('Partidas con calle asignada por extensiones', lineas);
}
// Entrada cuantitativa opcional durante la transición: no cambia los checks legacy.
// Se comprueban los permisos de nuevo en el servidor (no basta con ocultar el botón).
function puedeCuantificarControl(c){
  return !!c&&(currentUserRole==='ADMIN'||currentUserRole==='TECNICO'||
    (currentUserRole==='CARGADOR'&&c.tipo==='carga'))&&
    /^[A-Za-z0-9_-]{1,180}$/.test(String(c.id||''));
}
function enlacePartidaCuantificadaHTML(c){
  const label=String(c.partida||'— Sin partida —')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  if(!puedeCuantificarControl(c))
    return `<div class="qco-partida-title">${label}</div>`;
  return `<button type="button" class="qco-partida-title qco-partida-link"
    onclick="abrirMedicionesControl('${c.id}')" title="Abrir cantidades QC"
    aria-label="Abrir QC de partida ${label}">${label}</button>`;
}
function anclaCuantificacionControlHTML(c){
  return puedeCuantificarControl(c)?
    `<span hidden data-qco-anchor="${c.id}"></span>`:'';
}
function botonCuantificacionControlHTML(c){
  if(!puedeCuantificarControl(c))return '';
  return `<div style="margin:8px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    <button type="button" onclick="abrirMedicionesControl('${c.id}')"
      title="Introducir cantidades de bandejas por característica"
      style="display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:42px;background:#1558a0;color:#fff;border:0;border-radius:8px;padding:11px 17px;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 2px 8px rgba(21,88,160,.17)">
      <i class="ti ti-clipboard-check" aria-hidden="true"></i> Medir bandejas QC</button>
    </div>`;
}

/* QC 0.111 corrigido: IndexedDB local + SharePoint definitivo.
 * Las fotografías históricas Firebase son estrictamente de lectura.
 * Ninguna fotografía nueva se escribe en RTDB.
 */
window.QCPhotoMainSession=()=>({user:currentUser,role:currentUserRole});
let qcPhotoSession='';
const qcPhotoObjectUrls=new Map();
async function qcPhotoReady(){
  if(!window.QCOfflinePhotos)throw Error('El módulo de fotos sin conexión no está disponible.');
  if(!currentUser||!['ADMIN','TECNICO','CARGADOR'].includes(currentUserRole))
    throw Error('Inicia sesión para guardar fotografías.');
  const key=currentUser+'|'+currentUserRole;
  if(key!==qcPhotoSession){
    await window.QCOfflinePhotos.init(currentUser,currentUserRole);
    qcPhotoSession=key;
    for(const src of qcPhotoObjectUrls.values())URL.revokeObjectURL(src);
    qcPhotoObjectUrls.clear();
  }
}
function qcPhotoRef(id){
  const c=controlChecksData.find(x=>x.id===id);
  if(!c||!['tunel','carga'].includes(c.tipo)||
     !/^[A-Za-z0-9_-]{1,180}$/.test(id))throw Error('Inspección no disponible.');
  return {id:c.id,tipo:c.tipo,dia:c.dia,partida:c.partida};
}
function qcPhotoBlobSrc(key,blob){
  if(qcPhotoObjectUrls.has(key))return qcPhotoObjectUrls.get(key);
  const uri=URL.createObjectURL(blob);
  qcPhotoObjectUrls.set(key,uri);
  return uri;
}
async function listarFotosInspeccionQC(id){
  await qcPhotoReady();
  const ref=qcPhotoRef(id),result=[];
  // Foto histórica: lectura antigua compatible, sin cambio de formato.
  if(!controlFotosData[id])await fetchFotoPartidaPorId(id);
  const historical=controlFotosData[id];
  if(historical){
    const full=fotoSrcCompleta(historical),tiny=fotoSrcMiniatura(historical);
    if(full)result.push({id:'historica',f:full,t:tiny||full,readonly:true,legacy:true});
  }
  const local=await window.QCOfflinePhotos.galleryLocal(ref);
  for(const entry of local){
    const src=qcPhotoBlobSrc('local/'+entry.id,entry.blob);
    result.push({id:entry.id,f:src,t:src,pending:true,estado:entry.status,
      fecha:entry.fecha});
  }
  if(navigator.onLine!==false){
    try{
      const remote=await window.QCOfflinePhotos.galleryRemote(ref);
      for(const entry of remote){
        if(result.some(x=>x.id===entry.id))continue;
        try{
          const photo=await window.QCOfflinePhotos.galleryRemoteBlob(ref,entry.id);
          const src=qcPhotoBlobSrc('sp/'+entry.id,photo);
          result.push({id:entry.id,f:src,t:src,sharepoint:true,fecha:entry.fecha});
        }catch(e){
          result.push({id:entry.id,readonly:true,error:true,estado:'SharePoint: miniatura no disponible'});
        }
      }
    }catch(e){
      if(!result.length)throw e;
      showToast('Galería SharePoint no disponible. Se muestran las fotos locales.');
    }
  }
  // Compatibilidad: los bytes experimentales QC multifoto subidos previamente
  // a Firebase TEST quedan visibles como solo lectura, pendientes de migración.
  try{
    const url=CLOUD_DB_URL+'/lasala-qc-multifotos-v1/'+ref.tipo+'/'+encodeURIComponent(ref.id)+'.json';
    const r=await appFetch(url,{cache:'no-store'});
    if(r.ok){
      const old=await r.json();
      Object.entries(old?.fotos||{}).forEach(([key,value])=>{
        if(value?.f)result.push({id:'experimental/'+key,f:value.f,
          t:value.t||value.f,readonly:true,legacy:true,
          estado:'Foto TEST antigua pendiente de migración'});
      });
    }
  }catch(_){}
  return result;
}
async function agregarFotosInspeccionQC(input,id){
  await qcPhotoReady();
  const count=await window.QCOfflinePhotos.galleryCapture(qcPhotoRef(id),input.files);
  showToast('✓ '+count+' foto(s) guardadas en este dispositivo');
  window.dispatchEvent(new Event('qc-local-updated'));
  return {count,sent:false};
}
async function enviarFotosPendientesQC(id){
  await qcPhotoReady();
  return window.QCOfflinePhotos.gallerySend(qcPhotoRef(id));
}
async function eliminarFotoInspeccionQC(id,photoId){
  await qcPhotoReady();
  const ref=qcPhotoRef(id);
  if(photoId==='historica'||photoId.startsWith('experimental/'))
    throw Error('La fotografía histórica se conserva en modo lectura.');
  const local=(await window.QCOfflinePhotos.galleryLocal(ref)).some(x=>x.id===photoId);
  if(local)await window.QCOfflinePhotos.galleryDeleteLocal(ref,photoId);
  else await window.QCOfflinePhotos.galleryRemoveRemote(ref,photoId);
  const key=(local?'local/':'sp/')+photoId;
  const src=qcPhotoObjectUrls.get(key);
  if(src){URL.revokeObjectURL(src);qcPhotoObjectUrls.delete(key);}
  return true;
}
function ampliarFotoInspeccionQC(photo){
  if(!photo?.f||!(/^(data:image\/|blob:)/i.test(photo.f)))return;
  const mo=getOrCreateOverlay('control-foto-ampliada-overlay');
  mo.style.padding='0';mo.replaceChildren();
  const shade=document.createElement('div');
  shade.style.cssText='position:relative;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.88)';
  const img=document.createElement('img');
  img.src=photo.f;img.alt='Fotografía QC ampliada';
  img.style.cssText='max-width:94vw;max-height:94vh;object-fit:contain;border-radius:8px';
  const close=document.createElement('button');close.type='button';close.textContent='✕';
  close.setAttribute('aria-label','Cerrar foto');
  close.style.cssText='position:absolute;top:14px;right:14px;border:0;border-radius:9px;background:white;color:#17324e;min-height:43px;min-width:43px;cursor:pointer';
  close.addEventListener('click',ev=>{ev.stopPropagation();mo.style.display='none'});
  shade.addEventListener('click',()=>mo.style.display='none');
  img.addEventListener('click',ev=>ev.stopPropagation());
  shade.append(img,close);mo.append(shade);mo.style.display='flex';
}

function abrirMedicionesControl(id){
  const c=controlChecksData.find(item=>item.id===id);
  if(!c){showToast('No se ha encontrado el control. Actualiza la lista.');return;}
  if(!window.QCOperativo){showToast('El formulario de mediciones no está disponible.');return;}
  cargarFotoControlSiFalta(c.id);
  window.QCOperativo.open(c,{
    getObservations:()=>c.observaciones||'',
    saveObservations:value=>guardarControlObservaciones(c.id,value),
    listPhotos:()=>listarFotosInspeccionQC(c.id),
    openPhoto:photo=>ampliarFotoInspeccionQC(photo),
    uploadPhoto:input=>agregarFotosInspeccionQC(input,c.id),
    deletePhoto:photoId=>eliminarFotoInspeccionQC(c.id,photoId)
  });
}
// Tarjeta compacta solo para acceso QC cuantitativo; legacy y Ginés permanecen intactos.
function renderControlCardCompactHTML(c,seccion){
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const tunel=c.tipo==='tunel';
  cargarFotoControlSiFalta(c.id);
  const imagen=controlFotosData[c.id], pdf=controlPdfsData[seccion.key+'|'+c.dia];
  cargarControlPdfDia(seccion.key,c.dia);
  const pdfHTML=pdf?`<div class="qc-card-pdf"><i class="ti ti-file-type-pdf"></i> ${esc(pdf.nombre)} · <a href="${pdf.pdfB64}" target="_blank" rel="noopener noreferrer">Ver PDF</a></div>`:'';
  const fotoHTML=imagen?`<img src="${fotoSrcMiniatura(imagen)}" onclick="mostrarFotoControlAmpliada('${c.id}')" title="Ver foto" alt="Foto de inspección" class="qc-card-photo" />`:'';
  const editAction=tunel?'mostrarEditarControlCheck':'mostrarEditarControlCargaCheck';
  return `
    <article id="control-card-${c.id}" class="qc-card-compact">
      <div class="qc-card-main">
        ${renderControlIdentidadQC(c)}
        ${renderControlDatosQC(c)}
        ${renderControlAbrirInspeccionHTML(c)}
        ${anclaCuantificacionControlHTML(c)}
      </div>
      <details class="qc-card-more">
        <summary>Detalles y acciones</summary>
        <div class="qc-card-details">
          <div class="qc-card-actionbar">
            <button type="button" onclick="${editAction}('${c.id}')"><i class="ti ti-pencil" aria-hidden="true"></i> Editar partida</button>
            <button type="button" class="qc-card-danger qc-card-trash" onclick="eliminarControlCheck('${c.id}')" title="Eliminar registro de partida" aria-label="Eliminar registro de partida"><i class="ti ti-trash" aria-hidden="true"></i></button>
          </div>
          ${pdfHTML}
          <div data-qc-legacy-extras="${c.id}" class="qc-card-evidence">
            <label class="qc-card-observaciones">Observaciones
              <input type="text" value="${esc(c.observaciones)}" placeholder="Sin observaciones"
                onchange="guardarControlObservaciones('${c.id}',this.value)" />
            </label>

          </div>
        </div>
      </details>
    </article>`;
}
function renderControlCardHTML(c, seccion){
  // Carga tiene una ficha distinta (Cliente/Partida/Variedad/Nº bandejas/
  // Invernadero como campos separados, sin calle) — se despacha a su propia
  // función ANTES de tocar nada más, para no arriesgar ni una coma del
  // render de Túnel, que Paula pidió expresamente no tocar (2026-07-31,
  // "el check de túneles está perfecto, no modifiques nada de ahí").
  if(c.tipo === 'carga') return renderControlCargaCardHTML(c, seccion);
  if(puedeCuantificarControl(c)) return renderControlCardCompactHTML(c,seccion);
  const escapar = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const calleRealLabel = c.invId ? `INV ${escapar(c.invId)} — ${escapar(formatTramosLabel(c.invId, (c.tramos && c.tramos.length) ? c.tramos : [{desde:c.calleDesde, hasta:c.calleHasta}]))}` : '<span style="font-style:italic">Sin asignar</span>';
  // Cada categoría con su propio color/icono (a petición de Paula,
  // 2026-07-31) — la opción activa se pinta con el degradado de la
  // categoría, la inactiva con un tinte claro del mismo color (no blanco
  // plano), para que se note de un vistazo qué está marcado.
  // En la vista operativa moderna no se vuelven a ofrecer los selectores
  // heredados: la partida abre la medición por cantidades. Se mantienen
  // sus datos y sus funciones para consulta histórica y compatibilidad.
  const categoriasHTML = puedeCuantificarControl(c) ? '' : CONTROL_CHECK_CATEGORIAS.map(cat=>{
    const opcionesHTML = cat.opciones.map(o=>{
      const activo = !!(c[cat.key] && c[cat.key][o.key]);
      return `<button onclick="toggleControlCheckOpcion('${c.id}','${cat.key}','${o.key}')" style="padding:6px 12px;border-radius:999px;font-size:11px;font-weight:700;cursor:pointer;border:1.5px solid transparent;background:${activo?cat.gradiente:cat.tinte};color:${activo?'#fff':'var(--text)'}">${activo?'✓ ':''}${o.label}</button>`;
    }).join('');
    // Sanidad→Enferma despliega el detalle de qué enfermedad es (a
    // petición de Paula, 2026-08-01).
    const enfermedadesHTML = (cat.key==='sanidad' && c.sanidad && c.sanidad.enferma) ? `
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:7px;padding-top:7px;border-top:1px dashed rgba(0,0,0,.12)">
        ${SANIDAD_ENFERMEDADES.map(e=>{
          const activo = !!(c.sanidadEnfermedades && c.sanidadEnfermedades[e.key]);
          return `<button onclick="toggleControlSanidadEnfermedad('${c.id}','${e.key}')" style="padding:5px 10px;border-radius:999px;font-size:10px;font-weight:700;cursor:pointer;border:1.5px solid transparent;background:${activo?'#c62828':'#fdece5'};color:${activo?'#fff':'var(--text)'}">${activo?'✓ ':''}${e.label}</button>`;
        }).join('')}
      </div>` : '';
    return `
    <div style="margin-bottom:10px">
      <div style="font-size:10px;font-weight:800;color:var(--text);text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px;display:flex;align-items:center;gap:5px">
        <i class="ti ${cat.icon}" style="font-size:13px"></i> ${cat.label}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${opcionesHTML}</div>
      ${enfermedadesHTML}
    </div>`;
  }).join('');
  cargarFotoControlSiFalta(c.id);
  const fotoHTML = controlFotosData[c.id]
    ? `<img src="${fotoSrcMiniatura(controlFotosData[c.id])}" onclick="mostrarFotoControlAmpliada('${c.id}')" style="max-height:64px;border-radius:8px;border:1px solid var(--border);cursor:pointer;margin-right:8px" title="Ver foto">`
    : '';

  // Información del PDF del día de esta línea
  const pdfDelDia = controlPdfsData[seccion.key+'|'+c.dia];
  cargarControlPdfDia(seccion.key, c.dia);
  const pdfInfoHTML = pdfDelDia ? `<div style="font-size:10px;color:var(--muted);margin-top:8px;padding-top:8px;border-top:1px solid var(--border);display:flex;align-items:center;gap:6px;flex-wrap:wrap">
    <i class="ti ti-file-type-pdf" style="font-size:13px;color:#c62828"></i>
    <span><strong>${escapar(pdfDelDia.nombre)}</strong></span>
    <a href="${pdfDelDia.pdfB64}" target="_blank" style="color:#1558a0;font-weight:700;text-decoration:none;font-size:10px">Ver</a>
    <span style="font-size:10px;color:var(--muted)">— ${escapar(pdfDelDia.subidoPor)} · ${escapar(pdfDelDia.subidoEn)}</span>
  </div>` : '';

  return `
    <div id="control-card-${c.id}" style="border:1.5px solid var(--border);border-radius:12px;padding:14px 16px;background:#fff;box-shadow:var(--shadow-sm);transition:outline .2s">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
        <div>
          ${renderControlIdentidadQC(c)}
          ${renderControlDatosQC(c)}
          ${pdfInfoHTML}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button onclick="mostrarAsignarCalleControl('${c.id}')" title="Editar ubicación" style="padding:5px 9px;font-size:11px;font-weight:700;background:#e8f2fd;color:#1558a0;border:1px solid #9ab8d8;border-radius:6px;cursor:pointer;white-space:nowrap">
            <i class="ti ti-map-pin" style="font-size:12px"></i>
          </button>
          <button onclick="mostrarEditarControlCheck('${c.id}')" title="Editar" style="padding:5px 9px;font-size:11px;font-weight:700;background:#fff8e1;color:#c47f00;border:1px solid #e0c080;border-radius:6px;cursor:pointer;white-space:nowrap">
            <i class="ti ti-pencil" style="font-size:12px"></i>
          </button>
          <button onclick="eliminarControlCheck('${c.id}')" title="Eliminar" style="padding:5px 9px;font-size:11px;font-weight:700;background:#fdecea;color:#c62828;border:1px solid #f0b0b0;border-radius:6px;cursor:pointer;white-space:nowrap">🗑️</button>
        </div>
      </div>
      ${anclaCuantificacionControlHTML(c)}
      ${categoriasHTML ? `<div style="margin-top:12px">${categoriasHTML}</div>` : ''}
      <div data-qc-legacy-extras="${c.id}" style="margin-top:6px;display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap">
        <div style="flex:1;min-width:180px">
          <div style="font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">Observaciones</div>
          <input type="text" value="${escapar(c.observaciones)}" placeholder="Sin observaciones"
            onchange="guardarControlObservaciones('${c.id}', this.value)"
            style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:7px;font-size:12px">
        </div>
        <div style="display:flex;align-items:center">
          ${fotoHTML}
          <label style="display:inline-flex;align-items:center;gap:6px;padding:8px 12px;background:#eaf5ea;border:1.5px solid #a5d6a7;border-radius:8px;cursor:pointer;font-size:11px;font-weight:700;color:#2e7d32;white-space:nowrap">
            <i class="ti ti-camera" style="font-size:14px"></i> ${controlFotosData[c.id]?'Cambiar foto':'Añadir foto'}
            <input type="file" accept="image/*" capture="environment" style="display:none" onchange="handleControlFotoInput(this,'${c.id}')">
          </label>
        </div>
      </div>
    </div>`;
}
// Ficha de Check Carga — Paula pidió campos separados (Cliente/Partida/
// Variedad/Nº bandejas/Invernadero, sin calle) en vez del "Cliente y
// variedad" combinado + calle real de Túnel. Duplica a propósito el bloque
// de categorías/foto de renderControlCardHTML (en vez de compartir código)
// para no arriesgar el render de Túnel con ninguna refactorización.
function renderControlCargaCardHTML(c, seccion){
  if(puedeCuantificarControl(c)) return renderControlCardCompactHTML(c,seccion);
  const escapar = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // En la vista operativa moderna no se vuelven a ofrecer los selectores
  // heredados: la partida abre la medición por cantidades. Se mantienen
  // sus datos y sus funciones para consulta histórica y compatibilidad.
  const categoriasHTML = puedeCuantificarControl(c) ? '' : CONTROL_CHECK_CATEGORIAS.map(cat=>{
    const opcionesHTML = cat.opciones.map(o=>{
      const activo = !!(c[cat.key] && c[cat.key][o.key]);
      return `<button onclick="toggleControlCheckOpcion('${c.id}','${cat.key}','${o.key}')" style="padding:6px 12px;border-radius:999px;font-size:11px;font-weight:700;cursor:pointer;border:1.5px solid transparent;background:${activo?cat.gradiente:cat.tinte};color:${activo?'#fff':'var(--text)'}">${activo?'✓ ':''}${o.label}</button>`;
    }).join('');
    const enfermedadesHTML = (cat.key==='sanidad' && c.sanidad && c.sanidad.enferma) ? `
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:7px;padding-top:7px;border-top:1px dashed rgba(0,0,0,.12)">
        ${SANIDAD_ENFERMEDADES.map(e=>{
          const activo = !!(c.sanidadEnfermedades && c.sanidadEnfermedades[e.key]);
          return `<button onclick="toggleControlSanidadEnfermedad('${c.id}','${e.key}')" style="padding:5px 10px;border-radius:999px;font-size:10px;font-weight:700;cursor:pointer;border:1.5px solid transparent;background:${activo?'#c62828':'#fdece5'};color:${activo?'#fff':'var(--text)'}">${activo?'✓ ':''}${e.label}</button>`;
        }).join('')}
      </div>` : '';
    return `
    <div style="margin-bottom:10px">
      <div style="font-size:10px;font-weight:800;color:var(--text);text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px;display:flex;align-items:center;gap:5px">
        <i class="ti ${cat.icon}" style="font-size:13px"></i> ${cat.label}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${opcionesHTML}</div>
      ${enfermedadesHTML}
    </div>`;
  }).join('');
  cargarFotoControlSiFalta(c.id);
  const fotoHTML = controlFotosData[c.id]
    ? `<img src="${fotoSrcMiniatura(controlFotosData[c.id])}" onclick="mostrarFotoControlAmpliada('${c.id}')" style="max-height:64px;border-radius:8px;border:1px solid var(--border);cursor:pointer;margin-right:8px" title="Ver foto">`
    : '';

  // Información del PDF del día de esta línea
  const pdfDelDia = controlPdfsData[seccion.key+'|'+c.dia];
  cargarControlPdfDia(seccion.key, c.dia);
  const pdfInfoHTML = pdfDelDia ? `<div style="font-size:10px;color:var(--muted);margin-top:8px;padding-top:8px;border-top:1px solid var(--border);display:flex;align-items:center;gap:6px;flex-wrap:wrap">
    <i class="ti ti-file-type-pdf" style="font-size:13px;color:#c62828"></i>
    <span><strong>${escapar(pdfDelDia.nombre)}</strong></span>
    <a href="${pdfDelDia.pdfB64}" target="_blank" style="color:#1558a0;font-weight:700;text-decoration:none;font-size:10px">Ver</a>
    <span style="font-size:10px;color:var(--muted)">— ${escapar(pdfDelDia.subidoPor)} · ${escapar(pdfDelDia.subidoEn)}</span>
  </div>` : '';

  return `
    <div id="control-card-${c.id}" style="border:1.5px solid var(--border);border-radius:12px;padding:14px 16px;background:#fff;box-shadow:var(--shadow-sm);transition:outline .2s">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
        <div>
          ${renderControlIdentidadQC(c)}
          ${renderControlDatosQC(c)}
          ${pdfInfoHTML}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button onclick="mostrarEditarControlCargaCheck('${c.id}')" title="Editar" style="padding:5px 9px;font-size:11px;font-weight:700;background:#fff8e1;color:#c47f00;border:1px solid #e0c080;border-radius:6px;cursor:pointer;white-space:nowrap">
            <i class="ti ti-pencil" style="font-size:12px"></i>
          </button>
          <button onclick="eliminarControlCheck('${c.id}')" title="Eliminar" style="padding:5px 9px;font-size:11px;font-weight:700;background:#fdecea;color:#c62828;border:1px solid #f0b0b0;border-radius:6px;cursor:pointer;white-space:nowrap">🗑️</button>
        </div>
      </div>
      ${anclaCuantificacionControlHTML(c)}
      ${categoriasHTML ? `<div style="margin-top:12px">${categoriasHTML}</div>` : ''}
      <div data-qc-legacy-extras="${c.id}" style="margin-top:6px;display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap">
        <div style="flex:1;min-width:180px">
          <div style="font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">Observaciones</div>
          <input type="text" value="${escapar(c.observaciones)}" placeholder="Sin observaciones"
            onchange="guardarControlObservaciones('${c.id}', this.value)"
            style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:7px;font-size:12px">
        </div>
        <div style="display:flex;align-items:center">
          ${fotoHTML}
          <label style="display:inline-flex;align-items:center;gap:6px;padding:8px 12px;background:#eaf5ea;border:1.5px solid #a5d6a7;border-radius:8px;cursor:pointer;font-size:11px;font-weight:700;color:#2e7d32;white-space:nowrap">
            <i class="ti ti-camera" style="font-size:14px"></i> ${controlFotosData[c.id]?'Cambiar foto':'Añadir foto'}
            <input type="file" accept="image/*" capture="environment" style="display:none" onchange="handleControlFotoInput(this,'${c.id}')">
          </label>
        </div>
      </div>
    </div>`;
}
// No se admiten altas manuales QC con fecha anterior a hoy, ningún rol exceptuado.
function puedeCrearLineaControlQC(dia){return Number.isInteger(dia)&&dia>=riegoDiaDeHoy();}
// Recuperación de un registro creado válidamente sin conexión un día anterior.
// Solo aplica a una acción ya encolada: nunca autoriza pulsar Añadir/Guardar
// en fechas pasadas. En caso de formato de fecha dudoso, la cola se conserva.
function altaQCOfflineOriginalValida(dia,queuedAt){
  if(!Number.isInteger(dia)||typeof queuedAt!=='string')return false;
  const match=queuedAt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D|$)/);
  if(!match)return false;
  const day=Number(match[1]),month=Number(match[2]),year=Number(match[3]);
  if(year<2020||year>2100||month<1||month>12||day<1||day>31)return false;
  const when=new Date(year,month-1,day);
  if(when.getFullYear()!==year||when.getMonth()!==month-1||when.getDate()!==day)return false;
  const target=riegoDiaToDate(dia);
  return target instanceof Date&&Number.isFinite(target.getTime())&&
    fechaLocalISO(target)>=fechaLocalISO(when);
}
function bloquearAltaPasadaControlQC(dia){
  if(puedeCrearLineaControlQC(dia))return false;
  showToast('No se pueden añadir líneas manuales a días anteriores a hoy.');
  return true;
}
/* 0.103. Alta QC manual controlada: partida libre; catálogos de identidad
 * derivados de partes PDF ya importados, no de un maestro de clientes.
 * Formulario ÚNICO y completo en Túnel y Carga, sin búsqueda previa de partida.
 */
let controlAltaQCContext=null;
function qcAltaEsc(v){return String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function qcAltaFechaContextoValida(ctx){
  return !!ctx && (ctx.wizard ? controlWizardDiaSel : controlDiaSel)===ctx.dia &&
    controlSeccion===ctx.tipo && puedeCrearLineaControlQC(ctx.dia);
}
// Obtener solamente combinaciones cliente+variedad documentadas. En Túnel,
// los PDF antiguos guardan ambos campos en "clienteVariedad", separados por " — ".
// No dividir texto sin separador ni inventar nombres o variedades.
function qcAltaCatalogo(){
  const visto=new Set(),pares=[];
  controlChecksData.forEach(c=>{
    if(!c || !(c.origenPdf===true ||
      (c.origenAltaQC?.fuente==='manual' && c.origenAltaQC?.catalogoControlado===true)))return;
    let cliente=String(c.cliente||'').trim();
    let variedad=String(c.variedad||'').trim();
    if((!cliente||!variedad) && c.tipo==='tunel'){
      const combinado=String(c.clienteVariedad||'').trim();
      const sep=combinado.lastIndexOf(' — ');
      if(sep>0){cliente=combinado.slice(0,sep).trim();variedad=combinado.slice(sep+3).trim();}
    }
    if(!cliente||!variedad)return;
    const clave=cliente.toLocaleUpperCase('es')+'\u0000'+variedad.toLocaleUpperCase('es');
    if(visto.has(clave))return;
    visto.add(clave);pares.push({cliente,variedad});
  });
  return pares.sort((a,b)=>a.cliente.localeCompare(b.cliente,'es') ||
    a.variedad.localeCompare(b.variedad,'es'));
}
function qcAltaVistaHTML(ctx){
  const invs=[
    ['Sala 1',ALL_INV_IDS_SALA1],['Sala 2',ALL_INV_IDS],
    ['Sala 3',ALL_INV_IDS_SALA3],['Sala 4',ALL_INV_IDS_SALA4],['Sala 5',ALL_INV_IDS_SALA5]
  ];
  const invOpts=invs.map(([sala,ids])=>'<optgroup label="'+qcAltaEsc(sala)+'">'+
    ids.map(id=>'<option value="'+qcAltaEsc(id)+'">INV '+qcAltaEsc(id)+'</option>').join('')+
    '</optgroup>').join('');
  const clientes=[...new Set(ctx.catalogo.map(p=>p.cliente))].sort((a,b)=>a.localeCompare(b,'es'));
  const clientesOpts=clientes.map(c=>'<option value="'+qcAltaEsc(c)+'">'+qcAltaEsc(c)+'</option>').join('');
  const css='width:100%;min-width:0;padding:11px;border:1.5px solid #b7cce1;border-radius:8px;font-size:13px;background:#fff';
  return '<section class="qc-card-compact" aria-label="Añadir línea QC" style="padding:14px;margin-bottom:14px">'+
    '<div style="font-size:16px;font-weight:800;color:#1558a0;margin-bottom:12px">Añadir línea · '+qcAltaEsc(riegoDiaLabelCorto(ctx.dia))+'</div>'+
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:11px">'+
      '<div><label for="qc-alta-partida" style="display:block;font-size:12px;font-weight:700;margin-bottom:5px">Nº de partida</label>'+
      '<input id="qc-alta-partida" type="text" autocomplete="off" autocapitalize="characters" maxlength="24" placeholder="Ej. 26X02292" oninput="qcAltaActualizarGuardar()"'+
      ' style="'+css+'"></div>'+
      '<div><label for="qc-alta-bandejas" style="display:block;font-size:12px;font-weight:700;margin-bottom:5px">Bandejas declaradas</label>'+
      '<input id="qc-alta-bandejas" type="number" min="1" step="1" inputmode="numeric" oninput="qcAltaActualizarGuardar()"'+
      ' style="'+css+'"></div>'+
      '<div><label for="qc-alta-cliente" style="display:block;font-size:12px;font-weight:700;margin-bottom:5px">Cliente</label>'+
      '<select id="qc-alta-cliente" onchange="qcAltaActualizarVariedades()" style="'+css+'">'+
        '<option value="">— Seleccionar cliente —</option>'+clientesOpts+'</select></div>'+
      '<div><label for="qc-alta-variedad" style="display:block;font-size:12px;font-weight:700;margin-bottom:5px">Variedad</label>'+
      '<select id="qc-alta-variedad" onchange="qcAltaActualizarGuardar()" style="'+css+'"><option value="">— Seleccionar variedad —</option></select></div>'+
      '<div><label for="qc-alta-inv" style="display:block;font-size:12px;font-weight:700;margin-bottom:5px">Invernadero</label>'+
      '<select id="qc-alta-inv" onchange="actualizarCallesQCAlta()" style="'+css+'">'+
        '<option value="">— Seleccionar invernadero —</option>'+invOpts+'</select></div>'+
      '<div><label for="qc-alta-desde" style="display:block;font-size:12px;font-weight:700;margin-bottom:5px">Calle desde</label>'+
      '<select id="qc-alta-desde" onchange="qcAltaActualizarGuardar()" style="'+css+'"><option value="">—</option></select></div>'+
      '<div><label for="qc-alta-hasta" style="display:block;font-size:12px;font-weight:700;margin-bottom:5px">Calle hasta</label>'+
      '<select id="qc-alta-hasta" onchange="qcAltaActualizarGuardar()" style="'+css+'"><option value="">—</option></select></div>'+
    '</div>'+
    (clientes.length?'':'<p role="alert" style="font-size:12px;color:#a55e06;margin-top:10px">No hay clientes y variedades disponibles en los partes importados.</p>')+
    '<div id="qc-alta-aviso" role="status" style="font-size:12px;color:#a55e06;margin-top:8px"></div>'+
    '<div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px">'+
      '<button type="button" onclick="cancelarQCAlta()" style="padding:11px 18px;border:1px solid #b7cce1;background:#fff;border-radius:8px;color:#1558a0;font-weight:700">Cancelar</button>'+
      '<button id="qc-alta-guardar" type="button" onclick="guardarNuevaLineaQCAlta()" disabled'+
      ' style="padding:11px 18px;border:0;background:#1558a0;color:#fff;border-radius:8px;font-weight:800;cursor:pointer">Guardar</button>'+
    '</div>'+
  '</section>';
}
async function abrirAltaQC(tipo,wizard){
  const dia=wizard?controlWizardDiaSel:controlDiaSel;
  if(!['tunel','carga'].includes(tipo)||controlSeccion!==tipo||bloquearAltaPasadaControlQC(dia))return;
  const wrap=document.getElementById('nuevo-control-form-wrap');
  if(!wrap)return;
  const ctx={tipo,dia,wizard:!!wizard,catalogo:[],busy:false};
  controlAltaQCContext=ctx;
  wrap.innerHTML='<div role="status" style="padding:14px">Cargando opciones de los partes…</div>';
  const ok=await loadControlTipoCompleto(tipo,false);
  // Túnel puede tener el nombre combinado o incompleto; ampliar el catálogo
  // con pares cliente-variedad expresos de Carga, sin copiar maestro GS.
  if(ok&&tipo==='tunel'&&(currentUserRole==='ADMIN'||currentUserRole==='TECNICO')){
    await loadControlTipoCompleto('carga',false);
  }
  if(controlAltaQCContext!==ctx||!qcAltaFechaContextoValida(ctx)||!wrap.isConnected)return;
  if(!ok){
    wrap.innerHTML='<div role="alert" style="padding:14px">No se han podido cargar las opciones. Reintenta.</div>';
    return;
  }
  ctx.catalogo=qcAltaCatalogo();
  wrap.innerHTML=qcAltaVistaHTML(ctx);
  document.getElementById('qc-alta-partida')?.focus();
}
function cancelarQCAlta(){
  controlAltaQCContext=null;
  const wrap=document.getElementById('nuevo-control-form-wrap');
  if(wrap)wrap.innerHTML='';
}
function qcAltaActualizarVariedades(){
  const ctx=controlAltaQCContext;
  const cliente=document.getElementById('qc-alta-cliente')?.value||'';
  const sel=document.getElementById('qc-alta-variedad');
  if(!ctx||!sel)return;
  const variedades=[...new Set(ctx.catalogo.filter(p=>p.cliente===cliente).map(p=>p.variedad))]
    .sort((a,b)=>a.localeCompare(b,'es'));
  sel.innerHTML='<option value="">— Seleccionar variedad —</option>'+
    variedades.map(v=>'<option value="'+qcAltaEsc(v)+'">'+qcAltaEsc(v)+'</option>').join('');
  qcAltaActualizarGuardar();
}
function actualizarCallesQCAlta(){
  const inv=document.getElementById('qc-alta-inv')?.value;
  const desde=document.getElementById('qc-alta-desde');
  const hasta=document.getElementById('qc-alta-hasta');
  if(!desde||!hasta)return;
  const layout=inv&&INV_LAYOUT[inv];
  const nums=layout?[...new Set([...layout.row1,...layout.row2])].sort((a,b)=>a-b):[];
  const html='<option value="">— Calle —</option>'+nums.map(n=>'<option value="'+n+'">'+n+'</option>').join('');
  desde.innerHTML=html;hasta.innerHTML=html;
  qcAltaActualizarGuardar();
}
function qcAltaValidarFormulario(ctx){
  if(!qcAltaFechaContextoValida(ctx))return {error:'Fecha no válida para el alta.'};
  const partida=String(document.getElementById('qc-alta-partida')?.value||'').trim().toUpperCase();
  // Mismo patrón de códigos de partida que admiten los partes QC vigentes.
  if(!/^\d{2}[A-Z]{0,2}\d{4,6}$/.test(partida)||/ZE|YE/.test(partida))
    return {error:'Introduce un número de partida válido.'};
  const cliente=document.getElementById('qc-alta-cliente')?.value||'';
  const variedad=document.getElementById('qc-alta-variedad')?.value||'';
  if(!ctx.catalogo.some(p=>p.cliente===cliente&&p.variedad===variedad))
    return {error:'Selecciona cliente y variedad de las opciones disponibles.'};
  const numTexto=String(document.getElementById('qc-alta-bandejas')?.value||'').trim();
  const n=Number(numTexto);
  if(!numTexto||!Number.isSafeInteger(n)||n<=0)
    return {error:'Indica un número entero positivo de bandejas.'};
  const inv=document.getElementById('qc-alta-inv')?.value||'';
  const desdeTexto=document.getElementById('qc-alta-desde')?.value||'';
  const hastaTexto=document.getElementById('qc-alta-hasta')?.value||'';
  const layout=INV_LAYOUT[inv];
  if(!layout||!desdeTexto||!hastaTexto)return {error:'Selecciona invernadero y ambas calles.'};
  const validas=[...layout.row1,...layout.row2];
  const inicio=Number(desdeTexto),fin=Number(hastaTexto);
  if(!Number.isInteger(inicio)||!Number.isInteger(fin)||
    !validas.includes(inicio)||!validas.includes(fin))
    return {error:'Las calles deben pertenecer al invernadero elegido.'};
  const desde=Math.min(inicio,fin),hasta=Math.max(inicio,fin);
  const repetida=controlChecksData.some(c=>{
    if(c.tipo!==ctx.tipo||c.dia!==ctx.dia||
      String(c.partida||'').trim().toUpperCase()!==partida)return false;
    const tramo=ctx.tipo==='tunel'?calleTramoDeTunel(c):calleTramoDeCargaDirecta(c);
    if(!tramo||!tramo.invId)return false;
    const mismoInv=ctx.tipo==='tunel'?String(tramo.invId)===inv:
      String(tramo.invId).replace(/[A-Za-z]+$/,'')===String(parseInt(inv,10));
    return mismoInv&&tramo.desde===desde&&tramo.hasta===hasta;
  });
  if(repetida)return {error:'Ya existe una línea de esta partida, día y ubicación.',duplicado:true};
  return {datos:{partida,cliente,variedad,numBandejas:String(n),inv,desde,hasta}};
}
function qcAltaActualizarGuardar(){
  const ctx=controlAltaQCContext;
  const btn=document.getElementById('qc-alta-guardar');
  const info=document.getElementById('qc-alta-aviso');
  if(!btn||!ctx)return;
  const r=qcAltaValidarFormulario(ctx);
  btn.disabled=!!ctx.busy||!r.datos;
  const tocada=!!String(document.getElementById('qc-alta-partida')?.value||'').trim();
  if(info)info.textContent=(r.duplicado||tocada)&&!r.datos?r.error:'';
}
async function guardarNuevaLineaQCAlta(){
  const ctx=controlAltaQCContext;
  if(!qcAltaFechaContextoValida(ctx)||ctx.busy)return;
  const r=qcAltaValidarFormulario(ctx);
  if(!r.datos){showToast(r.error||'Completa los datos del alta.');return false;}
  const {partida,cliente,variedad,numBandejas,inv,desde,hasta}=r.datos;
  const entry={
    id:'control_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),
    tipo:ctx.tipo,dia:ctx.dia,partida,numBandejas,
    color:{},tamano:{},sanidad:{},flores:{},raices:{},observaciones:'',
    creadoPor:currentUser||'—',creadoEn:new Date().toLocaleString('es-ES'),
    origenAltaQC:{fuente:'manual',catalogoControlado:true,validacionGS:false}
  };
  if(ctx.tipo==='tunel'){
    entry.cliente=cliente;entry.variedad=variedad;
    entry.clienteVariedad=cliente+' — '+variedad;
    entry.invId=inv;entry.calleDesde=desde;entry.calleHasta=hasta;
    entry.tramos=[{desde,hasta}];
  }else{
    entry.cliente=cliente;entry.variedad=variedad;
    entry.invId=inv;
    entry.invernadero=String(parseInt(inv,10))+'-'+desde+'-'+hasta;
  }
  ctx.busy=true;
  qcAltaActualizarGuardar();
  // Mostrar la nueva línea tras guardar, aunque el listado se encontrase
  // filtrado por otra ubicación o solo por partidas completadas.
  if(ctx.tipo==='tunel')controlTunelInvFiltro=inv;
  else controlCargaInvFiltro=inv;
  controlFiltroEstado='todos';
  controlVistaChecklist='lineas';
  controlWizardVista='partidas';
  try{
    const ok=ctx.tipo==='tunel'?
      await aplicarNuevaLineaControl(entry):await aplicarNuevaLineaControlCarga(entry);
    if(ok){
      controlAltaQCContext=null;
      abrirMedicionesControl(entry.id);
    }else{
      // El alta ya está en memoria y en cola offline; no generar otro ID.
      cancelarQCAlta();
      showToast('Alta pendiente de sincronización. Comprueba el aviso de pendientes.');
    }
    return ok;
  }catch(_){
    ctx.busy=false;
    qcAltaActualizarGuardar();
    showToast('No se ha podido guardar la línea.');
    return false;
  }
}
function mostrarFormNuevoControlCargaCheck(){return abrirAltaQC('carga',false);}
// Las altas manuales quedan etiquetadas y los PDF aportan catálogos controlados.
async function aplicarNuevaLineaControlCarga(entry,replay){
  if(!entry||entry.tipo!=='carga')return false;
  const reentry=!!replay?.qcReplayCreatedAt;
  if(!controlChecksData.find(x=>x.id===entry.id)){
    if(!puedeCrearLineaControlQC(entry.dia)&&
       !altaQCOfflineOriginalValida(entry.dia,replay?.qcReplayCreatedAt)){
      if(reentry)throw Error('QC_CARGA_COLA_FECHA_NO_VALIDADA');
      bloquearAltaPasadaControlQC(entry.dia);
      return false;
    }
    controlChecksData.push(entry);
  }
  showToast('✓ Línea añadida');
  renderControlContent(document.getElementById('control-overlay'));
  const qid = reentry?null:encolarAccionOffline('aplicarNuevaLineaControlCarga', [entry]);
  marcarControlCheckSucio(entry.id);
  const ok = await persistControlChecksData();
  if(ok){if(qid)desencolarAccion(qid);}
  else if(!reentry) avisarGuardadoLocalPendiente(leerColaOffline().length);
  return ok;
}
// Destinos manuales permitidos: hoy o futuro. La fecha antigua ORIGINAL de
// una línea existente se mantiene como opción para poder editar sin moverla.
function generarOpcionesDiaControl(diaSel){
  const centro = riegoDiaDeHoy();
  const dias = [];
  for(let d=centro; d<=centro+30; d++) dias.push(d);
  if(!dias.includes(diaSel)) dias.push(diaSel);
  dias.sort((a,b)=>a-b);
  return dias.map(d=>`<option value="${d}"${d===diaSel?' selected':''}>${riegoDiaLabelCorto(d)} — ${riegoDiaSemana(d)}</option>`).join('');
}
function mostrarEditarControlCargaCheck(id){
  const c = controlChecksData.find(x=>x.id===id);
  if(!c) return;
  const mo = getOrCreateOverlay('control-editar-carga-overlay');
  const escapar = s => String(s==null?'':s).replace(/"/g,'&quot;');
  mo.innerHTML = `
    <div style="background:#fff;border-radius:14px;max-width:420px;width:100%;padding:1.5rem;box-shadow:0 8px 40px rgba(0,0,0,.3)">
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
  // Borrar SIEMPRE se aplica también en local, aunque la nube no responda —
  // borrar es idempotente (reintentarlo no hace daño), así que si falla se
  // encola para reintentarlo en vez de dejar la línea "medio borrada" solo
  // en pantalla pero viva en la nube.
  controlChecksData = controlChecksData.filter(x=>x.id!==id);
  // No conservar como activo un guión cuya línea ya no existe.
  Object.keys(controlGuionActivo).forEach(key=>{if(controlGuionActivo[key]===id)delete controlGuionActivo[key];});
  showToast('✓ Registro de partida eliminado');
  renderControlContent(document.getElementById('control-overlay'));
  const qid = encolarAccionOffline('eliminarControlCheckConfirmado', [id]);
  // Documento atómico propio (ver persistControlChecksData): al no
  // encontrar el id en controlChecksData, envía un DELETE en vez de un PUT.
  marcarControlCheckSucio(id);
  const ok = await persistControlChecksData([id]);
  if(ok) desencolarAccion(qid); else avisarGuardadoLocalPendiente(leerColaOffline().length);
}

