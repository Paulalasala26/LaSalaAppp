// Mapa de Partidas. Se carga al abrirlo o al abrir Específicos.
// PARTIDAS — mapa de calles por invernadero (a petición de Paula, 2026-08-05).
// Nuevo botón de navegación en Inicio. Reutiliza el mismo esqueleto de
// cuadrícula que Riego (INV_LAYOUT, calles como columnas, Sala 1/Sala 2), pero
// SIN días a los lados ni colores de sábado/domingo/lunes — aquí las filas no
// representan días, representan la posición física de cada partida dentro de
// su calle: la primera partida que entra se coloca en la fila más alejada del
// pasillo (el hueco que separa "lado de arriba" — row1 — de "lado de abajo"
// — row2, de un mismo invernadero), y las siguientes se van colocando más
// cerca del pasillo. Si una partida ocupa varios tramos de calle (ver
// [[lasala_control_tramos_calle]]), ocupa esas mismas columnas en cada fila
// que le toque.
//
// Las partidas que se muestran aquí son las líneas de Check Túnel
// (controlChecksData, tipo:'tunel') que ya tienen calle real asignada y que
// no se hayan marcado como "salida" — no es una tabla propia, es una vista
// derivada de esos mismos datos, así que no hay nada nuevo que sincronizar
// aparte del campo c.salioInvernadero.
// Navegación por semanas del mapa de Partidas (igual que Riego se mueve por
// quincenas) — a petición de Paula, 2026-08-10. Semana 1 = 3-9 agosto 2026;
// las siguientes se calculan automáticamente en bloques de 7 días. Al abrir
// el módulo se muestra siempre la semana que contiene hoy.
const PARTIDAS_ANCHOR_DATE = new Date(2026,6,27); // 27 julio 2026 = semana 1 (offset 0) — a petición de Paula, 2026-08-10, se añadió esta semana anterior a la que hasta ahora era "semana 1" (3-9 agosto, que pasa a ser la semana 2)
let partidasSemanaOffset = 0;
function partidasSemanaDias(offset){
  const inicio = new Date(PARTIDAS_ANCHOR_DATE); inicio.setHours(0,0,0,0);
  inicio.setDate(inicio.getDate() + offset*7);
  const fin = new Date(inicio); fin.setDate(fin.getDate()+6);
  return {inicio, fin};
}
function partidasSemanaLabel(offset){
  const {inicio, fin} = partidasSemanaDias(offset);
  const fmt = d => d.getDate()+' '+d.toLocaleDateString('es-ES',{month:'short'}).replace('.','');
  return fmt(inicio)+' — '+fmt(fin);
}
function partidasSemanaOffsetActual(){
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const anchor = new Date(PARTIDAS_ANCHOR_DATE); anchor.setHours(0,0,0,0);
  const diffDias = Math.round((hoy - anchor) / 86400000);
  return Math.max(0, Math.floor(diffDias / 7));
}
// Índice de semana (offset desde PARTIDAS_ANCHOR_DATE) al que pertenece una
// fecha cualquiera — usado para saber en qué semana entró/salió una partida.
function partidasSemanaDeFecha(fecha){
  const f = new Date(fecha); f.setHours(0,0,0,0);
  const anchor = new Date(PARTIDAS_ANCHOR_DATE); anchor.setHours(0,0,0,0);
  return Math.floor(Math.round((f - anchor) / 86400000) / 7);
}
async function changePartidasSemana(delta){
  partidasSemanaOffset = Math.max(0, partidasSemanaOffset + delta);
  if(partidasInvSel){
    const ok=await cargarBannersPartidasVisibles(partidasInvSel,false);
    if(!ok) return;
  }
  renderPartidasMapaContent(document.getElementById('partidas-overlay'));
}
// Busca la línea real de Check Carga que corresponde a una partida de Túnel
// (mismo número de partida + mismo invernadero) y devuelve la fecha de esa
// línea — esa es la fecha real de "salida" (parte de carga), no el simple
// marcado manual c.salioInvernadero. Si hay varias (partida repartida en
// varios días), se usa la más antigua. A petición de Paula, 2026-08-10: "todo
// va en función de su fecha de entrada (salida de túnel) y su fecha de
// salida que es una vez se le ha realizado el parte de carga".
function fechaCargaRealDePartida(c){
  // Bug real corregido 2026-08-10: `x.invernadero` (línea de Carga) NO es el
  // invId de la app — viene del PDF con formato "nn-lado-tramo" (ver
  // [[lasala_control_carga_filtro_invernadero]]), así que comparar contra
  // `c.invId` nunca coincidía y esta función siempre devolvía null, aunque
  // la partida SÍ tuviera parte de carga real. Se empareja solo por número
  // de partida (mismo criterio ya usado en calleTramoDeCarga/
  // calleAsignadaParaPartida).
  const cargas = controlChecksData.filter(x=>x.tipo==='carga' && x.partida===c.partida);
  if(!cargas.length) return null;
  return riegoDiaToDate(Math.min(...cargas.map(x=>x.dia)));
}
// Determina si una partida de Túnel debe verse en la semana dada: no antes
// de su semana de entrada (ST), y ya no a partir de la semana de su parte de
// carga real (inclusive — la semana del parte de carga ya no la muestra,
// solo las anteriores). Si todavía no hay parte de carga real, se respeta el
// marcado manual "Marcar salida" de siempre (para partidas gestionadas antes
// de que exista esa línea de Carga).
function partidaVisibleEnSemana(c, semanaOffset){
  const semanaEntrada = partidasSemanaDeFecha(riegoDiaToDate(c.dia));
  if(semanaOffset < semanaEntrada) return false;
  const fechaCarga = fechaCargaRealDePartida(c);
  if(fechaCarga) return semanaOffset < partidasSemanaDeFecha(fechaCarga);
  // Si fue marcada como salida desde una semana específica, desaparece a partir de esa semana en adelante.
  // Las semanas anteriores a salioDesdeSemanaNumerada siguen viéndola.
  if(c.salioDesdeSemanaNumerada !== null && c.salioDesdeSemanaNumerada !== undefined){
    return semanaOffset < c.salioDesdeSemanaNumerada;
  }
  return true;
}
let partidasSalaSel = 'sala1';
// A petición de Paula (2026-08-05): "tienes que separarlas por invernaderos.
// y seleccionarlos para ver las partidas" — en vez de pintar TODOS los
// invernaderos de la sala de golpe (uno debajo de otro), ahora hay que elegir
// un invernadero concreto primero (mismo patrón de botones que ya usa Riego,
// selectRiegoInv/data-rinv) y solo se pinta el mapa de ESE invernadero.
let partidasInvSel = null;
function partidasIdsInvDeSala(sala){
  return ({sala1:ALL_INV_IDS_SALA1,sala2:ALL_INV_IDS,sala3:ALL_INV_IDS_SALA3,sala4:ALL_INV_IDS_SALA4,sala5:ALL_INV_IDS_SALA5})[sala] || [];
}
// Riego trabaja en quincenas de 14 días y Partidas mantiene por seguridad
// sus fotografías de ocupación semanales (dos semanas exactas por quincena).
// El calendario de ambas vistas comparte origen y límites, sin modificar
// partidaVisibleEnSemana ni el campo histórico de semana de salida.
function partidasQuincenaBase(){
  return Math.round((PARTIDAS_ANCHOR_DATE - RIEGO_ANCHOR_DATE) / (14*86400000));
}
function partidasQuincenaActual(){
  return partidasQuincenaBase()+Math.floor(partidasSemanaOffset/2);
}
function partidasQuincenaBarHTML(){
  const q=partidasQuincenaActual();
  const bloqueada=q<=partidasQuincenaBase();
  return `
    <div style="padding:.45rem .75rem;background:#e8f0fb;border-bottom:1px solid #b0c8e0;flex-shrink:0">
      <div style="display:grid;grid-template-columns:36px minmax(0,1fr) 36px;align-items:center;gap:8px;width:100%">
        <button onclick="changePartidasQuincena(-1)" ${bloqueada?'disabled':''}
          title="Quincena anterior" aria-label="Quincena anterior"
          style="background:${bloqueada?'#d6dbe1':'#1558a0'};border:1px solid ${bloqueada?'#b8c0ca':'#1558a0'};color:${bloqueada?'#68727d':'#fff'};border-radius:7px;width:36px;height:36px;cursor:${bloqueada?'default':'pointer'};font-size:20px;font-weight:700;line-height:1">&#8249;</button>
        <span style="min-width:0;font-size:clamp(12px,3.3vw,15px);font-weight:800;color:#1558a0;line-height:1.3;text-align:center;white-space:nowrap">${riegoQuincenaLabel(q)}</span>
        <button onclick="changePartidasQuincena(1)" title="Quincena siguiente" aria-label="Quincena siguiente"
          style="background:#1558a0;border:1px solid #1558a0;color:#fff;border-radius:7px;width:36px;height:36px;cursor:pointer;font-size:20px;font-weight:700;line-height:1">&#8250;</button>
      </div>
    </div>`;
}
function partidasSemanaDentroQuincenaHTML(){
  const primera=(partidasQuincenaActual()-partidasQuincenaBase())*2;
  return `
    <div style="padding:5px 12px;background:#f2f6fc;border-bottom:1px solid #cbdced;display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap">
      <span style="font-size:11px;font-weight:700;color:#1558a0;margin-right:4px">Semana del mapa</span>
      ${[0,1].map(n=>`<button type="button" onclick="seleccionarSemanaPartidasQuincena(${n})"
        aria-pressed="${partidasSemanaOffset===primera+n}"
        style="padding:5px 9px;font-size:11px;font-weight:700;background:${partidasSemanaOffset===primera+n?'#1558a0':'#fff'};color:${partidasSemanaOffset===primera+n?'#fff':'#1558a0'};border:1px solid #a8c4e8;border-radius:6px;cursor:pointer">${partidasSemanaLabel(primera+n)}</button>`).join('')}
    </div>`;
}
async function seleccionarSemanaPartidasQuincena(indice){
  if(indice!==0&&indice!==1)return;
  const nueva=(partidasQuincenaActual()-partidasQuincenaBase())*2+indice;
  if(nueva===partidasSemanaOffset)return;
  const anterior=partidasSemanaOffset;
  partidasSemanaOffset=nueva;
  if(partidasInvSel && !(await cargarBannersPartidasVisibles(partidasInvSel,false))){
    partidasSemanaOffset=anterior;return;
  }
  const overlay=document.getElementById('partidas-overlay');
  if(overlay) renderPartidasMapaContent(overlay);
}
async function changePartidasQuincena(delta){
  const base=partidasQuincenaBase();
  const actual=partidasQuincenaActual();
  if(actual+delta<base)return;
  const anterior=partidasSemanaOffset;
  partidasSemanaOffset=Math.max(0,anterior+delta*2);
  if(partidasInvSel && !(await cargarBannersPartidasVisibles(partidasInvSel,false))){
    partidasSemanaOffset=anterior;return;
  }
  const overlay=document.getElementById('partidas-overlay');
  if(!overlay)return;
  if(partidasInvSel)renderPartidasMapaContent(overlay);
  else renderPartidasSelectorContent(overlay);
}
// Pantalla anterior al mapa: idéntico patrón de selectores por Sala que Riego.
function renderPartidasSelectorContent(overlay){
  const salas = ['sala1','sala2','sala3','sala4','sala5'];
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:0;width:100%;height:100%;min-height:0;max-width:100%;overflow:hidden;display:flex;flex-direction:column">
      <div style="background:linear-gradient(120deg,#2b6fae 0%,#3c80c2 55%,#5b9bd5 100%);color:#fff;padding:.45rem .75rem;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;gap:8px">
        <div style="font-size:14px;line-height:1.15;font-weight:800"><i class="ti ti-layout-grid" aria-hidden="true"></i> Partidas</div>
        <button type="button" onclick="document.getElementById('partidas-overlay').style.display='none'"
          title="Cerrar Partidas" aria-label="Cerrar Partidas"
          style="width:30px;height:30px;padding:0;background:#1558a0;border:1px solid #1558a0;color:#fff;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:21px;line-height:1">&times;</button>
      </div>
      ${partidasQuincenaBarHTML()}
      <div id="partidas-inv-selector-wrap" style="flex:1;min-height:0;overflow-y:auto;background:#fff">
        ${salas.map((s,i)=>`
        <div style="padding:.5rem 1.25rem;background:#e8f0fb;border-bottom:1px solid #b0c8e0;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <label for="partidas-sala-${i+1}" style="font-size:14px;font-weight:700;color:#1558a0;min-width:64px">Sala ${i+1}</label>
          <select id="partidas-sala-${i+1}" data-partidas-sala="${i+1}" onchange="if(this.value) seleccionarInvPartidas(this.value)"
            style="flex:1;min-width:0;min-height:44px;padding:8px 10px;font-size:16px;border-radius:7px;border:1.5px solid #a8c4e8;background:#fff;color:#1558a0">
            <option value="" disabled selected>Elegir invernadero…</option>
            ${partidasIdsInvDeSala(s).slice().sort((a,b)=>a.localeCompare(b,'es',{numeric:true})).map(id=>`<option value="${id}">${id}</option>`).join('')}
          </select>
        </div>`).join('')}
      </div>
    </div>`;
}
async function showPartidasModuleLoaded(){
  if(!(await ensureControlCodeLoaded())) return;
  // Mantener carga Túnel + Carga para el mapa y el historial.
  const controlOk = await loadControlCompletoV2(false);
  if(!controlOk){ avisarFalloCarga(); return; }
  // Reintentar solo tareas ya confirmadas en cuadrícula y ficha.
  if(leerColaTareasEspPartidas().length) sincronizarColaTareasEspPartidas();
  const overlay = getOrCreateOverlay('partidas-overlay');
  overlay.style.padding = '0';
  overlay.style.alignItems = 'stretch';
  overlay.style.justifyContent = 'stretch';
  overlay.style.overflow = 'hidden';
  partidaSeleccionadaParaMover = null;
  partidasHistorialDeshacer = [];
  partidasHistorialRehacer = [];
  partidasEspecificoModo = false;
  partidasEspecificoSeleccion = new Set();
  partidasSemanaOffset = partidasSemanaOffsetActual();
  partidasInvSel = null;
  renderPartidasSelectorContent(overlay);
  overlay.style.display = 'flex';
}
function volverSeleccionPartidas(){
  partidasInvSel = null;
  partidaSeleccionadaParaMover = null;
  partidasEspecificoModo = false;
  partidasEspecificoSeleccion = new Set();
  renderPartidasSelectorContent(document.getElementById('partidas-overlay'));
}
async function seleccionarInvPartidas(invId){
  const sala = ['sala1','sala2','sala3','sala4','sala5'].find(s=>partidasIdsInvDeSala(s).includes(String(invId)));
  if(!sala) return;
  const selector = document.getElementById('partidas-inv-selector-wrap');
  if(selector) selector.querySelectorAll('select').forEach(el=>{ el.disabled = true; });
  const ok=await cargarBannersPartidasVisibles(invId,false);
  if(!ok){
    renderPartidasSelectorContent(document.getElementById('partidas-overlay'));
    return;
  }
  partidasSalaSel = sala;
  partidasInvSel = invId;
  partidaSeleccionadaParaMover = null;
  renderPartidasMapaContent(document.getElementById('partidas-overlay'));
}
function idsBannersPartidasVisibles(invId){
  return [...new Set(
    calcularBloquesPartidasInvBase(invId,partidasSemanaOffset)
      .map(b=>b.entry?.id)
      .filter(Boolean)
      .map(String)
  )];
}
async function cargarBannersPartidasVisibles(invId,forzar){
  return await loadEspecificosPartidaIdsData(idsBannersPartidasVisibles(invId),forzar);
}
function renderPartidasMapaContent(overlay){
  // A petición de Paula (2026-08-05): "siguen sin poder moverse las
  // partidas" — cada vez que se selecciona una partida con el botón ⇄ (o se
  // intercambia), esta función repinta TODO el overlay de golpe, y sin
  // conservar el scroll eso lo devolvía siempre arriba del todo. Para tocar
  // la segunda partida (normalmente en el lado de abajo, que necesita hacer
  // scroll para llegar) el dedo caía en el sitio equivocado justo después de
  // ese salto — el intercambio en sí funcionaba, pero la experiencia parecía
  // rota. Mismo arreglo que ya se hizo para Control (guardar/restaurar
  // scrollTop del panel con scroll antes/después de repintar).
  const wrapAnterior = overlay.querySelector('#partidas-content-wrap');
  const scrollTopAnterior = wrapAnterior ? wrapAnterior.scrollTop : 0;
  const partidasVisibles = partidasInvSel ? new Set(calcularBloquesPartidasInvBase(partidasInvSel, partidasSemanaOffset).map(b=>b.entry.id)).size : 0;
  // Número de partidas distintas durante las dos semanas de la quincena.
  const primeraSemana = (partidasQuincenaActual()-partidasQuincenaBase())*2;
  const partidasEnQuincena = partidasInvSel ? new Set([0,1].flatMap(n=>
    calcularBloquesPartidasInvBase(partidasInvSel, primeraSemana+n).map(b=>b.entry.id))).size : 0;
  const scrollHorizontalAnterior = overlay.querySelector('#partidas-mapa-horizontal')?.scrollLeft || 0;
  // INV 1A: mantener el tramo superior desplazable cuando existen
  // posiciones guardadas más allá de las cinco filas visibles.
  const scrollSuperior1AAnterior=overlay.querySelector('#partidas-1a-superior-scroll')?.scrollTop||0;
  overlay.innerHTML = `
    <div style="background:#f5f7fb;width:100%;height:100%;min-height:0;max-width:100%;overflow:hidden;display:flex;flex-direction:column">
      <div style="background:linear-gradient(120deg,#2b6fae 0%,#3c80c2 55%,#5b9bd5 100%);color:#fff;padding:.45rem .75rem;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;gap:8px">
        <div style="font-size:14px;font-weight:800"><i class="ti ti-layout-grid" aria-hidden="true"></i> Partidas</div>
        <button type="button" onclick="document.getElementById('partidas-overlay').style.display='none'"
          title="Cerrar Partidas" aria-label="Cerrar Partidas"
          style="width:30px;height:30px;padding:0;background:#1558a0;border:1px solid #1558a0;color:#fff;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:21px;line-height:1">&times;</button>
      </div>
      ${partidasQuincenaBarHTML()}
      <div style="padding:.55rem .75rem;background:#dce8f8;border-bottom:1px solid #b0c8e0;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-shrink:0">
        <span style="font-size:13px;font-weight:800;color:#1558a0">Sala ${partidasSalaSel.slice(-1)} · INV. ${partidasInvSel}</span>
        <button type="button" onclick="volverSeleccionPartidas()" title="Cambiar invernadero"
          style="padding:6px 12px;background:#1558a0;border:1px solid #1558a0;color:#fff;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">Cambiar</button>
      </div>
      <div id="partidas-panel-controles" style="padding:7px 12px;background:#edf3fb;border-bottom:1px solid #c7d8ee;display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:space-between;flex-shrink:0">
        <span style="font-size:13px;font-weight:800;color:#1558a0;white-space:nowrap" title="Partidas distintas del invernadero en la quincena">Ocupación (${partidasEnQuincena})</span>
        <div style="display:flex;flex:0 1 320px;max-width:100%;min-width:0;height:34px">
          <input id="partidas-buscar-partida" type="text" placeholder="Buscar Nº partida..." aria-label="Buscar número de partida" onkeydown="if(event.key==='Enter') buscarPartidaGlobal()"
            style="flex:1;min-width:0;padding:6px 10px;border:1px solid #a8c4e8;border-right:none;border-radius:7px 0 0 7px;font-size:13px;background:#fff;color:#1558a0">
          <button type="button" onclick="buscarPartidaGlobal()" title="Buscar partida" aria-label="Buscar partida"
            style="height:34px;min-width:38px;padding:0 9px;background:#1558a0;color:#fff;border:1px solid #1558a0;border-radius:0 7px 7px 0;cursor:pointer;display:flex;align-items:center;justify-content:center"><i class="ti ti-search" style="font-size:15px" aria-hidden="true"></i></button>
        </div>
      </div>
      ${partidaSeleccionadaParaMover ? (()=>{
        // Aviso visible de qué hay seleccionado (a petición de Paula,
        // 2026-08-06: "se intercambian otras distintas") — antes la
        // selección era invisible salvo por el resaltado de la propia
        // tarjeta, fácil de olvidar si se cambia de pantalla; ahora se ve
        // siempre arriba, con un botón para cancelarla.
        const c = controlChecksData.find(x=>x.id===partidaSeleccionadaParaMover);
        return `<div style="padding:.5rem 1.25rem;background:#fff3dc;border-bottom:1px solid #e0c080;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-shrink:0;font-size:12px;font-weight:700;color:#7a5000">
          <span>📌 Seleccionada: ${c?c.partida:'—'} — toca otra partida o un hueco para moverla ahí</span>
          <button onclick="partidaSeleccionadaParaMover=null;renderPartidasMapaContent(document.getElementById('partidas-overlay'))" style="padding:5px 12px;font-size:11px;font-weight:800;background:#c47f00;color:#fff;border:none;border-radius:6px;cursor:pointer">Cancelar</button>
        </div>`;
      })() : ''}
            <div id="partidas-content-wrap" style="flex:1;min-height:0;overflow:auto;padding:12px">
        ${partidasVisibles===0?'<div style="font-size:12px;color:#34577f;background:#e8f2fd;padding:10px 12px;border-radius:7px;margin-bottom:10px">No se muestran partidas en la vista actual.</div>':''}
        ${renderPartidasInvHTML(partidasInvSel)}
      </div>
    </div>`;
  const wrapNuevo = overlay.querySelector('#partidas-content-wrap');
  const horizontalNuevo = overlay.querySelector('#partidas-mapa-horizontal');
  if(horizontalNuevo) horizontalNuevo.scrollLeft = scrollHorizontalAnterior;
  const scrollSuperior1ANuevo=overlay.querySelector('#partidas-1a-superior-scroll');
  if(scrollSuperior1ANuevo)scrollSuperior1ANuevo.scrollTop=scrollSuperior1AAnterior;
  // A petición de Paula, 2026-08-11: "al mover partidas me devuelve arriba"
  // — el ajuste síncrono de scrollTop (ya hecho justo aquí) no siempre
  // "cuaja" porque el navegador aún no ha terminado de calcular la altura
  // real del contenido nuevo en ese mismo instante (más notable en móvil).
  // Se refuerza con un doble requestAnimationFrame (espera a que el
  // navegador termine el layout Y el primer repintado) que vuelve a fijarlo
  // — sin quitar el ajuste síncrono, que sigue cubriendo el caso normal.
  if(wrapNuevo){
    wrapNuevo.scrollTop = scrollTopAnterior;
    requestAnimationFrame(()=>{
      wrapNuevo.scrollTop = scrollTopAnterior;
      requestAnimationFrame(()=>{
        wrapNuevo.scrollTop = scrollTopAnterior;
        if(horizontalNuevo)horizontalNuevo.scrollLeft = scrollHorizontalAnterior;
        if(scrollSuperior1ANuevo)scrollSuperior1ANuevo.scrollTop=scrollSuperior1AAnterior;
      });
    });
  }
}
// Detecta 2HV/3HV/4HV/150/150 BIO/104/104 BIO buscando esos códigos sueltos
// dentro del texto de Variedad — mismo sitio de donde ya se lee 2HV/3HV/4HV
// para el pinzado automático (ver detectarHV), pero separado porque aquí
// hace falta el texto exacto a mostrar, no solo el número de hojas.
function detectarTipoPlantaPartida(variedad){
  if(!variedad) return null;
  const v = variedad.toUpperCase();
  let m = /(\d)\s*HV\b/.exec(v);
  if(m) return m[1]+'HV';
  if(/\b150\s*BIO\b/.test(v)) return '150 BIO';
  if(/\b104\s*BIO\b/.test(v)) return '104 BIO';
  if(/\b150\b/.test(v)) return '150';
  if(/\b104\b/.test(v)) return '104';
  return null;
}
// A petición de Paula (2026-08-05): "que pueda arrastrar las partidas y
// colocarlas como yo quiera" — el orden ya no es SOLO por fecha de entrada:
// si una partida tiene c.posManual (número), esa es su clave de orden; si no,
// se usa su fecha de creación como hasta ahora. Arrastrar una partida sobre
// otra INTERCAMBIA sus claves de orden (ver dropPartidaEnCelda) — como los
// valores manuales son números normales (no fechas), y las claves por fecha
// son timestamps en milisegundos (mucho más grandes), una partida recién
// arrastrada siempre queda por delante de las que nunca se han tocado, hasta
// que también se arrastren.
function sortKeyPartida(entry){
  return (typeof entry.posManual === 'number') ? entry.posManual : new Date(entry.creadoEn||0).getTime();
}
// 2026-08-05: "en los lados de abajo falla al intercambiar, sale como
// intercambiadas pero no hace el cambio" — el arrastrar-y-soltar nativo
// (HTML5 drag-and-drop, draggable="true"/ondragstart/ondrop) prácticamente
// no funciona por TACTO en móvil (solo con ratón de ordenador), así que en
// el móvil el gesto de arrastrar no llegaba a disparar el drop de verdad.
// El mecanismo pasa a ser "tocar una, luego tocar donde quieras" — funciona
// igual en móvil y en ordenador, sin depender de gestos de arrastre.
// 2026-08-05 (más tarde): "tienes que dejar intercambiarlas y dejarme
// también mover las partidas a donde yo quiera" — ya no basta con
// intercambiar con otra partida ya colocada: tocando un hueco VACÍO
// (clicCeldaVaciaPartidas) la partida seleccionada se mueve ahí, incluso a
// otra calle o otro invernadero — no hace falta acertar el botón ⇄ pequeño
// en el destino, basta tocar la partida o el hueco donde se quiera soltar.
let partidaSeleccionadaParaMover = null;
// Modo "Añadir Específico aquí" (fusión Partidas+Específicos, 2026-08-11):
// mientras está activo, tocar una tarjeta de partida la marca/desmarca para
// aplicarle un específico en bloque, en vez de moverla — ver
// toggleModoEspecificoPartidas/togglePartidaEnSeleccionEspecifico y la barra
// flotante en renderPartidasInvHTML.
let partidasEspecificoModo = false;
let partidasEspecificoSeleccion = new Set();
// Deshacer/rehacer de MOVIMIENTOS de partida (mover a hueco / intercambiar)
// en el mapa — a petición de Paula, 2026-08-11: flecha atrás "elimina el
// último movimiento", flecha adelante "deja el movimiento que estaba". Cada
// entrada guarda, por cada partida afectada, los campos de ubicación antes
// y después (invId/tramos/calleDesde/calleHasta/posManual) — no es un
// deshacer genérico de toda la app, solo de estos movimientos del mapa.
let partidasHistorialDeshacer = [];
let partidasHistorialRehacer = [];
function snapshotUbicacionPartida(c){
  return { invId:c.invId, tramos:c.tramos?c.tramos.map(t=>({...t})):undefined,
    calleDesde:c.calleDesde,calleHasta:c.calleHasta,posManual:c.posManual,filaManual:c.filaManual };
}
function aplicarUbicacionPartida(id, ubic){
  const c = controlChecksData.find(x=>x.id===id);
  if(!c) return;
  Object.assign(c,ubic);
  if(ubic.filaManual===undefined)delete c.filaManual;
}
function registrarMovimientoPartidas(entradas){
  // entradas: [{id, antes, despues}, ...]
  partidasHistorialDeshacer.push(entradas);
  partidasHistorialRehacer = [];
}
async function deshacerMovimientoPartida(){
  const entradas = partidasHistorialDeshacer.pop();
  if(!entradas) return;
  entradas.forEach(({id, antes})=>aplicarUbicacionPartida(id, antes));
  partidasHistorialRehacer.push(entradas);
  renderPartidasMapaContent(document.getElementById('partidas-overlay'));
  showToast('↩ Movimiento deshecho');
  entradas.forEach(({id})=>marcarControlCheckSucio(id));
  await persistControlChecksData();
}
async function rehacerMovimientoPartida(){
  const entradas = partidasHistorialRehacer.pop();
  if(!entradas) return;
  entradas.forEach(({id, despues})=>aplicarUbicacionPartida(id, despues));
  partidasHistorialDeshacer.push(entradas);
  renderPartidasMapaContent(document.getElementById('partidas-overlay'));
  showToast('↪ Movimiento rehecho');
  entradas.forEach(({id})=>marcarControlCheckSucio(id));
  await persistControlChecksData();
}
// 2026-08-06: "siguen sin poder cambiarse las partidas de sitio entre
// ellas". Dos fallos reales encontrados a la vez:
// 1) El intercambio solo cambiaba el orden interno (posManual), NUNCA la
//    calle/invernadero — si las dos partidas estaban en calles DISTINTAS
//    (el caso normal), cada una seguía siendo la única ocupante de su
//    propia calle, así que "intercambiar" su orden relativo no movía nada
//    visible. Ahora se intercambia la ubicación COMPLETA.
// 2) El botón ⇄ de la SEGUNDA partida solo volvía a seleccionar esa
//    partida (no completaba nada) — el intercambio solo se disparaba
//    tocando el cuerpo de la tarjeta (clicPartidaEnMapa), nunca tocando su
//    ⇄. Ahora ambos sitios completan el intercambio si ya había otra
//    seleccionada.
// 2026-08-06 (más tarde): "sigue sin funcionar en la calle 1004" — fallo
// real encontrado mirando esos datos concretos: varias partidas importadas
// del MISMO PDF en el MISMO segundo comparten un creadoEn idéntico, y por
// tanto la misma clave de orden por defecto (sortKeyPartida usa
// new Date(creadoEn).getTime(), que solo tiene resolución de un segundo).
// El intercambio reutilizaba esas claves ANTIGUAS intercambiadas — si las
// dos partidas ya tenían la MISMA clave (justo el caso de la calle 1004,
// donde 3 de las 4 partidas comparten posManual/creadoEn), "intercambiar"
// dos valores iguales no cambia nada en absoluto, aunque el resto de campos
// (calle) sí se intercambien correctamente cuando son distintas. Ahora se
// usan SIEMPRE dos claves nuevas y garantizadas distintas (Date.now() y
// Date.now()-1) en vez de reciclar las que ya tuvieran, así el cambio de
// orden relativo SIEMPRE es real, sin importar qué clave tuvieran antes.
async function cambiarPosicionPartida(id, posActual){
  const nuevaPosStr = prompt(`¿A qué posición mover? (actual: ${posActual})`, '');
  if(!nuevaPosStr) return;
  const nuevaPos = parseInt(nuevaPosStr, 10);
  if(isNaN(nuevaPos) || nuevaPos < 1) { showToast('❌ Número inválido'); return; }

  const check = controlChecksData.find(x=>x.id===id);
  if(!check) return;
  const invId = check.invId;

  // Obtener todas las partidas de este invernadero en la semana actual, ORDENADAS
  const partidasInv = controlChecksData.filter(c=>c.tipo==='tunel' && c.invId===invId && partidaVisibleEnSemana(c, partidasSemanaOffset)).sort((a,b)=>sortKeyPartida(a)-sortKeyPartida(b));

  if(nuevaPos > partidasInv.length){ showToast(`❌ Máximo ${partidasInv.length} posiciones`); return; }

  // Reorganizar directamente en el array partidasInv
  const idxActual = partidasInv.findIndex(p=>p.id===id);
  if(idxActual === -1) return;

  // Sacar la partida y reinsertar en nueva posición
  const [partida] = partidasInv.splice(idxActual, 1);
  const idxNuevo = Math.max(0, Math.min(nuevaPos - 1, partidasInv.length));
  partidasInv.splice(idxNuevo, 0, partida);

  // Reasignar claves SOLO a las partidas reordenadas
  partidasInv.forEach((p, i)=>{ p.posManual = (i+1)*1000; });

  renderPartidasMapaContent(document.getElementById('partidas-overlay'));
  showToast(`✓ Partida movida a posición ${nuevaPos}`);
  const qid = encolarAccionOffline('cambiarPosicionPartida', [id, nuevaPos]);
  partidasInv.forEach(p=>marcarControlCheckSucio(p.id));
  const ok = await persistControlChecksData();
  if(ok) desencolarAccion(qid); else avisarGuardadoLocalPendiente(leerColaOffline().length);
}
function intercambiarPartidasPorId(idA,idB){
  const cA=controlChecksData.find(x=>x.id===idA);
  const cB=controlChecksData.find(x=>x.id===idB);
  if(!cA||!cB)return;
  if(callesDePartidaEntry(cA).length!==1||callesDePartidaEntry(cB).length!==1){
    showToast('Para intercambiar partidas de varias calles, separa primero. Puedes moverlas verticalmente a una fila libre.');return;
  }
  // Para intercambiar: A toma TODO de B (ubicación + clave), B toma TODO de A
  const keyA = typeof cA.posManual === 'number' ? cA.posManual : new Date(cA.creadoEn || 0).getTime();
  const keyB = typeof cB.posManual === 'number' ? cB.posManual : new Date(cB.creadoEn || 0).getTime();

  // ubicB = lo que A recibirá (ubicación y clave de B)
  const ubicB = { invId:cB.invId, calleDesde:cB.calleDesde, calleHasta:cB.calleHasta, posManual:keyB, filaManual:cB.filaManual };
  if(cB.tramos) ubicB.tramos = cB.tramos.map(t=>({...t}));

  // ubicA = lo que B recibirá (ubicación y clave de A)
  const ubicA = { invId:cA.invId, calleDesde:cA.calleDesde, calleHasta:cA.calleHasta, posManual:keyA, filaManual:cA.filaManual };
  if(cA.tramos) ubicA.tramos = cA.tramos.map(t=>({...t}));

  aplicarIntercambioPartidas(idA, ubicB, idB, ubicA);
}
function seleccionarPartidaParaMover(id, event){
  if(event) event.stopPropagation();
  if(partidaSeleccionadaParaMover && partidaSeleccionadaParaMover!==id){
    const idA = partidaSeleccionadaParaMover;
    partidaSeleccionadaParaMover = null;
    intercambiarPartidasPorId(idA, id);
    return;
  }
  partidaSeleccionadaParaMover = (partidaSeleccionadaParaMover === id) ? null : id;
  renderPartidasMapaContent(document.getElementById('partidas-overlay'));
}
// Tocar una partida cuando ya hay otra seleccionada completa el intercambio
// (no hace falta acertar el botón ⇄ del destino); si no hay nada
// seleccionado, tocarla abre su historial como siempre.
function clicPartidaEnMapa(id){
  if(partidaSeleccionadaParaMover && partidaSeleccionadaParaMover!==id){
    const idA = partidaSeleccionadaParaMover;
    partidaSeleccionadaParaMover = null;
    intercambiarPartidasPorId(idA, id);
    return;
  }
  if(!partidaSeleccionadaParaMover) mostrarHistorialPartida(id);
}
// Tocar un hueco vacío con una partida seleccionada la mueve ahí — se coloca
// la última (más cerca del pasillo) entre las que ya hubiera en esa calle;
// si se quiere un orden más fino dentro de la misma calle, luego se puede
// ajustar con el intercambio de toda la vida.
// La coordenada de un hueco incluye calle Y fila; nunca se compacta
// automáticamente después de colocar la partida.
function clicCeldaVaciaPartidas(invId,calle,fila){
  const id=partidaSeleccionadaParaMover;
  if(!id)return;
  partidaSeleccionadaParaMover=null;
  moverPartidaAHueco(id,invId,calle,fila);
}
function filasLibresParaPartida(id,invId,calles,fila,semana){
  if(!Number.isInteger(fila)||fila<0||fila>300)return false;
  const layout=INV_LAYOUT[invId];
  const permitidas=new Set([...(layout?.row1||[]),...(layout?.row2||[])]);
  if(!calles.length||calles.some(c=>!permitidas.has(c)))return false;
  const ocupadas=new Set(calcularBloquesPartidasInvBase(invId,semana)
    .filter(b=>b.entry.id!==id&&b.pos===fila)
    .flatMap(b=>b.calles));
  return calles.every(c=>!ocupadas.has(c));
}
// Convertir la celda señalada en un destino para la partida COMPLETA.
// Una partida de dos calles se traslada a otro par libre de la misma banda;
// el índice indica sobre qué calle del bloque se agarró al arrastrar.
function resolverHuecoPartida(id,invId,calle,fila,indiceAgarrado=null){
  const c=controlChecksData.find(x=>x.id===id);
  const layout=INV_LAYOUT[invId],destino=Number(calle),row=Number(fila);
  if(!c||!layout||!Number.isInteger(destino)||!Number.isInteger(row)||
     row<0||row>300)return null;
  const bandaDestino=layout.row1.includes(destino)?layout.row1:
    layout.row2.includes(destino)?layout.row2:null;
  if(!bandaDestino)return null;
  const actuales=[...new Set(callesDePartidaEntry(c))];
  if(!actuales.length)return null;
  let tramos,callesDestino;
  if(actuales.length===1){
    tramos=[{desde:destino,hasta:destino}];
    callesDestino=[destino];
  }else{
    if(c.invId!==invId)return null;
    const bandaOrigen=actuales.every(n=>layout.row1.includes(n))?layout.row1:
      actuales.every(n=>layout.row2.includes(n))?layout.row2:null;
    if(bandaOrigen!==bandaDestino)return null; // nunca cruzar el pasillo
    const originales=(c.tramos?.length?c.tramos:
      [{desde:c.calleDesde,hasta:c.calleHasta}]);
    const contigua=originales.length===1 &&
      actuales.length===Math.abs(Number(originales[0].hasta)-Number(originales[0].desde))+1;
    if(!contigua){
      // Un bloque con tramos separados solo puede variar verticalmente.
      if(!actuales.includes(destino))return null;
      tramos=originales.map(t=>({...t}));
      callesDestino=actuales;
    }else{
      const ancho=actuales.length;
      const primeroOriginal=bandaDestino.findIndex(n=>actuales.includes(n));
      const ancla=Number.isInteger(indiceAgarrado)?
        Math.max(0,Math.min(ancho-1,indiceAgarrado)):null;
      // Al tocar una celda de las calles actuales, se conserva el tramo.
      // En drag, el punto del bloque sujetado queda bajo el dedo/ratón.
      const inicio=ancla===null&&actuales.includes(destino)?
        primeroOriginal:bandaDestino.indexOf(destino)-(ancla??0);
      if(inicio<0||inicio+ancho>bandaDestino.length)return null;
      callesDestino=bandaDestino.slice(inicio,inicio+ancho);
      if(callesDestino.some((n,i)=>i>0&&Math.abs(n-callesDestino[i-1])!==1))return null;
      tramos=[{desde:Math.min(...callesDestino),hasta:Math.max(...callesDestino)}];
    }
  }
  if(!filasLibresParaPartida(id,invId,callesDestino,row,partidasSemanaOffset))
    return null;
  return {tramos,callesDestino,fila:row};
}
function moverPartidaAHueco(id,invId,calle,fila,indiceAgarrado=null){
  const destino=resolverHuecoPartida(id,invId,calle,fila,indiceAgarrado);
  if(!destino){
    showToast('Destino no disponible: comprueba las calles libres de la partida y su lado del pasillo');
    return false;
  }
  return aplicarColocarPartidaEnFila(id,invId,destino.tramos,destino.fila,partidasSemanaOffset);
}
async function aplicarColocarPartidaEnFila(id,invId,tramos,fila,semanaGuardada,filasFijadas){
  const c=controlChecksData.find(x=>x.id===id);
  const semana=Number.isInteger(semanaGuardada)?semanaGuardada:partidasSemanaOffset;
  if(!c||!partidaVisibleEnSemana(partidaParaPintar(c),semana))return false;
  const calles=Array.isArray(tramos)?tramos.flatMap(t=>{
    const a=Number(t.desde),b=Number(t.hasta);
    return Number.isInteger(a)&&Number.isInteger(b)&&Math.abs(a-b)<=300
      ?Array.from({length:Math.abs(a-b)+1},(_,i)=>Math.min(a,b)+i):[];
  }):[];
  if(!calles.length||!Array.isArray(tramos)||tramos.some(t=>!Number.isInteger(Number(t.desde))||
      !Number.isInteger(Number(t.hasta))||Math.abs(Number(t.hasta)-Number(t.desde))>300)||
      !filasLibresParaPartida(id,invId,calles,Number(fila),semana))return false;
  const originales=[...new Set(callesDePartidaEntry(c))];
  if(originales.length>1){
    const layout=INV_LAYOUT[invId];
    const origenBanda=originales.every(n=>layout?.row1.includes(n))?layout.row1:
      originales.every(n=>layout?.row2.includes(n))?layout.row2:null;
    const destinoBanda=calles.every(n=>layout?.row1.includes(n))?layout.row1:
      calles.every(n=>layout?.row2.includes(n))?layout.row2:null;
    const mismos=originales.length===new Set(calles).size&&
      originales.every(n=>calles.includes(n));
    const originalTramos=c.tramos?.length?c.tramos:
      [{desde:c.calleDesde,hasta:c.calleHasta}];
    const esTramoContinuo=originalTramos.length===1&&tramos.length===1&&
      originales.length===Math.abs(Number(originalTramos[0].hasta)-Number(originalTramos[0].desde))+1&&
      calles.length===Math.abs(Number(tramos[0].hasta)-Number(tramos[0].desde))+1;
    if(c.invId!==invId||!origenBanda||origenBanda!==destinoBanda||
       originales.length!==new Set(calles).size||(!mismos&&!esTramoContinuo)){
      showToast('Movimiento multicalle inválido: conserva las calles contiguas en el mismo lado');return false;
    }
  }
  const origenInv=c.invId;
  const afectados=[...new Set([origenInv,invId].filter(Boolean))];
  const filasAnteriores=new Map();
  afectados.forEach(inv=>calcularBloquesPartidasInvBase(inv,semana).forEach(b=>{
    if(b.entry.id!==id&&!filasAnteriores.has(b.entry.id))filasAnteriores.set(b.entry.id,b.pos);
  }));
  const antes=new Map([[id,snapshotUbicacionPartida(c)]]);
  const restaurar=()=>{
    for(const [ident,prev] of antes)aplicarUbicacionPartida(ident,prev);
  };
  c.invId=invId;
  c.tramos=tramos.map(t=>({desde:Math.min(Number(t.desde),Number(t.hasta)),
    hasta:Math.max(Number(t.desde),Number(t.hasta))}));
  c.calleDesde=c.tramos[0].desde;c.calleHasta=c.tramos[0].hasta;
  c.filaManual=Number(fila);
  let fijaciones=Array.isArray(filasFijadas)?filasFijadas:null;
  if(fijaciones){
    for(const item of fijaciones){
      const otro=controlChecksData.find(x=>x.id===item.id);
      if(!otro||item.id===id||!Number.isInteger(item.fila)||item.fila<0||item.fila>300){
        restaurar();return false;
      }
      if(!antes.has(item.id))antes.set(item.id,snapshotUbicacionPartida(otro));
      otro.filaManual=item.fila;
    }
  }else{
    fijaciones=[];
    // Solo fijar las partidas heredadas que se desplazarían al compactarse.
    // Las restantes no se editan ni generan escrituras adicionales.
    for(let iter=0;iter<4;iter++){
      const actuales=new Map();
      afectados.forEach(inv=>calcularBloquesPartidasInvBase(inv,semana).forEach(b=>{
        if(b.entry.id!==id&&!actuales.has(b.entry.id))actuales.set(b.entry.id,b.pos);
      }));
      let nuevos=0;
      for(const [otroId,prevFila] of filasAnteriores){
        if(actuales.get(otroId)===prevFila)continue;
        const otro=controlChecksData.find(x=>x.id===otroId);
        if(!otro||!Number.isInteger(prevFila)||prevFila>300)continue;
        if(!antes.has(otroId))antes.set(otroId,snapshotUbicacionPartida(otro));
        otro.filaManual=prevFila;
        if(!fijaciones.some(x=>x.id===otroId))fijaciones.push({id:otroId,fila:prevFila});
        nuevos++;
      }
      if(!nuevos)break;
    }
  }
  const bloquesDespues=afectados.flatMap(inv=>
    calcularBloquesPartidasInvBase(inv,semana).map(b=>({...b,inv})));
  const propios=bloquesDespues.filter(b=>b.entry.id===id&&b.inv===invId);
  const exacto=propios.length>0&&propios.every(b=>b.pos===c.filaManual)&&
    calles.every(calle=>propios.some(b=>b.calles.includes(calle)));
  const filasPreservadas=[...filasAnteriores].every(([otroId,prevFila])=>{
    const actual=bloquesDespues.find(b=>b.entry.id===otroId);
    return actual&&actual.pos===prevFila;
  });
  const celdas=new Set();
  const sinSolapes=bloquesDespues.every(b=>b.calles.every(n=>{
    const key=b.inv+':'+n+':'+b.pos;
    if(celdas.has(key))return false;
    celdas.add(key);return true;
  }));
  if(!exacto||!filasPreservadas||!sinSolapes){
    restaurar();showToast('La fila no está libre: movimiento cancelado');return false;
  }
  const cambios=[];
  for(const [ident,prev] of antes){
    const actual=controlChecksData.find(x=>x.id===ident);
    if(actual&&JSON.stringify(prev)!==JSON.stringify(snapshotUbicacionPartida(actual)))
      cambios.push({id:ident,antes:prev,despues:snapshotUbicacionPartida(actual)});
  }
  if(!cambios.length)return true;
  registrarMovimientoPartidas(cambios);
  renderPartidasMapaContent(document.getElementById('partidas-overlay'));
  showToast('✓ Partida colocada en calle '+calles[0]+', fila '+(c.filaManual+1));
  const qid=encolarAccionOffline('aplicarColocarPartidaEnFila',
    [id,invId,c.tramos,c.filaManual,semana,fijaciones]);
  cambios.forEach(x=>marcarControlCheckSucio(x.id));
  const ok=await persistControlChecksData();
  if(ok)desencolarAccion(qid);else avisarGuardadoLocalPendiente(leerColaOffline().length);
  return ok;
}
// Compatibilidad de acciones anteriores pendientes sin fila: usar el
// primer espacio libre en destino, nunca compactar una posición explícita.
async function aplicarMoverPartidaACalle(id, invId, tramo, posManualVal, semanaGuardada){
  const c=controlChecksData.find(x=>x.id===id);
  if(!c||callesDePartidaEntry(c).length!==1)return false;
  const semana=Number.isInteger(semanaGuardada)?semanaGuardada:partidasSemanaOffset;
  let fila=0;
  while(fila<300&&!filasLibresParaPartida(id,invId,[Number(tramo.desde)],fila,semana))fila++;
  return aplicarColocarPartidaEnFila(id,invId,[{desde:Number(tramo.desde),hasta:Number(tramo.desde)}],fila,semana);
}
// Calcula, para un invernadero, en qué fila (0 = más alejada del pasillo) le
// toca a cada "bloque" (una partida, o uno de sus tramos si ocupa varias
// calles) — se procesan en ese orden y cada bloque se coloca en la primera
// fila libre para TODAS las calles que ocupa a la vez, para que nunca se
// pise con otro bloque ya colocado.
function calcularBloquesPartidasInv(invId){
  return calcularBloquesPartidasInvBase(invId, partidasSemanaOffset);
}
// Base compartida. semanaOffset=null/undefined = sin filtro (todas las
// partidas de tunel de ese invernadero, sea la semana que sea). Un número =
// filtra por esa semana concreta con partidaVisibleEnSemana — el mapa visual
// de siempre usa partidasSemanaOffset (la semana que se esté viendo), pero
// para asociar un específico hay que usar la semana del DÍA en que se aplica
// ese específico (calculada por el caller), NO la que tengas abierta en el
// mapa en ese momento — a petición de Paula (2026-08-18): usar la semana de
// la UI daba falsos negativos (partida real no encontrada) y quitar el
// filtro del todo daría falsos positivos (partidas ya salidas de esa calle,
// cuyo check nunca se borra, seguirían aparejándose).
// La posición vertical real se conserva como filaManual (entero desde 0).
// Reservar primero las posiciones explícitas evita que un registro heredado
// compacto vuelva a ocupar el hueco elegido. Los registros sin filaManual
// conservan el compactado tradicional, sin migración masiva de datos.
function calcularBloquesPartidasInvBase(invId, semanaOffset){
  const entradas=controlChecksData
    .filter(c=>(c.tipo==='tunel'||(c.tipo==='ubicacion'&&raizQCPartida(c)))&&
      c.invId===invId && ((c.tramos&&c.tramos.length)||c.calleDesde!=null)&&
      (semanaOffset==null||partidaVisibleEnSemana(partidaParaPintar(c),semanaOffset)))
    .map(partidaParaPintar)
    .sort((a,b)=>sortKeyPartida(a)-sortKeyPartida(b)||
      String(a.id).localeCompare(String(b.id)));
  const ocupadas=new Set(),bloques=[],pendientes=[];
  const callesEntry=c=>[...new Set(callesDePartidaEntry(c))];
  const libre=(calles,fila)=>calles.every(c=>!ocupadas.has(c+':'+fila));
  const ocupar=(calles,fila)=>calles.forEach(c=>ocupadas.add(c+':'+fila));
  const insertar=(entry,fila)=>{
    ocupar(callesEntry(entry),fila);
    // Para registros con varios tramos, TODOS comparten la misma fila.
    const tramos=(entry.tramos&&entry.tramos.length)?entry.tramos:
      [{desde:entry.calleDesde,hasta:entry.calleHasta}];
    tramos.forEach(t=>{
      if(t.desde==null)return;
      const desde=Math.min(t.desde,t.hasta??t.desde),hasta=Math.max(t.desde,t.hasta??t.desde);
      bloques.push({calles:Array.from({length:hasta-desde+1},(_,i)=>desde+i),pos:fila,entry});
    });
  };
  entradas.forEach(entry=>{
    const calles=callesEntry(entry);
    if(!calles.length)return;
    const f=entry.filaManual;
    if(Number.isInteger(f)&&f>=0&&f<=300&&libre(calles,f))insertar(entry,f);
    else pendientes.push(entry);
  });
  pendientes.forEach(entry=>{
    const calles=callesEntry(entry);
    let fila=0;
    while(fila<=300&&!libre(calles,fila))fila++;
    if(fila<=300)insertar(entry,fila);
  });
  return bloques;
}
// El intercambio se hace SOLO con el botón ⇄ de tocar-y-tocar
// (seleccionarPartidaParaMover) — se quitó el arrastrar-y-soltar nativo
// (draggable/ondragstart/ondrop) porque interfería con el scroll táctil en
// móvil, ver comentario en renderPartidasBloqueHTML.
async function aplicarIntercambioPartidas(id1, ubic1, id2, ubic2){
  const c1 = controlChecksData.find(x=>x.id===id1);
  const c2 = controlChecksData.find(x=>x.id===id2);
  const antes1 = c1 ? snapshotUbicacionPartida(c1) : null;
  const antes2 = c2 ? snapshotUbicacionPartida(c2) : null;
  const invSelAntes = partidasInvSel; // Preservar invernadero seleccionado
  if(c1)aplicarUbicacionPartida(id1,ubic1);
  if(c2)aplicarUbicacionPartida(id2,ubic2);
  const semana=partidasSemanaOffset;
  const invs=[...new Set([c1?.invId,c2?.invId].filter(Boolean))];
  const valido=invs.every(inv=>{
    const bs=calcularBloquesPartidasInvBase(inv,semana);
    const celdas=new Set();
    return bs.every(b=>b.calles.every(c=>{
      const key=c+':'+b.pos;
      if(celdas.has(key))return false;
      celdas.add(key);return true;
    }))&&[c1,c2].filter(c=>c?.invId===inv).every(c=>{
      const propios=bs.filter(b=>b.entry.id===c.id);
      return propios.length>0&&(!Number.isInteger(c.filaManual)||
        propios.every(b=>b.pos===c.filaManual));
    });
  });
  if(!valido){
    if(c1)aplicarUbicacionPartida(id1,antes1);
    if(c2)aplicarUbicacionPartida(id2,antes2);
    showToast('Intercambio cancelado para evitar solapes');return false;
  }
  const entradas = [];
  if(c1) entradas.push({id:id1, antes:antes1, despues: snapshotUbicacionPartida(c1)});
  if(c2) entradas.push({id:id2, antes:antes2, despues: snapshotUbicacionPartida(c2)});
  if(entradas.length) registrarMovimientoPartidas(entradas);
  renderPartidasMapaContent(document.getElementById('partidas-overlay'));
  // Restaurar invernadero seleccionado si seguía siendo válido
  if(invSelAntes && controlChecksData.some(c => c.invId === invSelAntes && partidaVisibleEnSemana(c, partidasSemanaOffset))){
    partidasInvSel = invSelAntes;
    renderPartidasMapaContent(document.getElementById('partidas-overlay'));
  }
  showToast('✓ Partidas intercambiadas');
  const qid = encolarAccionOffline('aplicarIntercambioPartidas', [id1, ubic1, id2, ubic2]);
  if(c1) marcarControlCheckSucio(id1);
  if(c2) marcarControlCheckSucio(id2);
  const ok = await persistControlChecksData();
  if(ok) desencolarAccion(qid); else avisarGuardadoLocalPendiente(leerColaOffline().length);
  return ok;
}
// Cada recuadro del mapa muestra exclusivamente el NÚMERO de partida.
// Los datos, tratamientos y acciones se consultan desde su ficha.
function renderPartidasBloqueHTML(bloque,callesRender=null,ladoRender='arriba'){
  if(!bloque) return '<div style="height:100%"></div>';
  const escapar = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const c = bloque.entry;
  const callesPintadas=callesRender||bloque.calles;
  const tipoPlanta = detectarTipoPlantaPartida(c.clienteVariedad);
  const seleccionada = partidaSeleccionadaParaMover === c.id;
  const enSeleccionEspecifico = partidasEspecificoSeleccion.has(c.id);
  const fondos = {'2HV':{bg:'#dbeafe',borde:'#93c5fd'},'3HV':{bg:'#ede9fe',borde:'#c4b5fd'},'4HV':{bg:'#ffe4c4',borde:'#f0b060'}};
  const fondo = fondos[tipoPlanta]||{bg:'#e8f5ef',borde:'#a5d6c2'};
  const bg = partidasEspecificoModo && enSeleccionEspecifico ? '#c9e9ff' : seleccionada ? '#fff3dc' : fondo.bg;
  const borde = partidasEspecificoModo && enSeleccionEspecifico ? '#1558a0' : seleccionada ? '#c47f00' : fondo.borde;
  const accion = partidasEspecificoModo ? 'togglePartidaEnSeleccionEspecifico' : 'clicPartidaEnMapa';
  // En móvil, arrastre propio con Pointer Events (iOS/Android): el HTML5 drag
  // nativo y los touchmove pasivos no permiten seguir el dedo con fiabilidad.
  const eventoDrag = partidasEspecificoModo ? '' : `draggable="true"
    ondragstart="iniciarArrastrePartida(event,'${c.id}')" ondragover="sobrePartidaArrastrada(event,'${c.id}')"
    ondragleave="quitarIndicadorDropPartidas()" ondrop="soltarPartidaSobrePartida(event,'${c.id}')"
    ondragend="terminarArrastrePartida()"
    onpointerdown="iniciarPunteroPartida(event,'${c.id}')" onpointermove="moverPunteroPartida(event)"
    onpointerup="soltarPunteroPartida(event)" onpointercancel="cancelarPunteroPartida(event)"
    oncontextmenu="if(partidasPunteroActivo){event.preventDefault();}"`;
  return `
    <div role="button" tabindex="0" data-partida-id="${escapar(c.id)}" data-partida-calles="${callesPintadas.join(',')}" data-partida-lado="${ladoRender}" data-partida-color="${fondo.bg}" title="${escapar(c.partida)||'Partida sin número'}" aria-label="Partida ${escapar(c.partida)||'sin número'}"
      ${eventoDrag} onclick="if(Date.now()>partidasSuprimirClickHasta)${accion}('${c.id}')"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${accion}('${c.id}')}"
      style="min-height:28px;height:100%;display:flex;align-items:center;justify-content:center;padding:3px 5px;background:${bg};border:1.5px solid ${borde};border-radius:5px;cursor:grab;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none">
      <span style="display:block;max-width:100%;font-size:11px;font-weight:800;color:#16436c;line-height:1.2;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapar(c.partida)||'—'}</span>
    </div>`;
}
// Calles reales de una partida (mismo cálculo que ya usa
// calcularBloquesPartidasInv/mostrarHistorialPartida para tramos o
// calleDesde/calleHasta) — reutilizado para aplicar un específico
// automáticamente sin pedir tramo de calles a mano.
function callesDePartidaEntry(c){
  const tramos = (c.tramos && c.tramos.length) ? c.tramos : [{desde:c.calleDesde, hasta:c.calleHasta}];
  const calles = [];
  tramos.forEach(t=>{
    if(t.desde==null) return;
    const desde = Math.min(t.desde, t.hasta==null?t.desde:t.hasta);
    const hasta = Math.max(t.desde, t.hasta==null?t.desde:t.hasta);
    for(let x=desde; x<=hasta; x++) calles.push(x);
  });
  return calles;
}
// Mini-ficha para aplicar un específico a las partidas ya seleccionadas en
// el mapa (fusión Partidas+Específicos, 2026-08-11) — mismos campos que
// showEspecificoManualForm (Día/Tratamiento/Dosis/Horario/Caldo) pero sin
// selector de invernadero ni tramos: las calles se calculan solas por
// partida (callesDePartidaEntry), no hace falta elegirlas a mano.
function abrirAplicarEspecificoAPartidas(){
  const overlay = getOrCreateOverlay('especifico-por-partidas-overlay');
  overlay.style.zIndex = 2200;
  const escapar = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // Rango de días acotado (a petición de Paula, 2026-08-11: "solo tienen
  // que aparecer de fechas dos días atrás, el actual y el día siguiente")
  // — antes se ofrecía toda la quincena, con fechas demasiado antiguas.
  const hoy = riegoDiaDeHoy();
  const diasQ = [hoy-2, hoy-1, hoy, hoy+1];
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:10px;max-width:390px;width:calc(100vw - 22px);max-height:calc(100dvh - 24px);overflow-y:auto;box-shadow:0 8px 36px rgba(0,0,0,.25)">
      <div style="background:#1558a0;color:#fff;padding:9px 12px;display:flex;align-items:center;justify-content:space-between">
        <strong style="font-size:13px">Añadir específico</strong>
        <button type="button" onclick="document.getElementById('especifico-por-partidas-overlay').style.display='none'" aria-label="Cerrar" title="Cerrar" style="width:30px;height:30px;border:0;border-radius:5px;background:#1558a0;color:#fff;font-size:20px;cursor:pointer">×</button>
      </div>
      <div style="padding:12px">
        <div style="font-size:11px;color:#516779;margin-bottom:10px">${partidasEspecificoSeleccion.size} partida${partidasEspecificoSeleccion.size===1?'':'s'} seleccionada${partidasEspecificoSeleccion.size===1?'':'s'}. Calles automáticas.</div>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px">
          <label style="font-size:11px;font-weight:700;color:#34577f">Día
            <select id="eap-dia" style="display:block;width:100%;min-width:0;margin-top:3px;padding:8px 5px;border:1px solid #b4cae1;border-radius:6px;font-size:12px;background:#fff">
              ${diasQ.map(d=>`<option value="${d}"${d===hoy?' selected':''}>${escapar(riegoDiaLabelCorto(d))} — ${escapar(riegoDiaSemana(d))}</option>`).join('')}
            </select>
          </label>
          <label style="font-size:11px;font-weight:700;color:#34577f">Horario
            <select id="eap-horario" style="display:block;width:100%;min-width:0;margin-top:3px;padding:8px 5px;border:1px solid #b4cae1;border-radius:6px;font-size:12px;background:#fff">
              <option value="">—</option>
              ${ESPECIFICO_HORARIOS.map(h=>`<option value="${h}">${h}</option>`).join('')}
            </select>
          </label>
          <label style="font-size:11px;font-weight:700;color:#34577f">Tratamiento
            <select id="eap-trat" required style="display:block;width:100%;min-width:0;margin-top:3px;padding:8px 5px;border:1px solid #b4cae1;border-radius:6px;font-size:12px;background:#fff">
              <option value="">—</option>
              ${ESPECIFICO_TRATAMIENTOS.map(t=>`<option value="${t}">${t}</option>`).join('')}
            </select>
          </label>
          <label style="font-size:11px;font-weight:700;color:#34577f">Dosis
            <select id="eap-dosis" required style="display:block;width:100%;min-width:0;margin-top:3px;padding:8px 5px;border:1px solid #b4cae1;border-radius:6px;font-size:12px;background:#fff">
              <option value="">—</option>
              ${ESPECIFICO_DOSIS.map(d=>`<option value="${d}">${d}</option>`).join('')}
            </select>
          </label>
        </div>
        <label style="display:block;font-size:11px;font-weight:700;color:#34577f;margin-top:9px">Caldo inicial
          <select id="eap-caldo" style="display:block;width:100%;margin-top:3px;padding:8px 7px;border:1px solid #b4cae1;border-radius:6px;font-size:12px;background:#fff">
            <option value="">—</option>
            ${FITO_CALDO_OPCIONES.map(o=>`<option value="${o.litros}">${o.label}</option>`).join('')}
          </select>
        </label>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px">
          <button type="button" onclick="document.getElementById('especifico-por-partidas-overlay').style.display='none'" style="padding:7px 12px;font-size:12px;background:#fff;color:#1558a0;border:1px solid #a8c4e8;border-radius:6px;cursor:pointer">Cancelar</button>
          <button type="button" id="eap-aplicar" onclick="aplicarEspecificoAPartidasSeleccionadas()" style="padding:7px 14px;font-size:12px;font-weight:800;background:#1558a0;color:#fff;border:1px solid #1558a0;border-radius:6px;cursor:pointer">Aplicar</button>
        </div>
      </div>
    </div>`;
  overlay.style.display = 'flex';
}
// §0.150: cada alta desde Partidas tiene identidad propia, incluso si
// dos partidas comparten una calle. La cuadrícula sigue leyendo "texto".
let espPartidasAltasPendientes={};
// Operaciones por ID y celda. Se fusionan contra el estado remoto en el
// mismo ETag para que dos usuarios no se pisen en una calle compartida.
const espPartidasCellOpsPendientes=new Map();
function celdaEspecificoPartidaActualizada(raw,registroId,info,eliminar){
  const original=raw && typeof raw==='object' ? raw : null;
  if(raw && !original?.partidaRegistros &&
     (typeof raw==='string'?raw.trim():String(original?.texto||'').trim())){
    throw new Error('Hay un específico anterior en esa calle y día. Revísalo en Específicos antes de añadir otro.');
  }
  const registros={...(original?.partidaRegistros||{})};
  if(eliminar){
    // Una escritura v1 puede estar confirmada aunque haya fallado su
    // sincronización v2. El reintento del mismo borrado es idempotente.
    if(!registros[registroId])return raw||null;
    delete registros[registroId];
  }else{
    registros[registroId]={...info};
  }
  const activos=Object.values(registros);
  if(!activos.length)return null;
  const textos=activos.map(r=>
    [r.trat,r.dosis].filter(Boolean).join(' ')+
    (r.horario?' + '+r.horario:'')+
    ' — PARTIDA '+String(r.partida||'')
  );
  return {texto:textos.join(' | '),caldoLitros:activos[0].caldoLitros||null,
    caldoLabel:activos[0].caldoLabel||'',partidaRegistros:registros};
}
function planificarEspecificosDesdePartidas(cambios){
  const celdas=new Map();
  const operar=(r,eliminar)=>{
    if(!r||!r.registroId||!r.invId||r.dia==null||!Array.isArray(r.calles))
      throw new Error('Falta la identificación del tratamiento de partida.');
    const layout=INV_LAYOUT[r.invId];
    const validas=layout?[...layout.row1,...layout.row2]:[];
    for(const calle of new Set(r.calles)){
      if(!validas.includes(Number(calle)))throw new Error('Calle fuera del invernadero '+r.invId);
      const clave=[r.invId,r.dia,calle].join('|');
      const actual=celdas.has(clave)?celdas.get(clave).valor:
        especificosData[r.invId]?.[r.dia]?.[calle]||null;
      const valor=celdaEspecificoPartidaActualizada(actual,r.registroId,
        {partidaId:r.partidaId,partida:r.partida,trat:r.trat,dosis:r.dosis,
          horario:r.horario||'',caldoLitros:r.caldoLitros||null,
          caldoLabel:r.caldoLabel||''},eliminar);
      const previo=celdas.get(clave);
      const ops={...(previo?.ops||{})};
      ops[r.registroId]=eliminar?null:{
        partidaId:r.partidaId,partida:r.partida,trat:r.trat,dosis:r.dosis,
        horario:r.horario||'',caldoLitros:r.caldoLitros||null,caldoLabel:r.caldoLabel||''
      };
      celdas.set(clave,{invId:r.invId,dia:r.dia,calle,valor,ops});
    }
  };
  cambios.forEach(c=>{if(c.antes)operar(c.antes,true);});
  cambios.forEach(c=>{if(c.despues)operar(c.despues,false);});
  return [...celdas.values()];
}
function aplicarPlanEspecificosPartidas(plan){
  for(const x of plan){
    if(!especificosData[x.invId])especificosData[x.invId]={};
    if(!especificosData[x.invId][x.dia])especificosData[x.invId][x.dia]={};
    if(x.valor==null)delete especificosData[x.invId][x.dia][x.calle];
    else especificosData[x.invId][x.dia][x.calle]=x.valor;
    const key=especificosDirtyCellKey(x.invId,x.dia,x.calle);
    espPartidasCellOpsPendientes.set(key,{
      ...(espPartidasCellOpsPendientes.get(key)||{}),...x.ops
    });
    marcarEspecificosDirtyCell(x.invId,x.dia,x.calle);
  }
}
async function verificarTareasPartidasEditables(cambios){
  await loadTareasData();
  for(const c of cambios){
    if(!c.antes)continue;
    const tarea=tareasData.find(t=>t.especificoPartidaRegistroId===c.antes.registroId);
    if(tarea&&tarea.estado!=='pendiente'&&
       !(tarea.estado==='anulada'&&!c.despues))
      throw new Error('Este específico tiene una tarea iniciada, completada o archivada. No puede editarse ni eliminarse.');
  }
}
// En vez de fusionar tareas ajenas por título, usar identidad inequívoca.
async function sincronizarTareasDesdePartidas(cambios){
  const tx=await actualizarStorageJsonConEtag(TAREAS_KEY,[],cloud=>{
    if(!Array.isArray(cloud))cloud=[];
    for(const c of cambios){
      const r=c.despues||c.antes;
      const index=cloud.findIndex(t=>t.especificoPartidaRegistroId===r.registroId);
      if(index>=0&&cloud[index].estado!=='pendiente'&&
         !(cloud[index].estado==='anulada'&&!c.despues))
        throw new Error('Una tarea se ha iniciado durante la operación. Avise a ADMIN.');
      if(!c.despues){
        if(index>=0){
          cloud[index]={...cloud[index],estado:'anulada',
            motivoAnulacion:'Eliminado desde Partidas',archivadaEn:new Date().toISOString()};
        }
        continue;
      }
      const d=c.despues,fechaISO=d.fechaISO||fechaLocalISO(riegoDiaToDate(d.dia));
      const gasto=d.caldoLitros&&d.dosis?
        Math.round(parseFloat(d.dosis)*d.caldoLitros*100)/100+'cc':'';
      const campos={titulo:[d.trat,d.dosis].filter(Boolean).join(' '),
        descripcion:'Partida '+d.partida,inv:d.invId,calles:formatCallesConEnteroParaImprimir(d.invId,d.calles),
        fecha:riegoDiaLabelCorto(d.dia),fechaISO,horario:d.horario||'',
        producto:d.trat,dosis:d.dosis,caldoLabel:d.caldoLabel||'',gastoLabel:gasto,
        categoria:'especifico',origenTarea:'especificos',
        especificoPartidaRegistroId:d.registroId,especificoPartidaId:d.partidaId};
      if(index>=0)cloud[index]={...cloud[index],...campos};
      else cloud.push({id:'tarea_esp_'+d.registroId,...campos,
        asignadoA:reganteDelaSala(d.invId),asignadoPor:currentUser||'—',
        prioridad:'normal',estado:'pendiente',visto:false,
        creadoEn:new Date().toLocaleString('es-ES')});
    }
    return cloud;
  });
  if(!tx.ok) return false;
  tareasData=tx.value;
  tareasDataCargadaEn=Date.now();
  refreshTareasViews();
  return true;
}
// La cuadrícula, los banners y Tareas son nodos Firebase separados.
// Si la última escritura falla, conservar una conciliación local durable
// para no dejar permanentemente una tarea sin actualizar.
const ESP_PARTIDAS_COLA_TAREAS='viguerapp-test-esp-partidas-tareas-pendientes-v1';
let espPartidasColaConciliando=false;
function leerColaTareasEspPartidas(){
  try{
    const x=JSON.parse(localStorage.getItem(ESP_PARTIDAS_COLA_TAREAS)||'[]');
    return Array.isArray(x)?x.filter(c=>c&&(c.despues||c.antes)): [];
  }catch(_){return [];}
}
function escribirColaTareasEspPartidas(cola){
  try{localStorage.setItem(ESP_PARTIDAS_COLA_TAREAS,JSON.stringify(cola));return true;}
  catch(_){showToast('No se puede guardar la cola de tareas de específicos en este dispositivo.');return false;}
}
function encolarTareasEspPartidas(cambios){
  const mapa=new Map(leerColaTareasEspPartidas().map(c=>[(c.despues||c.antes).registroId,c]));
  cambios.forEach(c=>mapa.set((c.despues||c.antes).registroId,c));
  return escribirColaTareasEspPartidas([...mapa.values()]);
}
async function sincronizarColaTareasEspPartidas(){
  if(espPartidasColaConciliando)return false;
  const cola=leerColaTareasEspPartidas();
  if(!cola.length)return true;
  espPartidasColaConciliando=true;
  try{
    const ok=await sincronizarTareasDesdePartidas(cola);
    if(!ok)return false;
    const procesadas=new Map(cola.map(c=>[(c.despues||c.antes).registroId,JSON.stringify(c)]));
    const actuales=leerColaTareasEspPartidas();
    return escribirColaTareasEspPartidas(actuales.filter(c=>
      procesadas.get((c.despues||c.antes).registroId)!==JSON.stringify(c)));
  }catch(e){showToast('Tareas de específicos pendientes de sincronizar: '+e.message);return false;}
  finally{espPartidasColaConciliando=false;}
}
async function guardarCambiosEspecificosDesdePartidas(cambios){
  const invs=[...new Set(cambios.flatMap(c=>[c.antes?.invId,c.despues?.invId]).filter(Boolean))];
  if(!(await loadEspecificosInvsData(invs,false)))return false;
  await verificarTareasPartidasEditables(cambios);
  const plan=planificarEspecificosDesdePartidas(cambios);
  aplicarPlanEspecificosPartidas(plan);
  // Guardar primero el tratamiento: nunca publicar una tarea antes de
  // confirmar la escritura de la cuadrícula y la ficha.
  if(!(await saveEspecificosData()))return false;
  for(const c of cambios){
    const r=c.despues||c.antes;
    const regs=especificosPartidaData[r.partidaId]||[];
    const ix=regs.findIndex(e=>e.registroId===r.registroId);
    if(c.despues){
      if(ix>=0)regs[ix]={...c.despues};
      else regs.push({...c.despues});
    }else if(ix>=0)regs.splice(ix,1);
    especificosPartidaData[r.partidaId]=regs;
    marcarEspecificosPartidaDirty(r.partidaId);
  }
  if(!(await saveEspecificosPartidaData()))return false;
  if(!encolarTareasEspPartidas(cambios))return false;
  if(!(await sincronizarColaTareasEspPartidas())){
    showToast('Tratamiento guardado; la tarea está pendiente de sincronizar. No repitas el alta.');
    return false;
  }
  return true;
}
async function aplicarEspecificoAPartidasSeleccionadas(){
  const boton=document.getElementById('eap-aplicar');
  if(boton?.disabled)return;
  const dia=Number(document.getElementById('eap-dia')?.value);
  const trat=document.getElementById('eap-trat')?.value||'';
  const dosis=document.getElementById('eap-dosis')?.value||'';
  const horario=document.getElementById('eap-horario')?.value||'';
  const caldoLitros=parseFloat(document.getElementById('eap-caldo')?.value)||null;
  if(!Number.isInteger(dia)||!ESPECIFICO_TRATAMIENTOS.includes(trat)||
     !ESPECIFICO_DOSIS.includes(dosis)){showToast('Selecciona tratamiento, dosis y día.');return;}
  const caldoLabel=caldoLitros?
    (FITO_CALDO_OPCIONES.find(x=>x.litros===caldoLitros)?.label||caldoLitros+'L'):'';
  const ids=[...partidasEspecificoSeleccion];
  if(!ids.length){showToast('Selecciona al menos una partida.');return;}
  if(boton)boton.disabled=true;
  try{
    if(!(await loadEspecificosPartidaIdsData(ids,false)))throw new Error('No se pudieron cargar las fichas.');
    const cambios=[];
    for(const id of ids){
      const c=controlChecksData.find(x=>x.id===id);
      if(!c?.invId)throw new Error('Partida no encontrada.');
      const calles=[...new Set(callesDePartidaEntry(c))];
      if(!calles.length)throw new Error('Partida sin calles.');
      const registroId=espPartidasAltasPendientes[id]||
        ('esp_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10));
      espPartidasAltasPendientes[id]=registroId;
      const previo=(especificosPartidaData[id]||[]).find(e=>e.registroId===registroId);
      const duplicado=(especificosPartidaData[id]||[]).some(e=>
        e.registroId!==registroId&&e.dia===dia&&e.trat===trat&&
        e.dosis===dosis&&e.horario===horario&&e.invId===c.invId);
      if(duplicado)throw new Error('El específico ya existe para una partida seleccionada.');
      const nuevo={registroId,partidaId:id,partida:c.partida,trat,dosis,horario,
        fechaLabel:riegoDiaLabelCorto(dia),fechaISO:fechaLocalISO(riegoDiaToDate(dia)),
        invId:c.invId,dia,calles,caldoLitros,caldoLabel};
      // Un reintento tras una desconexión conserva la misma identidad.
      cambios.push({antes:previo?{...previo}:null,despues:nuevo});
    }
    if(!(await guardarCambiosEspecificosDesdePartidas(cambios)))
      throw new Error('Guardado incompleto: no abras otro alta. Puedes reintentar con este mismo botón.');
    document.getElementById('especifico-por-partidas-overlay').style.display='none';
    espPartidasAltasPendientes={};
    partidasEspecificoModo=false;
    partidasEspecificoSeleccion=new Set();
    showToast('✓ Específicos guardados y tareas vinculadas');
    renderPartidasMapaContent(document.getElementById('partidas-overlay'));
  }catch(e){showToast('Operación no completada: '+e.message);}
  finally{if(boton)boton.disabled=false;}
}
// Editar/eliminar un banner de específico ya aplicado a una partida (a
// petición de Paula, 2026-08-11: "al pincharle se debe de poder editar") —
// edita el propio registro de especificosPartidaData (la anotación visual),
// no vuelve a tocar las calles de especificosData.
function editarEspecificoPartidaBanner(partidaId, idx){
  const registros = especificosPartidaData[partidaId];
  if(!registros || !registros[idx]) return;
  const e = registros[idx];
  if(!e.registroId){
    showToast('Registro histórico: para editarlo sin perder otros tratamientos utiliza Específicos.');return;
  }
  const escapar = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const overlay = getOrCreateOverlay('especifico-banner-editar-overlay');
  overlay.style.zIndex = 2300;
  // Rango de días para el selector (a petición de Paula, 2026-08-11: "que
  // deje cambiar el día a 2 días de atrás y al actual, no que aparezca otro
  // mes") — solo hoy y los 2 días anteriores; si el registro ya estaba en
  // un día fuera de ese rango, se añade suelto al principio para no
  // perderlo de la vista (sigue seleccionado tal cual hasta que se cambie).
  const hoy = riegoDiaDeHoy();
  const diasRango = [hoy-2, hoy-1, hoy];
  if(!diasRango.some(d=>fechaLocalISO(riegoDiaToDate(d))===e.fechaISO)){
    const diaActual = [...Array(400)].map((_,i)=>i).find(d=>fechaLocalISO(riegoDiaToDate(d))===e.fechaISO);
    if(diaActual!=null) diasRango.unshift(diaActual);
  }
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:14px;max-width:340px;width:100%;padding:1.5rem;box-shadow:0 8px 40px rgba(0,0,0,.3)">
      <div style="font-size:15px;font-weight:800;margin-bottom:14px">✏️ Editar Específico</div>
      <label style="font-size:11px;font-weight:700;color:var(--muted)">Día</label>
      <select id="eeb-dia" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:7px;font-size:13px;margin:4px 0 10px">
        ${diasRango.map(d=>`<option value="${d}"${fechaLocalISO(riegoDiaToDate(d))===e.fechaISO?' selected':''}>${escapar(riegoDiaLabelCorto(d))} — ${escapar(riegoDiaSemana(d))}</option>`).join('')}
      </select>
      <label style="font-size:11px;font-weight:700;color:var(--muted)">Tratamiento</label>
      <select id="eeb-trat" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:7px;font-size:13px;margin:4px 0 10px">
        ${ESPECIFICO_TRATAMIENTOS.map(t=>`<option value="${t}"${t===e.trat?' selected':''}>${t}</option>`).join('')}
      </select>
      <label style="font-size:11px;font-weight:700;color:var(--muted)">Dosis</label>
      <select id="eeb-dosis" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:7px;font-size:13px;margin:4px 0 10px">
        ${ESPECIFICO_DOSIS.map(d=>`<option value="${d}"${d===e.dosis?' selected':''}>${d}</option>`).join('')}
      </select>
      <label style="font-size:11px;font-weight:700;color:var(--muted)">Horario</label>
      <select id="eeb-horario" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:7px;font-size:13px;margin:4px 0 14px">
        <option value=""${!e.horario?' selected':''}>—</option>
        ${ESPECIFICO_HORARIOS.map(h=>`<option value="${h}"${h===e.horario?' selected':''}>${h}</option>`).join('')}
      </select>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <button onclick="borrarEspecificoPartidaBanner('${partidaId}',${idx})" style="padding:9px 14px;font-size:12px;font-weight:800;background:#fdecea;color:#c62828;border:1px solid #f0b0b0;border-radius:7px;cursor:pointer">🗑️ Eliminar</button>
        <div style="display:flex;gap:8px">
          <button onclick="document.getElementById('especifico-banner-editar-overlay').style.display='none'" style="padding:9px 16px;font-size:12px;background:#f5f5f5;color:#555;border:1px solid #ddd;border-radius:7px;cursor:pointer">Cancelar</button>
          <button onclick="guardarEspecificoPartidaBanner('${partidaId}',${idx})" style="padding:9px 18px;font-size:12px;font-weight:800;background:#1558a0;color:#fff;border:none;border-radius:7px;cursor:pointer">Guardar</button>
        </div>
      </div>
    </div>`;
  overlay.style.display = 'flex';
}
async function guardarEspecificoPartidaBanner(partidaId,idx){
  const original=especificosPartidaData[partidaId]?.[idx];
  if(!original)return;
  if(!original.registroId){
    showToast('Histórico sin vínculo único: edítalo desde Específicos. No se modificó la ficha.');
    return;
  }
  const dia=Number(document.getElementById('eeb-dia')?.value);
  const trat=document.getElementById('eeb-trat')?.value||'';
  const dosis=document.getElementById('eeb-dosis')?.value||'';
  const horario=document.getElementById('eeb-horario')?.value||'';
  if(!Number.isInteger(dia)||!ESPECIFICO_TRATAMIENTOS.includes(trat)||
    !ESPECIFICO_DOSIS.includes(dosis)){showToast('Selecciona día, tratamiento y dosis.');return;}
  const nuevo={...original,partidaId,trat,dosis,horario,dia,
    fechaLabel:riegoDiaLabelCorto(dia),fechaISO:fechaLocalISO(riegoDiaToDate(dia))};
  try{
    if(!(await guardarCambiosEspecificosDesdePartidas([{antes:{...original,partidaId},despues:nuevo}])))
      throw new Error('Guardado incompleto. Revisa la conexión y vuelve a guardar.');
    document.getElementById('especifico-banner-editar-overlay').style.display='none';
    renderPartidasMapaContent(document.getElementById('partidas-overlay'));
    if(document.getElementById('partidas-historial-overlay')?.style.display==='flex')
      await mostrarHistorialPartida(partidaId);
    if(especificosInvSel===nuevo.invId)renderEspecificosGrid(nuevo.invId);
    showToast('✓ Ficha, cuadrícula y tarea actualizadas');
  }catch(e){showToast('Actualización incompleta: '+e.message);}
}
async function borrarEspecificoPartidaBanner(partidaId,idx){
  const original=especificosPartidaData[partidaId]?.[idx];
  if(!original)return;
  if(!original.registroId){
    showToast('Histórico sin vínculo único: no puede borrarse con seguridad desde la ficha.');
    return;
  }
  if(!confirm('¿Eliminar este específico y anular su tarea pendiente?'))return;
  try{
    if(!(await guardarCambiosEspecificosDesdePartidas([{antes:{...original,partidaId},despues:null}])))
      throw new Error('Guardado incompleto. Verifica la tarea antes de reintentar.');
    document.getElementById('especifico-banner-editar-overlay').style.display='none';
    renderPartidasMapaContent(document.getElementById('partidas-overlay'));
    if(document.getElementById('partidas-historial-overlay')?.style.display==='flex')
      await mostrarHistorialPartida(partidaId);
    if(especificosInvSel===original.invId)renderEspecificosGrid(original.invId);
    showToast('✓ Eliminado sin borrar otros tratamientos; tarea anulada');
  }catch(e){showToast('Eliminación incompleta: '+e.message);}
}
// Insertar por drag & drop sin intercambiar el destino ni perder sus datos.
let partidasDragId=null, partidasIndicadorDrop=null, partidasSuprimirClickHasta=0;
let partidasDragIndiceCalle=null;
let partidasTouch=null, partidasTouchTimer=null;
function quitarIndicadorDropPartidas(){
  if(partidasIndicadorDrop)partidasIndicadorDrop.style.boxShadow='';
  partidasIndicadorDrop=null;
}
function destinoInsercionPartidas(event,id){
  const c=controlChecksData.find(x=>x.id===id);
  const el=event.currentTarget;
  if(!c||!el)return null;
  const rect=el.getBoundingClientRect();
  const abajo=el.dataset?.partidaLado==='abajo';
  const calles=String(el.dataset?.partidaCalles||'').split(',').filter(Boolean).map(Number).filter(Number.isFinite);
  if(!calles.length||rect.width<=0)return null;
  const arribaVisual=event.clientY<rect.top+rect.height/2;
  const lado=abajo?(arribaVisual?'despues':'antes'):(arribaVisual?'antes':'despues');
  const x=Math.min(rect.right-0.01,Math.max(rect.left,event.clientX));
  const calle=calles[Math.min(calles.length-1,Math.floor((x-rect.left)/rect.width*calles.length))];
  return {lado,calle,arribaVisual};
}
function iniciarArrastrePartida(event,id){
  if(partidasEspecificoModo){event.preventDefault();return;}
  partidasDragId=id;partidaSeleccionadaParaMover=id;
  const rect=event.currentTarget?.getBoundingClientRect();
  const n=String(event.currentTarget?.dataset?.partidaCalles||'').split(',').filter(Boolean).length;
  partidasDragIndiceCalle=rect?.width&&n?
    Math.max(0,Math.min(n-1,Math.floor((event.clientX-rect.left)/rect.width*n))):0;
  if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',id);}
}
function sobrePartidaArrastrada(event,id){
  if(partidasEspecificoModo||!partidasDragId||partidasDragId===id)return;
  event.preventDefault();
  if(event.dataTransfer)event.dataTransfer.dropEffect='move';
  const d=destinoInsercionPartidas(event,id);
  quitarIndicadorDropPartidas();
  partidasIndicadorDrop=event.currentTarget;
  partidasIndicadorDrop.style.boxShadow=d.arribaVisual?'inset 0 4px #1558a0':'inset 0 -4px #1558a0';
}
function terminarArrastrePartida(){
  quitarIndicadorDropPartidas();
  partidasDragId=null;partidaSeleccionadaParaMover=null;
  partidasDragIndiceCalle=null;
}
function soltarPartidaSobrePartida(event,id){
  event.preventDefault();event.stopPropagation();
  const origen=partidasDragId||event.dataTransfer?.getData('text/plain');
  const d=destinoInsercionPartidas(event,id);
  partidasSuprimirClickHasta=Date.now()+600;
  terminarArrastrePartida();
  if(origen&&origen!==id&&d)aplicarInsercionPartidaMapa(origen,id,d.lado,d.calle);
}
// Arrastre táctil de verdad. Pointer capture + touch-action:none evitan el
// scroll del navegador y la pérdida de eventos (iOS/Safari y Android/Chrome).
// No se cambia el DOM del mapa hasta soltar: ninguna tarjeta se superpone.
let partidasPunteroActivo=null;
let partidasPunteroFantasma=null;
let partidasPunteroRaf=null;
let partidasEtiquetaDrop=null;
function mostrarEtiquetaDropPartidas(destino){
  if(!destino){
    if(partidasEtiquetaDrop){partidasEtiquetaDrop.remove();partidasEtiquetaDrop=null;}
    return;
  }
  if(!partidasEtiquetaDrop){
    partidasEtiquetaDrop=document.createElement('div');
    partidasEtiquetaDrop.style.cssText='position:fixed;z-index:10001;pointer-events:none;'+
      'left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));'+
      'margin:auto;max-width:320px;box-sizing:border-box;'+
      'padding:8px 12px;border-radius:7px;background:#1558a0;color:#fff;'+
      'box-shadow:0 3px 12px rgba(0,0,0,.25);font-size:12px;font-weight:800;text-align:center;';
    document.body.appendChild(partidasEtiquetaDrop);
  }
  if(destino.tipo==='hueco'){
    const cs=destino.callesDestino||[destino.calle];
    partidasEtiquetaDrop.textContent=(cs.length>1?'CALLES '+Math.min(...cs)+'–'+Math.max(...cs):
      'CALLE '+cs[0])+' · FILA '+(destino.fila+1)+
      (destino.ladoPasillo==='abajo'?' · Bajo pasillo':' · Sobre pasillo');
  }else{
    const c=controlChecksData.find(x=>x.id===destino.id);
    partidasEtiquetaDrop.textContent=(destino.arribaVisual?'ENCIMA':'DEBAJO')+
      ' de '+(c?.partida||'la partida')+' · Calle '+destino.calle;
  }
}
function iniciarPunteroPartida(event,id){
  if(partidasEspecificoModo || (event.pointerType!=='touch' && event.pointerType!=='pen') || event.isPrimary===false)return;
  if(partidasPunteroActivo)cancelarPunteroPartida();
  const el=event.currentTarget,rect=el.getBoundingClientRect();
  el.draggable=false;
  partidasPunteroActivo={id,pointerId:event.pointerId,el,inicioX:event.clientX,inicioY:event.clientY,
    agarrarX:event.clientX-rect.left,agarrarY:event.clientY-rect.top,
    ancho:rect.width,alto:rect.height,x:event.clientX,y:event.clientY,arrastrando:false,destino:null};
  try{el.setPointerCapture(event.pointerId);}catch(_){}
}
function crearFantasmaPartida(){
  const s=partidasPunteroActivo;
  if(!s || partidasPunteroFantasma)return;
  const f=document.createElement('div');
  const c=controlChecksData.find(x=>x.id===s.id);
  f.textContent=c?.partida||'Partida';
  f.style.cssText='position:fixed;z-index:9999;pointer-events:none;box-sizing:border-box;'+
    'width:'+s.ancho+'px;height:'+s.alto+'px;display:flex;align-items:center;justify-content:center;'+
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-radius:5px;padding:3px 5px;'+
    'border:2px solid #1558a0;background:'+(s.el.dataset.partidaColor||s.el.style.background)+';color:#16436c;opacity:.85;'+
    'font-size:11px;font-weight:800;box-shadow:0 3px 8px rgba(0,0,0,.22);';
  document.body.appendChild(f);
  partidasPunteroFantasma=f;
}
function buscarDestinoTactilPartidas(x,y,origenId){
  // Si la celda de destino está vacía, reconocerla directamente, sin
  // exigir otra tarjeta cercana. Funciona en las dos bandas del pasillo.
  const punto=document.elementFromPoint(x,y);
  if(!punto?.closest('#partidas-mapa-horizontal'))return null;
  const hueco=punto.closest('[data-partidas-hueco]');
  if(hueco&&hueco.closest('#partidas-overlay')){
    const calle=Number(hueco.dataset.partidasCalle);
    const invId=hueco.dataset.partidasInv;
    if(Number.isFinite(calle)&&invId===partidasInvSel)
      return {tipo:'hueco',invId,calle,fila:Number(hueco.dataset.partidasFila),
        ladoPasillo:hueco.dataset.partidasLado,el:hueco};
  }
  // El dedo puede quedar EN la tarjeta o inmediatamente DESPUÉS de su borde.
  // La versión anterior aceptaba solo 3px fuera: debajo de la última partida
  // no existía ninguna zona donde soltar. Se permite un carril de 24px en
  // ambos extremos, siempre restringido a la columna real del destino.
  if(punto.textContent?.trim()==='PASILLO')return null;
  const offsets=[0,-4,4,-8,8,-12,12,-18,18,-24,24,-28,28];
  let mejor=null;
  for(const dy of offsets){
    const el=document.elementFromPoint(x,y+dy)?.closest('[data-partida-id]');
    if(!el||el.dataset.partidaId===origenId||!el.closest('#partidas-overlay'))continue;
    const r=el.getBoundingClientRect();
    if(x<r.left||x>=r.right)continue;
    // Preferir el borde de la tarjeta más próximo al dedo; no elegir
    // arbitrariamente otra fila o columna.
    const distancia=Math.max(r.top-y,0,y-r.bottom);
    if(distancia>24)continue;
    const id=el.dataset.partidaId;
    const d=destinoInsercionPartidas({currentTarget:el,clientX:x,clientY:y},id);
    if(!d||d.calle==null)continue;
    const candidato={id,lado:d.lado,calle:d.calle,arribaVisual:d.arribaVisual,el,distancia};
    if(!mejor||candidato.distancia<mejor.distancia)mejor=candidato;
    if(!distancia)break; // el dedo está realmente sobre esa tarjeta
  }
  return mejor;
}
function actualizarDestinoPunteroPartidas(){
  const s=partidasPunteroActivo;
  if(!s||!s.arrastrando)return;
  if(partidasPunteroFantasma){
    // El punto de la tarjeta que se agarró permanece bajo el dedo.
    partidasPunteroFantasma.style.left=(s.x-s.agarrarX)+'px';
    partidasPunteroFantasma.style.top=(s.y-s.agarrarY)+'px';
  }
  quitarIndicadorDropPartidas();
  const d=buscarDestinoTactilPartidas(s.x,s.y,s.id);
  if(!d){s.destino=null;mostrarEtiquetaDropPartidas(null);return;}
  const origen=controlChecksData.find(c=>c.id===s.id);
  const callesOrigen=origen?[...new Set(callesDePartidaEntry(origen))]:[];
  const indice=callesOrigen.length?Math.max(0,Math.min(callesOrigen.length-1,
    Math.floor(s.agarrarX/s.ancho*callesOrigen.length))):0;
  const hueco=d.tipo==='hueco'?
    resolverHuecoPartida(s.id,d.invId,d.calle,d.fila,indice):null;
  if(hueco){d.callesDestino=hueco.callesDestino;d.indiceAgarrado=indice;}
  const misma=origen&&origen.invId===partidasInvSel&&callesOrigen.includes(d.calle);
  const permitida=d.tipo==='hueco'?!!hueco:
    misma||!!origen&&callesOrigen.length===1;
  partidasIndicadorDrop=d.el;
  if(!permitida){
    s.destino=null;
    mostrarEtiquetaDropPartidas(null);
    d.el.style.boxShadow='inset 0 0 0 2px #b42332';
    return;
  }
  s.destino=d;
  mostrarEtiquetaDropPartidas(d);
  d.el.style.boxShadow=d.tipo==='hueco'?'inset 0 0 0 3px #1558a0':
    (d.arribaVisual?'inset 0 5px #1558a0':'inset 0 -5px #1558a0');
}
function desplazamientoAutomaticoPartidas(){
  partidasPunteroRaf=null;
  const s=partidasPunteroActivo;
  if(!s || !s.arrastrando)return;
  let scrollMovido=false;
  // El INV 1A muestra solo cinco filas superiores a la vez; en el arrastre
  // permitir desplazarse a otras filas sin abrir una altura extra de grid.
  const banda1A=document.getElementById('partidas-1a-superior-scroll');
  if(banda1A){
    const r=banda1A.getBoundingClientRect();
    if(s.x>=r.left&&s.x<=r.right&&s.y>=r.top-18&&s.y<=r.bottom+18){
      const margen=36;
      const delta=s.y<r.top+margen?-Math.ceil((r.top+margen-s.y)/4):
        s.y>r.bottom-margen?Math.ceil((s.y-(r.bottom-margen))/4):0;
      if(delta){
        const anterior=banda1A.scrollTop;
        banda1A.scrollTop+=Math.max(-15,Math.min(15,delta));
        scrollMovido=scrollMovido||banda1A.scrollTop!==anterior;
      }
    }
  }
  const zona=document.getElementById('partidas-content-wrap');
  if(zona){
    const r=zona.getBoundingClientRect();
    if(s.x>=r.left && s.x<=r.right){
      let delta=0;
      if(s.y<r.top+52 && s.y>r.top-15)delta=-Math.ceil((r.top+52-s.y)/5);
      if(s.y>r.bottom-52 && s.y<r.bottom+15)delta=Math.ceil((s.y-(r.bottom-52))/5);
      if(delta){
        const anterior=zona.scrollTop;
        zona.scrollTop+=Math.max(-15,Math.min(15,delta));
        scrollMovido=scrollMovido || anterior!==zona.scrollTop;
      }
    }
  }
  const mapa=document.getElementById('partidas-mapa-horizontal');
  if(mapa){
    const r=mapa.getBoundingClientRect();
    if(s.y>=r.top && s.y<=r.bottom){
      let delta=0;
      if(s.x<r.left+48 && s.x>r.left-15)delta=-Math.ceil((r.left+48-s.x)/5);
      if(s.x>r.right-48 && s.x<r.right+15)delta=Math.ceil((s.x-(r.right-48))/5);
      if(delta){
        const anterior=mapa.scrollLeft;
        mapa.scrollLeft+=Math.max(-15,Math.min(15,delta));
        scrollMovido=scrollMovido || anterior!==mapa.scrollLeft;
      }
    }
  }
  if(scrollMovido)actualizarDestinoPunteroPartidas();
  partidasPunteroRaf=requestAnimationFrame(desplazamientoAutomaticoPartidas);
}
function moverPunteroPartida(event){
  const s=partidasPunteroActivo;
  if(!s || s.pointerId!==event.pointerId)return;
  s.x=event.clientX;s.y=event.clientY;
  if(!s.arrastrando){
    if(Math.hypot(s.x-s.inicioX,s.y-s.inicioY)<7)return;
    s.arrastrando=true;
    partidasDragId=s.id;
    partidaSeleccionadaParaMover=s.id;
    s.el.style.opacity='.35';
    crearFantasmaPartida();
    partidasPunteroRaf=requestAnimationFrame(desplazamientoAutomaticoPartidas);
  }
  if(event.cancelable)event.preventDefault();
  actualizarDestinoPunteroPartidas();
}
function limpiarPunteroPartida(){
  const s=partidasPunteroActivo;
  if(partidasPunteroRaf!=null)cancelAnimationFrame(partidasPunteroRaf);
  partidasPunteroRaf=null;
  if(s){
    s.el.style.opacity='';
    s.el.draggable=true;
    try{if(s.el.hasPointerCapture?.(s.pointerId))s.el.releasePointerCapture(s.pointerId);}catch(_){}
  }
  if(partidasPunteroFantasma)partidasPunteroFantasma.remove();
  partidasPunteroFantasma=null;
  mostrarEtiquetaDropPartidas(null);
  partidasPunteroActivo=null;
  terminarArrastrePartida();
}
function soltarPunteroPartida(event){
  const s=partidasPunteroActivo;
  if(!s || s.pointerId!==event.pointerId)return;
  const movida=s.arrastrando;
  if(movida){
    if(event.cancelable)event.preventDefault();
    event.stopPropagation();
    s.x=event.clientX;s.y=event.clientY;
    actualizarDestinoPunteroPartidas();
    const destino=s.destino;
    const origen=s.id;
    partidasSuprimirClickHasta=Date.now()+850;
    limpiarPunteroPartida();
    if(destino?.tipo==='hueco')moverPartidaAHueco(origen,destino.invId,destino.calle,destino.fila,destino.indiceAgarrado);
    else if(destino)aplicarInsercionPartidaMapa(origen,destino.id,destino.lado,destino.calle);
    else showToast('Suelta sobre una partida o una calle vacía');
  }else limpiarPunteroPartida();
}
function cancelarPunteroPartida(event){
  if(!partidasPunteroActivo)return;
  if(event && partidasPunteroActivo.pointerId!==event.pointerId)return;
  if(partidasPunteroActivo.arrastrando)partidasSuprimirClickHasta=Date.now()+850;
  limpiarPunteroPartida();
}
// Se conservan ubicación, QC, historial y relaciones; si es multicalle,
// para cambiar de calle debe separarse expresamente desde la ficha.
// Insertar antes/después de otra tarjeta crea una fila REAL y mantiene
// todas las posiciones existentes (sin apilar ni mover automáticamente).
// La cola offline conserva posiciones absolutas y no duplica un segundo
// desplazamiento al reproducir la operación.
async function aplicarInsercionPartidaMapa(idOrigen,idDestino,lado,calleDestino,semanaGuardada,filasFijadas){
  const src=controlChecksData.find(x=>x.id===idOrigen);
  const dst=controlChecksData.find(x=>x.id===idDestino);
  const semana=Number.isInteger(semanaGuardada)?semanaGuardada:partidasSemanaOffset;
  const calle=Number(calleDestino);
  if(!src||!dst||src.id===dst.id||!['antes','despues'].includes(lado)||
      !Number.isInteger(calle)||!callesDePartidaEntry(dst).includes(calle)||
      !partidaVisibleEnSemana(partidaParaPintar(src),semana)||
      !partidaVisibleEnSemana(partidaParaPintar(dst),semana))return false;
  const srcCalles=callesDePartidaEntry(src);
  const multicalle=srcCalles.length>1;
  if(multicalle&&(src.invId!==dst.invId||!srcCalles.includes(calle))){
    showToast('Separa primero la partida multicalle para cambiarla de calle');return false;
  }
  const originalDst=calcularBloquesPartidasInvBase(dst.invId,semana);
  const bloqueDestino=originalDst.find(b=>b.entry.id===idDestino&&b.calles.includes(calle));
  if(!bloqueDestino)return false;
  const filaDestino=bloqueDestino.pos+(lado==='despues'?1:0);
  if(filaDestino>300){showToast('No quedan filas disponibles');return false;}
  let plan;
  if(Array.isArray(filasFijadas)){
    // Reintentos de versiones anteriores podían incluir TODAS las calles
    // del pasillo. No volver a desplazar registros ajenos al movimiento.
    const alcance=new Set([...srcCalles,calle]);
    plan=filasFijadas.filter(x=>{
      if(x?.id===idOrigen)return true;
      const c=controlChecksData.find(e=>e.id===x?.id);
      return c&&c.invId===dst.invId&&
        callesDePartidaEntry(c).some(n=>alcance.has(n));
    });
  }else{
    const porId=new Map();
    originalDst.forEach(b=>{if(!porId.has(b.entry.id))porId.set(b.entry.id,b.pos);});
    // Solo las calles reales que ocupa la tarjeta reciben empujes.
    // Las demás calles (aunque estén en el mismo lado del pasillo) no
    // cambian de fila. Los huecos se conservan: nadie baja por sistema.
    const tramos=multicalle
      ? (src.tramos||[{desde:src.calleDesde,hasta:src.calleHasta}]).map(t=>({...t}))
      : [{desde:calle,hasta:calle}];
    const destinoCalles=new Set(tramos.flatMap(t=>
      Array.from({length:Math.abs(t.hasta-t.desde)+1},
        (_,i)=>Math.min(t.desde,t.hasta)+i)));
    const relevantes=new Set([...srcCalles,...destinoCalles]);
    const posiciones=new Map([...porId].filter(([id])=>id!==src.id));
    const porCalles=new Map([...posiciones.keys()].map(id=>{
      const item=controlChecksData.find(c=>c.id===id);
      return [id,[...new Set(callesDePartidaEntry(item))]];
    }));
    const desplazados=new Set();
    // Desplazar en cascada solamente los ocupantes que obstaculizan
    // materialmente el sitio; una multicalle ajena que sale de estas
    // calles se considera barrera, nunca se arrastra al resto del grid.
    function despejar(callles,fila,visitados=new Set()){
      if(fila>300)return false;
      const conflictos=[...posiciones].filter(([id,pos])=>
        pos===fila&&porCalles.get(id)?.some(n=>callles.has(n)));
      for(const [id] of conflictos){
        if(visitados.has(id))return false;
        const propias=porCalles.get(id)||[];
        if(propias.some(n=>!destinoCalles.has(n)))return false;
        const siguientes=new Set(visitados);siguientes.add(id);
        if(!despejar(new Set(propias),fila+1,siguientes))return false;
        posiciones.set(id,fila+1);desplazados.add(id);
      }
      return true;
    }
    if(!despejar(destinoCalles,filaDestino)){
      showToast('No cabe sin mover partidas de otras calles. Movimiento cancelado.');
      return false;
    }
    // Fijar el estado previo de las calles afectadas evita que el
    // compactador heredado rellene los huecos al quitar el origen.
    plan=[...porId].filter(([id])=>id!==src.id&&
      porCalles.get(id)?.some(n=>relevantes.has(n))).map(([id,fila])=>{
      const item=controlChecksData.find(c=>c.id===id);
      return {id,ubic:{...snapshotUbicacionPartida(item),
        filaManual:posiciones.get(id)??fila}};
    });
    plan.push({id:idOrigen,ubic:{...snapshotUbicacionPartida(src),invId:dst.invId,
      tramos,calleDesde:tramos[0].desde,calleHasta:tramos[0].hasta,
      filaManual:filaDestino}});

  }
  if(!plan.some(x=>x.id===idOrigen)||new Set(plan.map(x=>x.id)).size!==plan.length||
     plan.some(x=>!controlChecksData.some(c=>c.id===x.id)||
       !Number.isInteger(x.ubic?.filaManual)||x.ubic.filaManual<0||x.ubic.filaManual>300))return false;
  const antes=new Map(plan.map(x=>{
    const c=controlChecksData.find(e=>e.id===x.id);
    return [x.id,snapshotUbicacionPartida(c)];
  }));
  plan.forEach(x=>aplicarUbicacionPartida(x.id,x.ubic));
  const despues=calcularBloquesPartidasInvBase(dst.invId,semana);
  const filasNuevas=new Map();
  despues.forEach(b=>{if(!filasNuevas.has(b.entry.id))filasNuevas.set(b.entry.id,b.pos);});
  // Los registros no relacionados con las calles movidas NO pueden variar
  // de fila, ni siquiera indirectamente por el compactado de datos antiguos.
  const callesInfluidas=new Set([...srcCalles,calle]);
  const otrosIntactos=[...originalDst].every(b=>{
    const entry=controlChecksData.find(c=>c.id===b.entry.id);
    if(!entry||entry.id===src.id)return true;
    const toca=callesDePartidaEntry(entry).some(n=>callesInfluidas.has(n));
    return toca||filasNuevas.get(entry.id)===b.pos;
  });
  const planExacto=plan.every(x=>{
    const bloques=despues.filter(b=>b.entry.id===x.id);
    return bloques.length>0&&bloques.every(b=>b.pos===x.ubic.filaManual);
  });
  const srcEnMapa=despues.filter(b=>b.entry.id===idOrigen);
  const dstEnMapa=despues.find(b=>b.entry.id===idDestino&&b.calles.includes(calle));
  const srcFila=controlChecksData.find(x=>x.id===idOrigen)?.filaManual;
  const destinoValido=srcEnMapa.length>0&&srcEnMapa.every(b=>b.pos===srcFila)&&
    dstEnMapa&&(lado==='antes'?srcFila<dstEnMapa.pos:srcFila>dstEnMapa.pos);
  const ocupadas=new Set();
  const sinSolape=despues.every(b=>b.calles.every(c=>{
    const key=c+':'+b.pos;
    if(ocupadas.has(key))return false;
    ocupadas.add(key);return true;
  }));
  if(!destinoValido||!sinSolape||!otrosIntactos||!planExacto){
    for(const [id,prev] of antes)aplicarUbicacionPartida(id,prev);
    showToast('No se puede insertar aquí sin solapar partidas');return false;
  }
  const cambios=[];
  for(const [id,prev] of antes){
    const c=controlChecksData.find(x=>x.id===id);
    if(c&&JSON.stringify(prev)!==JSON.stringify(snapshotUbicacionPartida(c)))
      cambios.push({id,antes:prev,despues:snapshotUbicacionPartida(c)});
  }
  if(!cambios.length)return true;
  registrarMovimientoPartidas(cambios);
  renderPartidasMapaContent(document.getElementById('partidas-overlay'));
  showToast('✓ Partida insertada en fila '+(srcFila+1));
  const qid=encolarAccionOffline('aplicarInsercionPartidaMapa',
    [idOrigen,idDestino,lado,calle,semana,plan]);
  cambios.forEach(c=>marcarControlCheckSucio(c.id));
  const ok=await persistControlChecksData();
  if(ok)desencolarAccion(qid);else avisarGuardadoLocalPendiente(leerColaOffline().length);
  return ok;
}
function separarPartidaEnCalles(id){
  const c = controlChecksData.find(x=>x.id===id);
  if(!c) return;
  const tramo = (c.tramos && c.tramos.length) ? c.tramos[0] : {desde:c.calleDesde, hasta:c.calleHasta};
  if(tramo.desde==null) return;
  const desde = Math.min(tramo.desde, tramo.hasta??tramo.desde), hasta = Math.max(tramo.desde, tramo.hasta??tramo.desde);
  if(hasta<=desde){ showToast('Esta partida ya es de una sola calle'); return; }
  const calles = [];
  for(let x=desde; x<=hasta; x++) calles.push(x);
  // Los ids de las copias nuevas se generan AQUÍ, antes de guardar — igual
  // que en aplicarNuevaLineaControl — para que la acción sea idempotente al
  // reproducirla desde la cola offline (si ya existe un id, no se duplica).
  const nuevosIds = calles.slice(1).map(()=>nuevoIdUbicacion());
  aplicarSepararPartidaEnCalles(id, calles, nuevosIds);
}
async function aplicarSepararPartidaEnCalles(id, calles, nuevosIds){
  const c = controlChecksData.find(x=>x.id===id);
  if(!c) return;
  c.tramos = [{desde:calles[0], hasta:calles[0]}];
  c.calleDesde = calles[0]; c.calleHasta = calles[0];
  const claveBase = sortKeyPartida(c);
  calles.slice(1).forEach((calle,i)=>{
    const nid = nuevosIds[i];
    if(!controlChecksData.find(x=>x.id===nid)){
      controlChecksData.push({
        id:nid,tipo:'ubicacion',qcOrigenId:raizQCPartida(c)?.id||c.id,
        dia:c.dia,partida:c.partida,invId:c.invId,
        tramos:[{desde:calle,hasta:calle}],calleDesde:calle,calleHasta:calle,
        posManual:claveBase+i+1,creadoEn:new Date().toISOString()
      });
    }
  });
  renderPartidasMapaContent(document.getElementById('partidas-overlay'));
  showToast(`✓ Separada en ${calles.length} calles`);
  const qid = encolarAccionOffline('aplicarSepararPartidaEnCalles', [id, calles, nuevosIds]);
  marcarControlCheckSucio(id);
  nuevosIds.forEach(nid=>marcarControlCheckSucio(nid));
  const ok = await persistControlChecksData();
  if(ok) desencolarAccion(qid); else avisarGuardadoLocalPendiente(leerColaOffline().length);
  return ok;
}
function soltarPartidaEnHueco(event,invId,calle,fila){
  event.preventDefault();event.stopPropagation();
  const id=partidasDragId||event.dataTransfer?.getData('text/plain');
  const indice=partidasDragIndiceCalle;
  partidasSuprimirClickHasta=Date.now()+850;
  terminarArrastrePartida();
  if(id)moverPartidaAHueco(id,invId,calle,fila,indice);
}
// Filas de grid automáticas: inicio compacto y crecimiento sin botón.
function renderPartidasInvHTML(invId){
  const layout = INV_LAYOUT[invId];
  if(!layout) return '';
  const bloques = calcularBloquesPartidasInv(invId);
  const CW=82, ROW_H=32, HDR_H=22;
  // Una única anchura de dibujo para cabeceras, PASILLO y ambas bandas.
  // El scroll horizontal pertenece solo a #partidas-mapa-horizontal;
  // cada celda existe desde el primer render, incluso fuera del viewport.
  const anchoMapa=Math.max(layout.row1.length,layout.row2.length)*CW;
  const anchoBanda=calles=>calles.length*CW;
  function buildSection(calles,alinearArriba){
    if(!calles.length)return '';
    const set=new Set(calles);
    const relevantes=bloques.filter(b=>b.calles.some(c=>set.has(c)));
    // Arrancar con 5 filas por lado y mantener SIEMPRE una fila completa
    // libre junto al pasillo al llegar a la última ocupada. Así el usuario
    // puede soltar una partida más, incluso multicalle, sin botón de ampliar.
    // No modificar las filas guardadas: solo crece el espacio visual.
    // filaManual admite 0…300 (301 posiciones como máximo).
    const maxPos=Math.min(301,Math.max(5,...relevantes.map(b=>b.pos+2)));
    const porFila=new Map();
    relevantes.forEach(b=>{
      if(!porFila.has(b.pos))porFila.set(b.pos,new Map());
      const fila=porFila.get(b.pos);
      b.calles.forEach(c=>{
        if(!set.has(c))return;
        if(fila.has(c)&&fila.get(c)!==b){console.warn('Solape de bloque de partidas',invId,b.pos,c);return;}
        fila.set(c,b);
      });
    });
    const filas=[];
    for(let r=0;r<maxPos;r++){
      const pos=alinearArriba?r:maxPos-1-r;
      const ocupadas=porFila.get(pos)||new Map();
      const celdas=[];let ci=0;
      while(ci<calles.length){
        const calle=calles[ci],bloque=ocupadas.get(calle);
        if(bloque){
          let span=1;
          while(ci+span<calles.length&&ocupadas.get(calles[ci+span])===bloque)span++;
          const segmento=calles.slice(ci,ci+span);
          celdas.push(`<div style="width:${CW*span}px;flex:0 0 ${CW*span}px;padding:2px;height:${ROW_H}px">${renderPartidasBloqueHTML(bloque,segmento,alinearArriba?'arriba':'abajo')}</div>`);
          ci+=span;
        }else{
          const resaltado=partidaSeleccionadaParaMover?'border:1.5px dashed #1558a0;cursor:pointer':'border:1px solid #d4e2f2;';
          celdas.push(`<div data-partidas-hueco="1" data-partidas-inv="${invId}" data-partidas-calle="${calle}" data-partidas-fila="${pos}" data-partidas-lado="${alinearArriba?'arriba':'abajo'}"
            onclick="if(Date.now()>partidasSuprimirClickHasta)clicCeldaVaciaPartidas('${invId}',${calle},${pos})"
            ondragover="event.preventDefault()" ondrop="soltarPartidaEnHueco(event,'${invId}',${calle},${pos})"
            style="width:${CW}px;flex:0 0 ${CW}px;padding:2px;height:${ROW_H}px;cursor:crosshair">
            <div style="height:100%;background:#eef4fb;border-radius:4px;${resaltado}"></div></div>`);
          ci++;
        }
      }
      filas.push(`<div style="display:flex;width:${anchoBanda(calles)}px;min-width:${anchoBanda(calles)}px;height:${ROW_H}px;min-height:${ROW_H}px">${celdas.join('')}</div>`);
    }
    return filas.join('');
  }
  const hdrHTML = (calles) => `<div style="display:flex;width:${anchoMapa}px;min-width:${anchoMapa}px;height:${HDR_H}px;background:#dce8f5">
    ${calles.map(c=>`<div style="width:${CW}px;flex:0 0 ${CW}px;height:${HDR_H}px;border:1px solid #9ab8d8;background:#dce8f5;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#1558a0">${c}</div>`).join('')}
  </div>`;
  return `
    <div style="margin-bottom:2rem">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;flex-wrap:wrap">
        <div style="font-size:14px;font-weight:800;color:var(--text)">${layout.label}</div>
        <button type="button" onclick="toggleModoEspecificoPartidas()" aria-pressed="${partidasEspecificoModo}" title="${partidasEspecificoModo?'Cancelar selección':'Seleccionar partidas para añadir un específico'}" style="display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:32px;padding:6px 10px;font-size:11px;font-weight:800;border-radius:7px;cursor:pointer;border:1px solid #1558a0;background:#1558a0;color:#fff;white-space:nowrap;flex-shrink:0"><i class="ti ${partidasEspecificoModo?'ti-x':'ti-plus'}" aria-hidden="true"></i><span>${partidasEspecificoModo?'Cancelar':'Añadir'}</span></button>
      </div>
      ${partidasEspecificoModo ? `<div style="margin-bottom:8px;font-size:12px;font-weight:700;color:#1a5c2e;background:#eafaf0;border:1px solid #a5d6c2;border-radius:8px;padding:8px 12px">Toca las partidas a las que quieras aplicar el específico.</div>` : ''}
      <div id="partidas-mapa-horizontal" style="width:100%;max-width:100%;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;border:1px solid var(--border);border-radius:10px;background:#fff;padding:8px">
        <div id="partidas-grid-ancho-completo" style="width:${anchoMapa}px;min-width:${anchoMapa}px;background:#fff">
        ${hdrHTML(layout.row1)}
        ${invId==='1A'? `
          <div id="partidas-1a-superior-scroll" aria-label="Filas superiores del invernadero 1A"
            style="width:${anchoBanda(layout.row1)}px;min-width:${anchoBanda(layout.row1)}px;
              height:${5*ROW_H}px;max-height:${5*ROW_H}px;overflow-y:auto;overflow-x:hidden;
              overscroll-behavior-y:contain;-webkit-overflow-scrolling:touch">
            <div style="width:${anchoBanda(layout.row1)}px;min-width:${anchoBanda(layout.row1)}px">${buildSection(layout.row1, true)}</div>
          </div>`:
          `<div style="width:${anchoBanda(layout.row1)}px;min-width:${anchoBanda(layout.row1)}px">${buildSection(layout.row1, true)}</div>`}
        <div style="width:${anchoMapa}px;min-width:${anchoMapa}px;text-align:center;font-size:10px;font-weight:800;color:#fff;background:#4a5568;padding:4px;border-radius:4px;margin:6px 0;letter-spacing:.05em">PASILLO</div>
        <div style="width:${anchoBanda(layout.row2)}px;min-width:${anchoBanda(layout.row2)}px">${buildSection(layout.row2, false)}</div>
        ${hdrHTML(layout.row2)}
        </div>
      </div>
    </div>
    ${partidasEspecificoModo && partidasEspecificoSeleccion.size>0 ? `
      <div style="position:fixed;left:0;right:0;bottom:0;background:#1558a0;color:#fff;padding:.8rem 1.25rem;display:flex;justify-content:space-between;align-items:center;gap:10px;box-shadow:0 -4px 20px rgba(0,0,0,.25);z-index:50">
        <span style="font-size:13px;font-weight:800">${partidasEspecificoSeleccion.size} partida${partidasEspecificoSeleccion.size===1?'':'s'} seleccionada${partidasEspecificoSeleccion.size===1?'':'s'}</span>
        <button onclick="abrirAplicarEspecificoAPartidas()" style="padding:9px 18px;font-size:12px;font-weight:800;background:#fff;color:#1558a0;border:none;border-radius:8px;cursor:pointer">Continuar</button>
      </div>` : ''}`;
}
function toggleModoEspecificoPartidas(){
  partidasEspecificoModo = !partidasEspecificoModo;
  partidasEspecificoSeleccion = new Set();
  renderPartidasMapaContent(document.getElementById('partidas-overlay'));
}
function togglePartidaEnSeleccionEspecifico(id){
  if(partidasEspecificoSeleccion.has(id)) partidasEspecificoSeleccion.delete(id);
  else partidasEspecificoSeleccion.add(id);
  renderPartidasMapaContent(document.getElementById('partidas-overlay'));
}
// A petición de Paula (2026-08-05): pulsar una partida en el mapa debe
// mostrar todo su historial (riegos, plaguicidas, específicos y el propio
// check) desde el día en que entró en su calle. Riego/Fito/Específicos
// comparten la misma forma de datos (data[invId][dia][calle] = texto),
// así que se recorren los mismos días/calles en los tres a la vez.
// Acciones trasladadas desde los botones diminutos del mapa a la ficha.
// No modifica la implementación de movimientos, separación ni persistencia.
function accionPartidaDesdeFicha(id,accion,pos){
  const modal=document.getElementById('partidas-historial-overlay');
  if(accion==='salida' && !confirm('¿Marcar esta partida como salida? Desaparecerá del mapa (se conserva el check de Túnel).')) return;
  if(modal) modal.style.display='none';
  if(accion==='mover'){ seleccionarPartidaParaMover(id); return; }
  if(accion==='posicion'){ cambiarPosicionPartida(id,pos); return; }
  if(accion==='separar'){ separarPartidaEnCalles(id); return; }
  if(accion==='salida'){ aplicarSalidaPartida(id,true); return; }
  if(accion==='recuperar'){ aplicarSalidaPartida(id,false); return; }
}
async function mostrarHistorialPartida(id){
  const original=controlChecksData.find(x=>x.id===id);
  if(!original)return;
  const c=partidaParaPintar(original);
  const idQC=raizQCPartida(original)?.id||id;
  window.__ultimaFichaPartidaId=id;
  // El historial recorre exclusivamente las calles de ESTA partida en su
  // invernadero; Riego y Fito se cargan solo para ese INV. Específicos sigue
  // global hasta su bloque de segmentación propio.
  await Promise.all([
    c.invId ? loadRiegoInvData(c.invId, false) : Promise.resolve(true),
    c.invId ? loadFitoInvData(c.invId, false) : Promise.resolve(true),
    c.invId ? loadEspecificosInvData(c.invId, false) : Promise.resolve(true),
    loadEspecificosPartidaIdsData([...new Set([id,idQC])], false)
  ]);
  const escapar = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const tramos = (c.tramos && c.tramos.length) ? c.tramos : [{desde:c.calleDesde, hasta:c.calleHasta}];
  const calles = [];
  tramos.forEach(t=>{
    if(t.desde==null) return;
    for(let x=Math.min(t.desde,t.hasta==null?t.desde:t.hasta); x<=Math.max(t.desde,t.hasta==null?t.desde:t.hasta); x++) calles.push(x);
  });
  // A petición de Paula (2026-08-06): "tienes que hacerlo teniendo en cuenta
  // su primer día en el INV, es decir su salida de túnel, y ese es su día
  // 1" — c.dia (el día del check de Túnel, cuando se le asignó su calle
  // real) ya es ese día de salida/entrada al invernadero; cada evento del
  // historial muestra ahora también "Día N" contado desde ahí (1 = el
  // propio día de salida), no solo la fecha de calendario.
  const diaDesde = c.dia!=null ? c.dia : riegoDiaDeHoy();
  // Carga (salida): misma partida, mismo Nº de bandejas — igual criterio de
  // desambiguación que calleTramoDeCarga (ver [[lasala_control_carga_filtro_invernadero]]),
  // porque una partida puede tener varias líneas de Carga en invernaderos
  // distintos con el mismo número de partida. Se calcula AQUÍ (antes de
  // recorrer el historial) porque hace falta para topar hasta qué día
  // contar — ver comentario de diaHasta más abajo.
  const cargaSalida = controlChecksData.find(x=>x.tipo==='carga' && x.partida===c.partida && x.numBandejas===c.numBandejas)
    || controlChecksData.find(x=>x.tipo==='carga' && x.partida===c.partida);
  // Bug real corregido 2026-09-16 (a petición de Vigueras): antes se
  // contaba SIEMPRE hasta diaDesde+90, sin mirar si la partida ya tenía
  // parte de carga real (o un "Marcar salida" manual) — el resumen de
  // riego/plaguicidas/específicos seguía sumando días de DESPUÉS de que la
  // partida ya se hubiera ido de su calle, dando un total incorrecto.
  // Mismo criterio que ya usa partidaVisibleEnSemana para el mapa: con
  // parte de carga real, el tope es el día ANTERIOR a la salida (ese día ya
  // no es suyo); si no hay parte de carga pero sí "Marcar salida" manual,
  // se topa en el primer día de esa semana.
  let diaHasta = diaDesde + 90;
  if(cargaSalida){
    diaHasta = cargaSalida.dia - 1;
  } else if(c.salioDesdeSemanaNumerada !== null && c.salioDesdeSemanaNumerada !== undefined){
    const inicioSemanaSalida = new Date(PARTIDAS_ANCHOR_DATE); inicioSemanaSalida.setHours(0,0,0,0);
    inicioSemanaSalida.setDate(inicioSemanaSalida.getDate() + c.salioDesdeSemanaNumerada*7);
    diaHasta = 15 + Math.round((inicioSemanaSalida - RIEGO_ANCHOR_DATE) / 86400000) - 1;
  }
  // A petición de Paula (2026-08-18): "no quiero que aparezcan las calles,
  // solo los días con lo que ha llevado" — antes salía una línea POR CADA
  // calle de la partida (normalmente lo mismo repetido varias veces); ahora
  // se agrupa por día+tipo+texto y solo se muestra una vez, aunque varias
  // calles de la partida hayan llevado lo mismo ese día.
  const eventosVistos = new Set();
  const eventos = [];
  if(c.invId && calles.length){
    for(let dia=diaDesde; dia<=diaHasta; dia++){
      calles.forEach(calle=>{
        const r = getRiego(c.invId, dia, calle);
        if(r){ const k=`${dia}|Riego|${r}`; if(!eventosVistos.has(k)){ eventosVistos.add(k); eventos.push({dia, tipo:'Riego', color:'#1558a0', texto:r}); } }
        const f = getFito(c.invId, dia, calle);
        if(f){ const k=`${dia}|Plaguicidas|${f}`; if(!eventosVistos.has(k)){ eventosVistos.add(k); eventos.push({dia, tipo:'Plaguicidas', color:'#c47f00', texto:f}); } }
        const e = getEspecifico(c.invId, dia, calle);
        if(e){ const k=`${dia}|Específicos|${e}`; if(!eventosVistos.has(k)){ eventosVistos.add(k); eventos.push({dia, tipo:'Específicos', color:'#1a5c2e', texto:e}); } }
      });
    }
  }
  eventos.sort((a,b)=> a.dia-b.dia);
  // El número ya aparece en la cabecera de la ficha. Omitir solo la
  // referencia redundante de ESTA partida en los eventos Específicos.
  const etiquetaPropiaEspecifico=c.partida?' — PARTIDA '+String(c.partida).trim():'';
  const textoEspecificoVisibleEnFicha=texto=>String(texto||'').split(' | ').map(parte=>
    etiquetaPropiaEspecifico && parte.trimEnd().toUpperCase().endsWith(etiquetaPropiaEspecifico.toUpperCase())
      ? parte.trimEnd().slice(0,-etiquetaPropiaEspecifico.length) : parte
  ).join(' | ');
  const eventosHTML = eventos.length ? eventos.map(ev=>`
    <div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="width:78px;flex-shrink:0">
        <div style="font-size:11px;font-weight:800;color:#0f5c4a">Día ${ev.dia-diaDesde+1}</div>
        <div style="font-size:10px;color:var(--muted)">${escapar(riegoDiaLabelCorto(ev.dia))}</div>
      </div>
      <div style="width:74px;flex-shrink:0;font-size:10px;font-weight:800;color:#fff;background:${ev.color};border-radius:999px;padding:2px 8px;text-align:center">${ev.tipo}</div>
      <div style="font-size:12px;color:var(--text)">${escapar(ev.tipo==='Específicos'?textoEspecificoVisibleEnFicha(ev.texto):ev.texto)}</div>
    </div>`).join('') : `<div style="text-align:center;padding:2rem;color:var(--muted);font-style:italic;font-size:13px">Sin riegos, plaguicidas ni específicos registrados en sus calles desde que entró.</div>`;
  const tipoPlanta = detectarTipoPlantaPartida(c.clienteVariedad);
  // A petición de Paula, 2026-08-10: "quiero que se vea toda la información
  // que exista" del check de entrada (Túnel, esta misma línea `c`) y del de
  // salida (Carga, si ya se le ha hecho parte) — antes solo se veía la
  // observación del Túnel, ninguna de las categorías marcadas (Color/
  // Tamaño/Sanidad/Flores/Raíces) ni nada de Carga.
  const resumenCategoriasHTML = ch => CONTROL_CHECK_CATEGORIAS.map(cat=>{
    const marcadas = cat.opciones.filter(o=>ch[cat.key]?.[o.key]).map(o=>o.label);
    if(!marcadas.length) return '';
    let extra = '';
    if(cat.key==='sanidad' && ch.sanidad?.enferma && ch.sanidadEnfermedades){
      const enf = SANIDAD_ENFERMEDADES.filter(e=>ch.sanidadEnfermedades[e.key]).map(e=>e.label);
      if(enf.length) extra = ' — '+enf.join(', ');
    }
    return `<span style="font-size:11px;font-weight:700;background:#f0f4f8;color:#1558a0;border-radius:999px;padding:3px 10px;margin-right:6px;margin-bottom:6px;display:inline-block">${escapar(cat.label)}: ${escapar(marcadas.join(', ')+extra)}</span>`;
  }).filter(Boolean).join('') || '<span style="font-style:italic;color:var(--muted);font-size:12px">Sin categorías marcadas</span>';
  // Fotos asociadas (Check de entrada y, si existe, Check de salida) — se
  // pide solo la foto de estos 1-2 ids concretos (fetchFotoPartidaPorId),
  // nunca los 29 shards completos de fotos de toda la app.
  const idsFotoBuscados = [
    {id:idQC, label:'Entrada (Túnel)'},
    cargaSalida ? {id:cargaSalida.id, label:'Salida (Carga)'} : null
  ].filter(Boolean);
  const fotosPartida = (await Promise.all(idsFotoBuscados.map(async ({id:fid,label})=>{
    const entry = await fetchFotoPartidaPorId(fid);
    return entry ? {id:fid, src:fotoSrcMiniatura(entry), label} : null;
  }))).filter(Boolean);
  const fotosHTML = fotosPartida.length ? `
        <div style="font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">Fotos</div>
        <div style="display:flex;gap:10px;margin-bottom:1.25rem;flex-wrap:wrap">
          ${fotosPartida.map(f=>`
            <div style="text-align:center">
              <img src="${f.src}" onclick="mostrarFotoControlAmpliada('${f.id}')" style="max-height:90px;border-radius:8px;border:1px solid var(--border);cursor:pointer;display:block" title="Ver foto">
              <div style="font-size:10px;color:var(--muted);margin-top:3px">${escapar(f.label)}</div>
            </div>`).join('')}
        </div>` : '';
  // Datos que antes ocupaban espacio dentro del mapa: calles, tipo de
  // planta, entrega, bandejas, tratamientos y operaciones sobre ubicación.
  const ubicacion = c.invId && calles.length ? formatCallesConEnteroParaImprimir(c.invId, calles) : 'Sin calles asignadas';
  const enMapaActual = c.invId===partidasInvSel && partidaVisibleEnSemana(c, partidasSemanaOffset);
  const bloqueEnMapa = enMapaActual ? calcularBloquesPartidasInv(c.invId).find(b=>b.entry.id===c.id) : null;
  const primerTramo = tramos[0];
  const separable = !!bloqueEnMapa && primerTramo?.desde!=null &&
    Math.abs((primerTramo.hasta??primerTramo.desde)-primerTramo.desde)>=1;
  const salidaManual = c.salioDesdeSemanaNumerada!==null && c.salioDesdeSemanaNumerada!==undefined;
  const vistos = new Set();
  const especificosFicha = [...new Set([id,idQC])].flatMap(partidaId=>(especificosPartidaData[partidaId]||[]).map((e,idx)=>({e,idx,partidaId}))).filter(({e})=>{
    const key = [e.fechaISO,e.trat,e.dosis,e.horario].join('|');
    if(vistos.has(key)) return false;
    vistos.add(key); return true;
  });
  const especificosFichaHTML = especificosFicha.length ? `
    <div style="font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;margin:12px 0 8px">Específicos asociados</div>
    <div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:16px">
      ${especificosFicha.map(({e,idx,partidaId})=>`<button type="button" onclick="editarEspecificoPartidaBanner('${partidaId}',${idx})"
        title="Editar específico" style="padding:7px 10px;font-size:11px;font-weight:700;background:#ffe2ed;color:#6b1742;border:1px solid #e8a3c1;border-radius:7px;cursor:pointer">${escapar(e.trat)} ${escapar(e.dosis)} · ${escapar(e.fechaLabel)}</button>`).join('')}
    </div>` : '';
  // Sólo operaciones administrativas en el pie. Los movimientos de orden se
  // realizan mediante el drag táctil validado, no mediante prompts duplicados.
  const ubicacionesRelacionadas=[raizQCPartida(original),...otrasUbicacionesPartida(idQC)].filter(Boolean);
  const ubicacionesHTML=ubicacionesRelacionadas.length
    ? '<section style="background:#fff;border:1px solid #c7d8ee;border-radius:9px;padding:10px 12px;flex-shrink:0">'+
      '<div style="font-size:11px;font-weight:800;color:#1558a0;margin-bottom:6px">UBICACIONES DE LA PARTIDA</div>'+
      ubicacionesRelacionadas.map(u=>'<div style="font-size:12px;margin:5px 0">INV '+escapar(u.invId)+' · '+
        escapar(formatTramosLabel(u.invId,u.tramos||[]))+'</div>').join('')+'</section>':'';
  const historialUbicaciones=raizQCPartida(original)?.historialUbicaciones||[];
  const historialUbicacionesHTML=historialUbicaciones.length
    ? '<details style="flex-shrink:0;background:#fff;border:1px solid #c7d8ee;border-radius:9px;padding:10px 12px">'+
      '<summary style="font-size:11px;font-weight:800;color:#1558a0;cursor:pointer">Historial de ubicaciones ('+historialUbicaciones.length+')</summary>'+
      historialUbicaciones.slice().reverse().map(h=>'<div style="font-size:11px;border-top:1px solid #e4eaf2;margin-top:7px;padding-top:7px">'+
        '<b>'+escapar(String(h.fecha||'').slice(0,16).replace('T',' '))+'</b> · '+escapar(h.usuario||'')+
        '<div>'+escapar((h.antes||[]).map(g=>'INV '+g.invId+' · '+formatTramosLabel(g.invId,g.tramos||[])).join('; ')||'—')+' → '+
        escapar((h.despues||[]).map(g=>'INV '+g.invId+' · '+formatTramosLabel(g.invId,g.tramos||[])).join('; '))+'</div></div>').join('')+'</details>':'';
  const accionesFichaHTML = `
    <button type="button" onclick="mostrarAsignarCalleControl('${c.id}')" style="min-height:40px;flex:1 1 138px;display:flex;justify-content:center;align-items:center;gap:6px;padding:9px 11px;border-radius:7px;font-size:12px;font-weight:800;color:#fff;cursor:pointer;background:#1558a0;border:1px solid #1558a0" title="Cambiar invernadero y calles">
      <i class="ti ti-map-pin" aria-hidden="true"></i> Editar ubicación
    </button>
    ${separable?`<button type="button" onclick="accionPartidaDesdeFicha('${c.id}','separar')" style="min-height:40px;flex:1 1 138px;display:flex;justify-content:center;align-items:center;gap:6px;padding:9px 11px;border-radius:7px;font-size:12px;font-weight:800;color:#fff;cursor:pointer;background:#1558a0;border:1px solid #1558a0" title="Separar calles">
      <i class="ti ti-cut" aria-hidden="true"></i> Separar calles</button>`:''}
    ${salidaManual
      ? `<button type="button" onclick="accionPartidaDesdeFicha('${c.id}','recuperar')" style="min-height:40px;flex:1 1 138px;display:flex;justify-content:center;align-items:center;gap:6px;padding:9px 11px;border-radius:7px;font-size:12px;font-weight:800;color:#fff;cursor:pointer;background:#1558a0;border:1px solid #1558a0">Recuperar partida</button>`
      : (enMapaActual?`<button type="button" onclick="accionPartidaDesdeFicha('${c.id}','salida')" style="min-height:40px;flex:1 1 138px;display:flex;justify-content:center;align-items:center;gap:6px;padding:9px 11px;border-radius:7px;font-size:12px;font-weight:800;color:#fff;cursor:pointer;background:#b42332;border:1px solid #b42332">Marcar salida</button>`:'')}
  `;
  window.__partidaHistorialActual = { c, cargaSalida, eventos, resumenCategoriasHTML, tipoPlanta, diaDesde, fotosPartida };
  const mo = getOrCreateOverlay('partidas-historial-overlay');
  mo.style.padding = '0';
  mo.style.alignItems = 'center';
  mo.style.justifyContent = 'center';
  mo.innerHTML = `
    <div style="width:100%;max-width:680px;height:100vh;height:100dvh;max-height:790px;min-height:0;background:#fff;display:flex;flex-direction:column;overflow:hidden;border-radius:10px;box-shadow:0 8px 40px rgba(0,0,0,.3)">
      <div style="background:linear-gradient(120deg,#1558a0,#2678bc);color:#fff;padding:10px 12px;display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-shrink:0">
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:800;line-height:1.3">Detalle de partida</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          <button type="button" onclick="imprimirHistorialPartida()" title="Imprimir ficha" aria-label="Imprimir ficha"
            style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:#1558a0;border:1px solid rgba(255,255,255,.5);color:#fff;border-radius:7px;cursor:pointer"><i class="ti ti-printer" style="font-size:18px" aria-hidden="true"></i></button>
          <button type="button" onclick="document.getElementById('partidas-historial-overlay').style.display='none'" title="Cerrar ficha" aria-label="Cerrar ficha"
            style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:#1558a0;border:1px solid rgba(255,255,255,.5);color:#fff;border-radius:7px;cursor:pointer"><i class="ti ti-x" style="font-size:20px" aria-hidden="true"></i></button>
        </div>
      </div>
      <div id="partidas-ficha-scroll" style="flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;background:#f5f7fb;padding:12px;display:flex;flex-direction:column;gap:10px">
        <section style="background:#fff;border:1px solid #c7d8ee;border-radius:9px;padding:12px;flex-shrink:0">
          <div style="padding-bottom:12px;margin-bottom:12px;border-bottom:1px solid #dce5ef">
            <div style="font-size:10px;font-weight:800;letter-spacing:.04em;color:#52657d;margin-bottom:3px">N.º PARTIDA</div>
            <div style="font-size:20px;font-weight:900;line-height:1.2;color:#1558a0;overflow-wrap:anywhere">${escapar(c.partida)||'— Sin partida —'}</div>
            <div style="font-size:10px;color:var(--muted);margin:11px 0 3px">Cliente / variedad</div>
            <div style="font-size:13px;font-weight:750;color:var(--text);line-height:1.4;overflow-wrap:anywhere">${escapar(c.clienteVariedad)||'—'}</div>
          </div>
          <div style="font-size:11px;font-weight:800;letter-spacing:.03em;color:#1558a0;margin-bottom:10px">DATOS GENERALES</div>
          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px;font-size:12px;color:var(--text)">
            <div style="min-width:0"><div style="font-size:10px;color:var(--muted);margin-bottom:2px">Sala / Invernadero</div><b>Sala ${escapar((salaDeInv(c.invId)||'').replace('sala',''))} · INV ${escapar(c.invId)||'—'}</b></div>
            <div><div style="font-size:10px;color:var(--muted);margin-bottom:2px">Bandejas</div><b>${c.numBandejas!=null&&c.numBandejas!==''?escapar(c.numBandejas):'—'}</b></div>
            <div style="min-width:0;grid-column:1 / -1"><div style="font-size:10px;color:var(--muted);margin-bottom:2px">Ubicación / Calles</div><b style="overflow-wrap:anywhere">${escapar(ubicacion)}</b></div>
            <div><div style="font-size:10px;color:var(--muted);margin-bottom:2px">Entrada a invernadero</div><b>${escapar(riegoDiaLabelCorto(diaDesde))}</b></div>
            <div><div style="font-size:10px;color:var(--muted);margin-bottom:2px">Entrega prevista</div><b>${c.fentrega?escapar(c.fentrega):'—'}</b></div>
            ${tipoPlanta?`<div style="grid-column:1 / -1"><div style="font-size:10px;color:var(--muted);margin-bottom:2px">Tipo de planta</div><b>${escapar(tipoPlanta)}</b></div>`:''}
          </div>
        </section>
        ${ubicacionesHTML}
        ${historialUbicacionesHTML}
        <div style="font-size:11px;font-weight:800;letter-spacing:.03em;color:#1558a0;padding:3px 1px 0">CONTROL DE CALIDAD</div>
        <details style="flex-shrink:0;border:1px solid #c7d8ee;border-radius:9px;background:#fff;overflow:hidden">
 <summary style="display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px;padding:10px 12px;list-style:none;cursor:pointer;background:#e8f0fb;color:#1558a0;font-size:13px;font-weight:800">
   <span><i class="ti ti-clipboard-check" aria-hidden="true"></i> Túnel — Entrada</span><span style="font-size:11px;font-weight:600;white-space:nowrap">${escapar(riegoDiaLabelCorto(c.dia))}</span>
 </summary>
 <div style="border-top:1px solid #c7d8ee;padding:12px"><div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">${resumenCategoriasHTML(c)}</div>
<div style="font-size:11px;color:var(--muted);font-weight:700;margin-bottom:4px">Observaciones</div>
<div style="font-size:12px;overflow-wrap:anywhere">${c.observaciones?escapar(c.observaciones):'<span style="font-style:italic;color:var(--muted)">Sin observaciones</span>'}</div></div>
</details>
        <details style="flex-shrink:0;border:1px solid #c7d8ee;border-radius:9px;background:#fff;overflow:hidden">
 <summary style="display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px;padding:10px 12px;list-style:none;cursor:pointer;background:#e8f0fb;color:#1558a0;font-size:13px;font-weight:800">
   <span><i class="ti ti-truck-loading" aria-hidden="true"></i> Carga — Salida</span><span style="font-size:11px;font-weight:600;white-space:nowrap">${cargaSalida?escapar(riegoDiaLabelCorto(cargaSalida.dia)):'Sin parte'}</span>
 </summary>
 <div style="border-top:1px solid #c7d8ee;padding:12px">
${cargaSalida?`
  <div style="font-size:12px;margin-bottom:9px">
    ${cargaSalida.cliente?`<b>Cliente:</b> ${escapar(cargaSalida.cliente)} · `:''}
    ${cargaSalida.variedad?`<b>Variedad:</b> ${escapar(cargaSalida.variedad)}`:''}
    ${cargaSalida.numBandejas?` · <b>Bandejas:</b> ${escapar(cargaSalida.numBandejas)}`:''}
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">${resumenCategoriasHTML(cargaSalida)}</div>
  <div style="font-size:11px;color:var(--muted);font-weight:700;margin-bottom:4px">Observaciones</div>
  <div style="font-size:12px;overflow-wrap:anywhere">${cargaSalida.observaciones?escapar(cargaSalida.observaciones):'<span style="font-style:italic;color:var(--muted)">Sin observaciones</span>'}</div>
`:'<span style="font-size:12px;color:var(--muted)">Todavía no existe un parte de Carga asociado.</span>'}</div>
</details>
        <details style="flex-shrink:0;border:1px solid #c7d8ee;border-radius:9px;background:#fff;overflow:hidden">
 <summary style="display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px;padding:10px 12px;list-style:none;cursor:pointer;background:#e8f0fb;color:#1558a0;font-size:13px;font-weight:800">
   <span><i class="ti ti-history" aria-hidden="true"></i> Tratamientos y seguimiento</span><span style="font-size:11px;font-weight:600;white-space:nowrap">${eventos.length} registro${eventos.length===1?'':'s'}</span>
 </summary>
 <div style="border-top:1px solid #c7d8ee;padding:12px">${especificosFichaHTML}${eventosHTML}</div>
</details>
        <details style="flex-shrink:0;border:1px solid #c7d8ee;border-radius:9px;background:#fff;overflow:hidden">
 <summary style="display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px;padding:10px 12px;list-style:none;cursor:pointer;background:#e8f0fb;color:#1558a0;font-size:13px;font-weight:800">
   <span><i class="ti ti-photo" aria-hidden="true"></i> Fotografías históricas</span><span style="font-size:11px;font-weight:600;white-space:nowrap">${fotosPartida.length} foto${fotosPartida.length===1?'':'s'}</span>
 </summary>
 <div style="border-top:1px solid #c7d8ee;padding:12px">${fotosPartida.length?fotosHTML:'<span style="font-size:12px;color:var(--muted)">Sin fotografías históricas vinculadas.</span>'}</div>
</details>
      </div>
      <div style="flex-shrink:0;background:#fff;border-top:1px solid #c7d8ee;padding:9px 12px max(9px,env(safe-area-inset-bottom))">
        <div style="font-size:10px;font-weight:800;letter-spacing:.03em;color:#1558a0;margin-bottom:7px">GESTIÓN DE LA PARTIDA</div>
        <div style="display:flex;gap:7px;flex-wrap:wrap;align-items:stretch">${accionesFichaHTML}</div>
      </div>
    </div>`;
  mo.style.display = 'flex';
}
// Imprime el resumen de la partida (fotos + historial) que se ve en
// mostrarHistorialPartida — a petición de Paula. Reutiliza los datos ya
// calculados en window.__partidaHistorialActual en vez de recalcularlos.
function imprimirHistorialPartida(){
  const datos = window.__partidaHistorialActual;
  if(!datos) return;
  const { c, cargaSalida, eventos, resumenCategoriasHTML, tipoPlanta, diaDesde, fotosPartida } = datos;
  const escapar = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const eventosHTML = eventos.length ? eventos.map(ev=>`
    <tr>
      <td>Día ${ev.dia-diaDesde+1} · ${escapar(riegoDiaLabelCorto(ev.dia))}</td>
      <td>${escapar(ev.tipo)}</td>
      <td>${escapar(ev.texto)}</td>
    </tr>`).join('') : `<tr><td colspan="3" style="font-style:italic;color:#888">Sin riegos, plaguicidas ni específicos registrados en sus calles desde que entró.</td></tr>`;
  const fotosHTML = fotosPartida.length ? `
    <h3>Fotos</h3>
    <div style="display:flex;gap:14px;margin-bottom:14px">
      ${fotosPartida.map(f=>`<div style="text-align:center"><img src="${f.src}" style="max-height:160px;border-radius:6px;border:1px solid #ccc;display:block"><div style="font-size:9px;color:#666;margin-top:3px">${escapar(f.label)}</div></div>`).join('')}
    </div>` : '';
  let iframe = document.getElementById('print-partida-historial-iframe');
  if(!iframe){
    iframe = document.createElement('iframe');
    iframe.id = 'print-partida-historial-iframe';
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none';
    document.body.appendChild(iframe);
  }
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapar(c.partida)||'Partida'}</title>
    <style>
      body{font-family:'Montserrat',Arial,Helvetica,sans-serif;font-weight:300;font-size:10pt;color:#1a1e18;padding:20px}
      .cabecera{display:flex;align-items:center;gap:14px;margin-bottom:16px;border-bottom:2px solid #0f5c4a;padding-bottom:10px}
      .cabecera img{height:52px}
      h1{font-size:15pt;margin:0}
      h3{font-size:10.5pt;text-transform:uppercase;color:#555;margin:16px 0 6px}
      table{width:100%;border-collapse:collapse;font-size:10pt}
      th,td{padding:6px 8px;border-bottom:1px solid #ccc;text-align:left;vertical-align:top}
      th{font-size:9pt;text-transform:uppercase;color:#555}
      .meta{font-size:9pt;color:#555;margin-bottom:2px}
    </style></head><body>
      <div class="cabecera">
        <img src="assets/logo-la-sala.png">
        <div>
          <h1>${escapar(c.partida)||'— Sin partida —'}</h1>
          <div class="meta">${escapar(c.clienteVariedad)||''}${tipoPlanta?' · '+escapar(tipoPlanta):''}</div>
        </div>
      </div>
      <div class="meta">${c.fentrega?`Entrega ${escapar(c.fentrega)} · `:''}INV ${escapar(c.invId)||'—'} · Día 1 (salida de Túnel): ${escapar(riegoDiaLabelCorto(diaDesde))}</div>
      <h3>Check de entrada (Túnel) — ${escapar(riegoDiaLabelCorto(c.dia))}${c.numBandejas?' · Nº bandejas: '+escapar(c.numBandejas):''}</h3>
      <div>${c.observaciones ? escapar(c.observaciones) : 'Sin observaciones'}</div>
      <h3>Check de salida (Carga)${cargaSalida?' — '+escapar(riegoDiaLabelCorto(cargaSalida.dia)):''}</h3>
      <div>${cargaSalida ? (cargaSalida.observaciones ? escapar(cargaSalida.observaciones) : 'Sin observaciones') : 'Todavía no tiene parte de carga.'}</div>
      ${fotosHTML}
      <h3>Historial de riegos, plaguicidas y específicos</h3>
      <table><tr><th>Día</th><th>Tipo</th><th>Detalle</th></tr>${eventosHTML}</table>
    </body></html>`);
  doc.close();
  setTimeout(()=>{ iframe.contentWindow.focus(); iframe.contentWindow.print(); }, 250);
}
function marcarSalidaPartida(id){
  if(!confirm('¿Marcar esta partida como salida? Desaparecerá del mapa de calles (el check de Túnel no se borra).')) return;
  aplicarSalidaPartida(id, true);
}
async function aplicarSalidaPartida(id, valor){
  const c = controlChecksData.find(x=>x.id===id);
  if(!c) return;
  // Marcar como salida desde la semana actual en adelante.
  // Usa c.salioDesdeSemanaNumerada (la semana a partir de la cual sale del mapa)
  // en lugar de un simple booleano, para que aparezca en semanas anteriores.
  // IMPORTANTE: se guarda la semana ABSOLUTA (calculada desde fecha), no el offset relativo,
  // porque partidasSemanaOffset varía cada vez que se abre la app.
  if(valor){
    c.salioDesdeSemanaNumerada = partidasSemanaOffsetActual();
  } else {
    c.salioDesdeSemanaNumerada = null;
  }
  renderPartidasMapaContent(document.getElementById('partidas-overlay'));
  const qid = encolarAccionOffline('aplicarSalidaPartida', [id, valor]);
  marcarControlCheckSucio(id);
  const ok = await persistControlChecksData();
  if(ok) desencolarAccion(qid); else avisarGuardadoLocalPendiente(leerColaOffline().length);
  return ok;
}
async function recuperarPartidaPorId(){
  // Las partidas del mapa son líneas de Check Túnel. Desde la carga por
  // shards, controlChecksData puede contener solo una quincena aunque no esté
  // vacío; por eso aquí se fuerza Túnel completo y fresco antes de listar.
  const tunelOk = await loadControlTipoCompleto('tunel');
  if(!tunelOk){ avisarFalloCarga(); return; }

  // Solo una línea de Túnel puede haberse marcado como salida desde este mapa.
  const salidas = controlChecksData.filter(c=>
    c.tipo==='tunel' &&
    c.salioDesdeSemanaNumerada !== null &&
    c.salioDesdeSemanaNumerada !== undefined
  );

  if(!salidas.length){
    showToast('ℹ️ No hay partidas marcadas como salida');
    return;
  }

  // Mostrar listado
  const lista = salidas.map((c,i)=>`${i+1}. ${c.id} (${c.partida || '—'}) - INV ${c.invId}`).join('\n');
  const idx = prompt(`Partidas marcadas como salida:\n\n${lista}\n\nIngresa el número a recuperar:`, '');
  if(!idx) return;

  const num = parseInt(idx, 10);
  if(isNaN(num) || num < 1 || num > salidas.length){
    showToast('❌ Número inválido');
    return;
  }

  const c = salidas[num-1];
  c.salioDesdeSemanaNumerada = null;
  renderPartidasMapaContent(document.getElementById('partidas-overlay'));
  marcarControlCheckSucio(c.id);
  await persistControlChecksData();
  showToast(`✓ Partida ${c.id} recuperada`);
}

// ════════════════════════════════════════════════════════════════
