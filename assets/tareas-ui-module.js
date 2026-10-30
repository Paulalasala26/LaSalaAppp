// Interfaz de Tareas y tablero de Mantenimiento. Se carga al entrar en esas vistas.
// ── Tablero kanban de Mantenimiento de Parcelas ─────────────────
// Agrupa los 4 estados internos de mantenimiento en los mismos 3 niveles
// que usa el resto de Tareas (a petición de Paula, 2026-08-12: "el mismo
// formato que el resto de apartados") — sin_asignar/asignado siguen siendo
// estados internos distintos (para el "marcar personas en todas"), pero
// visualmente se muestran juntos como "Pendiente".
const MANT_NIVELES_COLGANDO = [
  {key:'pendiente', label:'Pendiente', badge:'⏳ Pendiente', estados:['sin_asignar','asignado'], color:'#c47f00', bg:'#fff8e1'},
  {key:'en_proceso', label:'En proceso', badge:'▶ En proceso', estados:['en_proceso'], color:'#1558a0', bg:'#eef4fb'},
  {key:'completada', label:'Completada', badge:'✓ Completada', estados:['cerrado'], color:'#1a5c2e', bg:'#eafaf0'}
];

let mantBusquedaActual='', mantEstadoActual='todos';
function mantHTML(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function mantInvTicket(t){const m=/\bINV\s+([^\s)]+)/i.exec(String(t.titulo||''));return m?m[1]:'';}
function cambiarBusquedaMantenimiento(input){
  const pos=input.selectionStart;
  mantBusquedaActual=input.value;
  renderTareasContent(document.getElementById('tareas-overlay'),true);
  const nuevo=document.getElementById('mant-buscar');
  if(nuevo){nuevo.focus();try{nuevo.setSelectionRange(pos,pos)}catch(e){}}
}
function filtrarEstadoMantenimiento(valor){
  mantEstadoActual=['todos','pendiente','en_proceso'].includes(valor)?valor:'todos';
  renderTareasContent(document.getElementById('tareas-overlay'),true);
}
function actualizarNuevoTicketMantenimiento(){
  const marcados=Array.from(document.querySelectorAll('.nm-inv-chk:checked'));
  const resumen=document.getElementById('nm-cuenta-inv');
  if(resumen)resumen.textContent=marcados.length+' invernadero'+(marcados.length===1?'':'s')+' seleccionado'+(marcados.length===1?'':'s');
  document.querySelectorAll('[data-mant-sala-count]').forEach(el=>{
    const n=marcados.filter(ch=>ch.dataset.sala===el.dataset.mantSalaCount).length;
    el.textContent=n?(' · '+n+' seleccionado'+(n===1?'':'s')):'';
  });
  const btn=document.getElementById('nm-btn-crear');
  if(btn)btn.disabled=!nmTrabajoBulkSel||marcados.length===0;
}
function renderMantenimientoColgandoHTML(){
  const activos=mantenimientoData.filter(t=>!ticketMantenimientoArchivado(t)&&t.estado!=='cerrado');
  const cuenta=(estados)=>activos.filter(t=>estados.includes(t.estado)).length;
  const buscar=mantBusquedaActual.toLocaleLowerCase('es').trim();
  const visibles=activos.filter(t=>{
    if(mantEstadoActual!=='todos'){
      const estadoGrupo=['sin_asignar','asignado'].includes(t.estado)?'pendiente':t.estado;
      if(estadoGrupo!==mantEstadoActual)return false;
    }
    if(!buscar)return true;
    return [t.titulo,t.descripcion,mantInvTicket(t),t.fechaProgramada,(t.asignados||[]).join(' '),t.prioridad].join(' ').toLocaleLowerCase('es').includes(buscar);
  });
  const grupos=[
    {estados:['sin_asignar','asignado'],titulo:'Pendientes',nombre:'pendiente',icon:'ti-clock'},
    {estados:['en_proceso'],titulo:'En curso',nombre:'curso',icon:'ti-player-play'}
  ];
  const bloques=grupos.map(g=>{
    const items=visibles.filter(t=>g.estados.includes(t.estado));
    if(!items.length)return '';
    return `<section class="mant-grupo">
      <div class="mant-grupo-cab"><h3><i class="ti ${g.icon}"></i> ${g.titulo}</h3><span>${items.length}</span></div>
      <div class="mant-grid">${items.map(t=>buildTarjetaMantenimiento(t,t.estado==='sin_asignar')).join('')}</div>
    </section>`;
  }).join('');

  return `<div class="mant-ui">
    <div class="mant-cabecera">
      <div><h2>Mantenimiento</h2><div class="mant-resumen">${activos.length} tickets activos</div></div>
      <button type="button" class="mant-btn mant-btn-principal" onclick="showNuevoTicketMantenimientoForm()"><i class="ti ti-plus"></i> Nuevo ticket</button>
    </div>
    <div id="nuevo-ticket-mant-wrap"></div>
    <div class="mant-herramientas">
      <input id="mant-buscar" type="search" aria-label="Buscar en mantenimiento" placeholder="Buscar ticket, invernadero, operario…" value="${mantHTML(mantBusquedaActual)}" oninput="cambiarBusquedaMantenimiento(this)">
      <select aria-label="Filtrar por estado" onchange="filtrarEstadoMantenimiento(this.value)">
        <option value="todos" ${mantEstadoActual==='todos'?'selected':''}>Todos (${activos.length})</option>
        <option value="pendiente" ${mantEstadoActual==='pendiente'?'selected':''}>Pendientes (${cuenta(['sin_asignar','asignado'])})</option>
        <option value="en_proceso" ${mantEstadoActual==='en_proceso'?'selected':''}>En curso (${cuenta(['en_proceso'])})</option>
      </select>
    </div>
    ${bloques||'<div class="mant-vacio">No hay tickets activos para este filtro.</div>'}
  </div>`;
}
// Tarjeta de un ticket: arrastrable (ratón, escritorio) + un desplegable
// "Mover a..." como alternativa para pantallas táctiles, donde arrastrar y
// soltar nativo del navegador no funciona. mostrarAsignarPersonas solo se ve
// en la columna "Sin asignar" (ver patrón "marcar en todas"/"confirmar
// todas" de la guía de referencia).
// A petición de Paula: al cerrarse un ticket de mantenimiento se muestra
// cuánto ha tardado (horaFinTs - horaInicioTs, puestos por iniciarMantenimientoPeon
// / completarMantenimientoPeon). Formato corto: "45 min" o "1h 23min".
function buildTarjetaMantenimiento(t, mostrarAsignarPersonas){
  const id=mantHTML(t.id);
  const rec=t.recurrencia?'Cada '+mantHTML(t.recurrencia.cada)+' '+mantHTML((MANT_RECUR_UNIDADES.find(u=>u.key===t.recurrencia.unidad)||{}).label||t.recurrencia.unidad).toLowerCase()+(t.proximaFecha?' · próxima '+mantHTML(t.proximaFecha):''):'';
  const estado={sin_asignar:'Sin asignar',asignado:'Asignado',en_proceso:'En curso',cerrado:'Completado'}[t.estado]||t.estado;
  const badgeClass={sin_asignar:'pendiente',asignado:'asignado',en_proceso:'curso',cerrado:'completo'}[t.estado]||'pendiente';
  const personas=(t.asignados||[]).length?mantHTML(t.asignados.join(', ')):'Sin asignar';
  // Listbox único para asignar o reasignar un ticket, según su estado. Solo PEÓN puede ejecutarlo.
  const puedeAsignar=t.estado==='sin_asignar', puedeReasignar=t.estado==='asignado';
  const responsableActual=(t.asignados||[])[0]||'';
  const personalElegible=Object.keys(USER_ROLES).filter(u=>USER_ROLES[u]==='PEON');
  const selector=(puedeAsignar||puedeReasignar)?`
    <div class="mant-asignacion-simple">
      <select aria-label="${puedeReasignar?'Nuevo responsable':'Operario'} para ${mantHTML(t.titulo)}"
        class="mant-asignado-select" data-ticket="${id}">
        <option value="" ${!puedeReasignar?'selected':''}>${puedeReasignar?'Sin asignar':'Seleccionar operario…'}</option>
        ${personalElegible.map(u=>`<option value="${mantHTML(u)}" ${responsableActual===u?'selected':''}>${mantHTML(u)}</option>`).join('')}
        ${puedeReasignar&&responsableActual&&!personalElegible.includes(responsableActual)?`<option value="${mantHTML(responsableActual)}" selected>${mantHTML(responsableActual)} · anterior</option>`:''}
      </select>
      <button type="button" class="mant-btn ${puedeReasignar?'mant-btn-secundario':'mant-btn-principal'}"
        onclick="${puedeReasignar?'reasignarTicketMantenimiento':'confirmarAsignacionesMantenimiento'}('${id}')">
        <i class="ti ${puedeReasignar?'ti-user-edit':'ti-user-check'}"></i> ${puedeReasignar?'Reasignar':'Asignar'}
      </button>
    </div>`:'';
  return `<article class="mant-ticket">
    <div class="mant-ticket-superior">
      <strong>${mantHTML(t.titulo)} ${t.prioridad==='alta'?'<span class="mant-prioridad">Prioridad alta</span>':''}</strong>
      <span class="mant-estado mant-estado-${badgeClass}">${estado}</span>
    </div>
    ${t.descripcion?`<div class="mant-ticket-descripcion">${mantHTML(t.descripcion)}</div>`:''}
    <div class="mant-ticket-datos">
      ${mantInvTicket(t)?`<span><i class="ti ti-building-greenhouse"></i> INV ${mantHTML(mantInvTicket(t))}</span>`:''}
      ${t.fechaProgramada?`<span><i class="ti ti-calendar"></i> ${mantHTML(t.fechaProgramada)}</span>`:''}
      ${rec?`<span><i class="ti ti-repeat"></i> ${rec}</span>`:''}
      ${t.estado==='cerrado'&&t.horaInicioTs&&t.horaFinTs?`<span><i class="ti ti-clock"></i> ${formatDuracionMant(t.horaFinTs-t.horaInicioTs)}</span>`:''}
    </div>
    <div class="mant-ticket-responsable"><i class="ti ti-user"></i> ${personas}</div>
    ${selector}
    <div class="mant-ticket-acciones">
      <button type="button" class="mant-btn mant-btn-archivo" onclick="archivarTicketMantenimiento('${id}')" title="Conservar ticket y ejecuciones en Archivo"><i class="ti ti-archive"></i> Archivar</button>
    </div>
  </article>`;
}

// Coordinación solo puede devolver una asignación a la cola; no puede simular un inicio ni un cierre firmado.
async function devolverMantenimientoASinAsignar(ids){
  if(!['ADMIN','TECNICO'].includes(currentUserRole))return false;
  const unicos=[...new Set(ids.map(String).filter(Boolean))];
  if(!unicos.length)return false;
  const tx=await actualizarStorageJsonConEtag(MANTENIMIENTO_KEY,[],cloud=>{
    if(!Array.isArray(cloud))throw Error('Mantenimiento: formato inválido');
    const encontrados=cloud.filter(t=>unicos.includes(String(t.id)));
    if(encontrados.length!==unicos.length||encontrados.some(t=>ticketMantenimientoArchivado(t)||t.estado!=='asignado'))return undefined;
    return cloud.map(t=>unicos.includes(String(t.id))?{...t,estado:'sin_asignar',asignados:[],visto:{}}:t);
  });
  if(!tx.ok||tx.noChange){
    await loadMantenimientoData();
    showToast('No se ha cambiado la asignación: revisa el estado actual del ticket.');
    renderTareasContent(document.getElementById('tareas-overlay'),true);
    return false;
  }
  mantenimientoData=tx.value;
  logHistorial(`Devolvió ${unicos.length} ticket(s) de mantenimiento a Sin asignar`);
  showToast(`✓ ${unicos.length} ticket(s) sin asignar`);
  renderTareasContent(document.getElementById('tareas-overlay'),true);
  return true;
}

async function moverTicketMantenimientoDesdeSelect(id,nuevoEstado){
  if(!nuevoEstado)return;
  if(nuevoEstado!=='sin_asignar'){showToast('Inicio y cierre de mantenimiento requieren ejecución del peón.');return;}
  return devolverMantenimientoASinAsignar([id]);
}
// Reasigna un ticket aún no iniciado sin anularlo ni borrar su trazabilidad.
// No permite mover tickets iniciados, cerrados ni archivados.
async function reasignarTicketMantenimiento(id){
  if(!['ADMIN','TECNICO'].includes(currentUserRole))return false;
  const selector=Array.from(document.querySelectorAll('.mant-asignado-select'))
    .find(el=>el.dataset.ticket===id);
  if(!selector)return false;
  const nuevo=selector.value||'';
  if(nuevo&&USER_ROLES[nuevo]!=='PEON'){
    showToast('Selecciona un peón válido o Sin asignar.');
    return false;
  }
  const btn=selector.nextElementSibling;
  if(btn?.disabled)return false;
  if(btn)btn.disabled=true;
  try{
    const ahora=new Date().toISOString();
    let anterior='';
    const tx=await actualizarStorageJsonConEtag(MANTENIMIENTO_KEY,[],cloud=>{
      if(!Array.isArray(cloud))throw Error('Mantenimiento: formato inválido');
      const t=cloud.find(x=>String(x.id)===String(id));
      if(!t||ticketMantenimientoArchivado(t)||t.estado!=='asignado')return undefined;
      const prev=(t.asignados||[]).slice();
      anterior=prev.join(', ')||'Sin asignar';
      if(prev.length===1&&prev[0]===nuevo)return undefined;
      if(!nuevo&&prev.length===0)return undefined;
      const evento={
        fecha:ahora,por:currentUser||'—',anterior:prev,
        nuevo:nuevo?[nuevo]:[],accion:'reasignacion'
      };
      return cloud.map(x=>String(x.id)!==String(id)?x:{
        ...x,estado:nuevo?'asignado':'sin_asignar',
        asignados:nuevo?[nuevo]:[],visto:nuevo?{[nuevo]:false}:{},
        historialAsignaciones:[...(Array.isArray(x.historialAsignaciones)?x.historialAsignaciones:[]),evento]
      });
    });
    if(!tx.ok||tx.noChange){
      await loadMantenimientoData();
      showToast('No se ha reasignado: el ticket cambió o el responsable sigue igual.');
      renderTareasContent(document.getElementById('tareas-overlay'),true);
      return false;
    }
    mantenimientoData=tx.value;
    logHistorial('Reasignó mantenimiento de '+anterior+' a '+(nuevo||'Sin asignar'));
    showToast(nuevo?'✓ Ticket reasignado a '+nuevo:'✓ Ticket sin asignar');
    renderTareasContent(document.getElementById('tareas-overlay'),true);
    return true;
  }catch(e){
    showToast('No se ha podido reasignar el ticket.');
    return false;
  }finally{
    if(btn?.isConnected)btn.disabled=false;
  }
}

// Asignación individual de mantenimiento: un único PEÓN por ticket, con ETag.
async function confirmarAsignacionesMantenimiento(id){
  if(!['ADMIN','TECNICO'].includes(currentUserRole))return false;
  const selector=Array.from(document.querySelectorAll('.mant-asignado-select')).find(el=>el.dataset.ticket===id);
  const operario=selector?.value||'';
  if(!operario||USER_ROLES[operario]!=='PEON'){
    showToast('Selecciona un operario válido.');
    return false;
  }
  const btn=selector?.nextElementSibling;
  if(btn?.disabled)return false;
  if(btn)btn.disabled=true;
  try{
    const tx=await actualizarStorageJsonConEtag(MANTENIMIENTO_KEY,[],cloud=>{
      if(!Array.isArray(cloud))throw Error('Mantenimiento: formato inválido');
      const ticket=cloud.find(t=>String(t.id)===String(id));
      if(!ticket||ticketMantenimientoArchivado(ticket)||ticket.estado!=='sin_asignar')return undefined;
      return cloud.map(t=>String(t.id)===String(id)
        ?{...t,estado:'asignado',asignados:[operario],visto:{[operario]:false}}
        :t);
    });
    if(!tx.ok||tx.noChange){
      await loadMantenimientoData();
      showToast('Asignación no confirmada. Revisa el estado del ticket.');
      renderTareasContent(document.getElementById('tareas-overlay'),true);
      return false;
    }
    mantenimientoData=tx.value;
    logHistorial('Asignó mantenimiento a '+operario);
    showToast('✓ Ticket asignado a '+operario);
    renderTareasContent(document.getElementById('tareas-overlay'),true);
    return true;
  }catch(e){
    showToast('No se ha podido asignar el ticket.');
    return false;
  }finally{
    if(btn?.isConnected)btn.disabled=false;
  }
}

let nmTrabajoBulkSel = null;
function showNuevoTicketMantenimientoForm(){
  const wrap=document.getElementById('nuevo-ticket-mant-wrap');
  if(!wrap)return;
  nmTrabajoBulkSel=null;
  const salas=[INV_LAYOUT_SALA1,INV_LAYOUT_SALA2,INV_LAYOUT_SALA3,INV_LAYOUT_SALA4,INV_LAYOUT_SALA5];
  wrap.innerHTML=`<div class="mant-form">
    <div class="mant-form-titulo"><h3>Nuevo ticket</h3><button class="mant-btn mant-btn-secundario" type="button" onclick="document.getElementById('nuevo-ticket-mant-wrap').innerHTML=''"><i class="ti ti-x"></i> Cerrar</button></div>
    <div class="mant-form-label">1. Tipo de trabajo</div>
    <div class="mant-trabajos">
      ${MANT_TRABAJOS_PREDETERMINADOS.map(t=>`<button type="button" class="nm-trabajo-btn" data-trabajo="${t.id}" aria-pressed="false" onclick="seleccionarTrabajoMant('${t.id}')">${mantHTML(t.label)}</button>`).join('')}
    </div>
    <div id="nm-paso2" style="display:none">
      <div class="mant-form-label">2. Invernaderos <span id="nm-cuenta-inv" class="mant-contador">0 invernaderos seleccionados</span></div>
      <div class="mant-salas">
        ${salas.map((s,i)=>`<details class="mant-sala" ${i===0?'open':''}><summary>Sala ${i+1}<span data-mant-sala-count="sala${i+1}"></span></summary>
          <div class="mant-lista-inv">${Object.keys(s).map(id=>`<label><input type="checkbox" class="nm-inv-chk" value="${mantHTML(id)}" data-sala="sala${i+1}" onchange="actualizarNuevoTicketMantenimiento()"> INV ${mantHTML(id)}</label>`).join('')}</div>
        </details>`).join('')}
      </div>
      <div class="mant-form-opciones">
        <label class="mant-check"><input type="checkbox" id="nm-prioridad"> Prioridad alta</label>
        <label class="mant-fecha">Fecha programada <input id="nm-fecha-programada" type="date"></label>
      </div>
      <div class="mant-recur">
        <label class="mant-check"><input type="checkbox" id="nm-recurrente" onchange="document.getElementById('nm-recurrencia-campos').style.display=this.checked?'flex':'none'"> Repetir periódicamente</label>
        <div id="nm-recurrencia-campos" style="display:none">
          <span>Cada</span><input id="nm-recur-cada" type="number" min="1" value="1">
          <select id="nm-recur-unidad">${MANT_RECUR_UNIDADES.map(u=>`<option value="${u.key}" ${u.key==='anos'?'selected':''}>${mantHTML(u.label)}</option>`).join('')}</select>
        </div>
      </div>
    </div>
    <div class="mant-form-acciones">
      <button type="button" class="mant-btn mant-btn-secundario" onclick="document.getElementById('nuevo-ticket-mant-wrap').innerHTML=''">Cancelar</button>
      <button type="button" id="nm-btn-crear" class="mant-btn mant-btn-principal" onclick="crearTicketMantenimientoConTrabajo()" disabled><i class="ti ti-check"></i> Crear ticket</button>
    </div>
  </div>`;
}
function seleccionarTrabajoMant(trabajoId){
  if(!MANT_TRABAJOS_PREDETERMINADOS.some(t=>t.id===trabajoId))return;
  nmTrabajoBulkSel=trabajoId;
  document.querySelectorAll('.nm-trabajo-btn').forEach(btn=>{
    const seleccionado=btn.dataset.trabajo===trabajoId;
    btn.classList.toggle('activo',seleccionado);
    btn.setAttribute('aria-pressed',seleccionado?'true':'false');
  });
  const p=document.getElementById('nm-paso2');
  if(p)p.style.display='block';
  actualizarNuevoTicketMantenimiento();
}
async function crearTicketMantenimientoConTrabajo(){
  if(!['ADMIN','TECNICO'].includes(currentUserRole))return;
  if(!nmTrabajoBulkSel){showToast('Elige un tipo de trabajo');return;}
  const invSeleccionados=[...new Set(Array.from(document.querySelectorAll('.nm-inv-chk:checked')).map(el=>el.value))];
  if(!invSeleccionados.length){showToast('Selecciona al menos un invernadero');return;}
  const trabajo=MANT_TRABAJOS_PREDETERMINADOS.find(t=>t.id===nmTrabajoBulkSel);
  if(!trabajo){showToast('El trabajo seleccionado no es válido');return;}
  const btn=document.getElementById('nm-btn-crear');
  if(btn&&btn.disabled)return;
  if(btn)btn.disabled=true;
  try{
    const fecha=new Date(), momento=fecha.getTime();
    const prioridad=document.getElementById('nm-prioridad')?.checked?'alta':'normal';
    const fechaProgramada=document.getElementById('nm-fecha-programada')?.value||null;
    const esRecurrente=!!document.getElementById('nm-recurrente')?.checked;
    let recurrencia=null,proximaFecha=null;
    if(esRecurrente){
      const cada=Number(document.getElementById('nm-recur-cada')?.value);
      const unidad=document.getElementById('nm-recur-unidad')?.value||'anos';
      if(!Number.isSafeInteger(cada)||cada<1||!MANT_RECUR_UNIDADES.some(u=>u.key===unidad)){
        showToast('Revisa el intervalo de repetición.');return;
      }
      recurrencia={cada,unidad};
      proximaFecha=calcularProximaFechaMant(cada,unidad);
    }
    const registros=invSeleccionados.map((invId,i)=>({
      id:'mant_'+momento+'_'+i+'_'+Math.random().toString(36).slice(2,8),
      titulo:`${trabajo.label} (INV ${invId})`,descripcion:'',prioridad,
      estado:'sin_asignar',asignados:[],fechaProgramada,
      asignadoPor:currentUser||'—',visto:{},creadoEn:fecha.toLocaleString('es-ES'),
      recurrencia,proximaFecha
    }));
    const tx=await actualizarStorageJsonConEtag(MANTENIMIENTO_KEY,[],cloud=>{
      if(!Array.isArray(cloud))throw Error('Mantenimiento: formato inválido');
      const conocidos=new Set(cloud.map(t=>t.id));
      const nuevos=registros.filter(t=>!conocidos.has(t.id));
      return nuevos.length?cloud.concat(nuevos):undefined;
    });
    if(!tx.ok){
      showToast('No se ha confirmado el guardado. El formulario conserva los datos.');
      return;
    }
    mantenimientoData=tx.value;
    logHistorial(`Creó ${registros.length} ticket(s) de mantenimiento "${trabajo.label}"`);
    showToast(`✓ ${registros.length} ticket(s) creado(s)`);
    renderTareasContent(document.getElementById('tareas-overlay'),true);
  }catch(e){
    showToast('No se pudo guardar el ticket: '+(e?.message||'Error desconocido'));
  }finally{
    if(btn&&btn.isConnected)btn.disabled=false;
  }
}
// (Aquí vivía crearTicketMantenimiento, eliminada en la auditoría del
// 2026-09-11: era código muerto — no se llamaba desde ningún sitio y leía
// #nm-titulo/#nm-desc, ids que no existen en ninguna plantilla, así que si
// alguien la hubiera vuelto a enganchar habría dado siempre "Indica un
// título". El alta real de tickets es crearTicketMantenimientoConTrabajo,
// justo aquí arriba.)
function archivarTicketMantenimiento(id){
  if(!['ADMIN','TECNICO'].includes(currentUserRole))return;
  const ticket=mantenimientoData.find(t=>t.id===id&&!ticketMantenimientoArchivado(t));
  if(!ticket){showToast('El ticket ya no está activo.');return;}
  if(!confirm('¿Archivar el ticket "'+ticket.titulo+'"?\n\nSe retirará de Mantenimiento y de las asignaciones activas. Sus datos y ejecuciones seguirán disponibles en Archivo.'))return;
  archivarTicketMantenimientoConfirmado(id,ticket.titulo);
}
// Baja lógica ETag idempotente; ningún ticket se elimina físicamente.
async function archivarTicketMantenimientoConfirmado(id,titulo){
  if(!['ADMIN','TECNICO'].includes(currentUserRole))return false;
  const fecha=new Date();
  const tx=await actualizarStorageJsonConEtag(MANTENIMIENTO_KEY,[],cloud=>{
    if(!Array.isArray(cloud))throw Error('Mantenimiento: formato inválido');
    const idx=cloud.findIndex(t=>t.id===id);
    if(idx<0||ticketMantenimientoArchivado(cloud[idx]))return undefined;
    return cloud.map((t,i)=>i!==idx?t:{...t,archivadaEn:fecha.toISOString(),
      fechaArchivoISO:fechaLocalISO(fecha),archivadoPor:currentUser||'—',
      estadoAntesArchivo:t.estado,motivoArchivo:'Retirado de Mantenimiento'});
  });
  if(!tx.ok){avisarFalloGuardado();return false;}
  mantenimientoData=tx.value;
  if(tx.noChange){
    showToast('El ticket ya no está activo.');
    renderTareasContent(document.getElementById('tareas-overlay'),true);
    return false;
  }
  logHistorial('Archivó el ticket de mantenimiento "'+(titulo||'')+'"');
  showToast('✓ Ticket archivado');
  renderTareasContent(document.getElementById('tareas-overlay'),true);
  return true;
}
// Secciones del menú lateral de la vista de gestión (ADMIN/TÉCNICO) — 3 por
// fecha (ver categoriaFechaTarea) + Mantenimiento de Parcelas (tablero
// kanban, sin fecha única por ticket, así que se queda aparte).
const TAREAS_GESTOR_VISTAS = [
  {key:'antiguas', label:'Tareas antiguas', icon:'ti-clock', color:'linear-gradient(135deg,#a32020,#d9432f)'},
  {key:'hoy', label:'Tareas de hoy', icon:'ti-calendar-event', color:'linear-gradient(135deg,#1558a0,#2a72c4)'},
  {key:'manana', label:'Tareas de mañana', icon:'ti-calendar-plus', color:'linear-gradient(135deg,#1a5c2e,#3fa864)'},
  {key:'mantenimiento', label:'Mantenimiento de Parcelas', icon:'ti-plant-2', color:'linear-gradient(135deg,#7b5cf0,#5c8df0)'},
  {key:'indice', label:'Índice Abonos', icon:'ti-clipboard-list', color:'linear-gradient(135deg,#a35d00,#d98c1f)'}
];
// Vista de gestión (ADMIN/TÉCNICO) de "Tareas": pantalla completa con menú
// lateral, mismo formato que el módulo Trabajos (2026-07-30, a petición de
// Paula) — al entrar sin elegir nada se ve un resumen tipo dashboard; cada
// sección del menú lateral (Antiguas/Hoy/Mañana/Mantenimiento) se pinta en
// el panel de la derecha, sin perder nada de lo que ya había (nueva tarea,
// asignar en lote, editar/eliminar, imprimir, kanban de mantenimiento...).
let tareasGestorFiltros={estado:'todas',origen:'todos',sala:'todas',asignado:'todos',fecha:'',busqueda:''};
let tareasGestorFiltrosAbiertos=false;
function resetFiltrosTareasGestorSinRender(){
 tareasGestorFiltros={estado:'todas',origen:'todos',sala:'todas',asignado:'todos',fecha:'',busqueda:''};
 tareasGestorFiltrosAbiertos=false;
}
function cambiarFechaTareasGestor(n){
 const d=new Date((tareasGestorFiltros.fecha||fechaLocalISO(new Date()))+'T00:00:00');
 d.setDate(d.getDate()+n);cambiarFiltroTareasGestor('fecha',fechaLocalISO(d));
}
function cambiarBusquedaTareasGestor(el){
 const pos=el.selectionStart;
 tareasGestorFiltros.busqueda=el.value;
 tareasSeleccionadas.clear();
 renderTareasContent(document.getElementById('tareas-overlay'),true);
 const inp=document.getElementById('tareas-gestor-buscar');
 if(inp){inp.focus();try{inp.setSelectionRange(pos,pos)}catch(e){}}
}
function abrirFiltrosTareasGestor(){
 tareasGestorFiltrosAbiertos=!tareasGestorFiltrosAbiertos;
 renderTareasContent(document.getElementById('tareas-overlay'),true);
}
function usuariosAsignablesOperativas(origen){
 const roles=origen==='riego'?['PEON']:['PEON','REGANTE'];
 return Object.keys(USER_ROLES).filter(u=>roles.includes(USER_ROLES[u]));
}
function tareaPuedeReasignarseEnOperativas(t){
 return !!t&&!esTareaArchivada(t)&&t.estado==='pendiente'&&
   ['riego','manual'].includes(tareaOrigenGestion(t))&&!t.conciliacionFito;
}
function mostrarReasignacionOperativa(id){
 if(!['ADMIN','TECNICO'].includes(currentUserRole))return;
 const t=tareasData.find(x=>x.id===id);
 if(!tareaPuedeReasignarseEnOperativas(t)){showToast('Solo se reasignan tareas pendientes de Riego o Manual');return;}
 const wrap=document.getElementById('op-reasignacion-'+id);
 if(!wrap)return;
 if(wrap.style.display!=='none'){wrap.style.display='none';wrap.innerHTML='';return;}
 // Un único formulario abierto: no dejar estados viejos en otras tarjetas.
 document.querySelectorAll('.op-reasignacion-inline').forEach(w=>{w.style.display='none';w.innerHTML='';});
 const users=usuariosAsignablesOperativas(tareaOrigenGestion(t));
 const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
 wrap.dataset.asignadoActual=t.asignadoA||'';
 wrap.innerHTML=`<label style="font-size:12px;font-weight:700;color:#1558a0" for="op-asignado-${esc(t.id)}">Asignar a</label>
   <select id="op-asignado-${esc(t.id)}" style="flex:1;min-width:130px;padding:8px;border:1px solid #a8c4e8;border-radius:7px;color:#1558a0;background:#fff" aria-label="Destinatario de la tarea">
     ${users.map(u=>`<option value="${esc(u)}" ${u===t.asignadoA?'selected':''}>${esc(u)}</option>`).join('')}
   </select>
   <button type="button" class="op-btn" onclick="confirmarReasignacionOperativa('${esc(t.id)}')">Confirmar</button>
   <button type="button" class="op-btn" onclick="mostrarReasignacionOperativa('${esc(t.id)}')">Cancelar</button>`;
 wrap.style.display='flex';
}
async function confirmarReasignacionOperativa(id){
 if(!['ADMIN','TECNICO'].includes(currentUserRole))return;
 const wrap=document.getElementById('op-reasignacion-'+id);
 if(!wrap)return;
 const destino=document.getElementById('op-asignado-'+id)?.value;
 const previo=wrap.dataset.asignadoActual||'';
 const local=tareasData.find(t=>t.id===id);
 if(!tareaPuedeReasignarseEnOperativas(local)){showToast('La tarea ya no se puede reasignar');return;}
 const origen=tareaOrigenGestion(local);
 if(!usuariosAsignablesOperativas(origen).includes(destino)){showToast('Selecciona un operario válido');return;}
 if(destino===previo){wrap.style.display='none';wrap.innerHTML='';return;}
 // Proteger la tarea en nube contra ejecución, ediciones o cambio de dueño
 // concurrentes: ETag más comparación con el destinatario visto en pantalla.
 const tx=await actualizarStorageJsonConEtag(TAREAS_KEY,[],cloud=>{
   if(!Array.isArray(cloud))throw Error('Tareas: formato inválido');
   const vigente=cloud.find(t=>t.id===id);
   if(!tareaPuedeReasignarseEnOperativas(vigente)||vigente.asignadoA!==previo||tareaOrigenGestion(vigente)!==origen)return undefined;
   const manualRiego=origen==='riego';
   const defecto=manualRiego?peonDelaSala(vigente.inv):null;
   return cloud.map(t=>t.id===id?{
     ...t,asignadoA:destino,visto:false,
     ...(manualRiego?{asignacionManualRiego:destino!==defecto}:{}),
     reasignadoPor:currentUser||'—',reasignadoEn:new Date().toISOString(),
     asignadoAnterior:previo
   }:t);
 });
 if(!tx.ok||tx.noChange){showToast('No se confirmó: la tarea ha cambiado. Actualiza la pantalla.');await loadTareasData(true);refreshTareasViews();return;}
 tareasData=tx.value;
 logHistorial('Reasignó tarea '+(local.titulo||id)+' de '+previo+' a '+destino);
 showToast('✓ Tarea reasignada a '+destino);
 tareasSeleccionadas.clear();
 refreshTareasViews();
}
function tareaOrigenGestion(t){
 if(t.categoria==='mantenimiento')return 'mantenimiento';
 if(t.origenFito?.serieId||t.categoria==='fumigacion')return 'pistola';
 if(t.categoria==='especifico')return 'especificos';
 if(t.categoria==='riego'||t.origenTarea==='riego')return 'riego';
 if(t.categoria==='manual'||t.origenTarea==='manual')return 'manual';
 return 'sin_origen';
}
function cambiarFiltroTareasGestor(campo,valor){
 if(!['estado','origen','sala','asignado','fecha'].includes(campo))return;
 tareasGestorFiltros[campo]=valor;
 tareasSeleccionadas.clear();
 renderTareasContent(document.getElementById('tareas-overlay'),true);
}
function resetFiltrosTareasGestor(){
 tareasGestorFiltros={estado:'todas',origen:'todos',sala:'todas',asignado:'todos',fecha:'',busqueda:''};
 tareasSeleccionadas.clear();
 renderTareasContent(document.getElementById('tareas-overlay'),true);
}
function archivoMantenimientoRegistros(){
  return mantenimientoData.flatMap(t=>{
    const parseInv=/\bINV\s+([^\s)]+)/i.exec(t.titulo||'');
    const inv=parseInv?parseInv[1]:'';
    const convertir=h=>({
      id:String(t.id)+'@'+String(h.id||h.horaFinTs||h.completadoISO||''),
      categoria:'mantenimiento',titulo:t.titulo,descripcion:t.descripcion||'',
      fechaISO:h.completadoISO||h.fechaProgramada||null,
      asignadoA:(h.asignados||[]).join(', ')||h.firmante||'',
      inv,horario:'',estado:'completada',
      horaInicio:h.horaInicio||null,horaFin:h.horaFin||null,firmante:h.firmante||null
    });
    const registros=(t.historialEjecuciones||[]).map(convertir);
    if(t.estado==='cerrado')registros.push(convertir(t));
    if(ticketMantenimientoArchivado(t))registros.push({
      id:String(t.id)+'@archivo',categoria:'mantenimiento',titulo:t.titulo,
      descripcion:[t.descripcion,'Archivado por: '+(t.archivadoPor||'—'),
        'Estado anterior: '+(t.estadoAntesArchivo||t.estado),
        t.fechaProgramada?'Programado: '+t.fechaProgramada:'',
        t.recurrencia?'Recurrencia: '+t.recurrencia.cada+' '+t.recurrencia.unidad:''].filter(Boolean).join(' · '),
      fechaISO:t.fechaArchivoISO||fechaLocalISO(new Date(t.archivadaEn)),
      asignadoA:(t.asignados||[]).join(', '),inv,horario:'',estado:'anulada',
      archivadoEn:t.archivadaEn,motivoAnulacion:'Ticket retirado de Mantenimiento',
      horaInicio:t.horaInicio||null,horaFin:t.horaFin||null,firmante:t.firmante||null
    });
    return registros;
  });
}
function renderTareaArchivoConsultable(t){
 const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
 const origen={manual:'Manual',riego:'Riego',especificos:'Específicos',pistola:'Pistola',mantenimiento:'Mantenimiento',sin_origen:'Antiguo'}[tareaOrigenGestion(t)]||'Antiguo';
 const completada=t.estado==='completada';
 const estado=completada?'Completada':tareaOrigenGestion(t)==='mantenimiento'&&t.archivadoEn?'Archivada':t.estado==='anulada'?'Anulada':'Archivada';
 const lugar=invCallesLabelDeTarea(t);
 const meta=['<span class="op-origen">'+esc(origen)+'</span>',
   '<span><i class="ti ti-calendar"></i> '+esc(t.fechaISO||'Sin fecha')+'</span>',
   '<span><i class="ti ti-user"></i> '+esc(t.asignadoA||'Sin asignar')+'</span>'];
 if(t.horario)meta.push('<span><i class="ti ti-clock"></i> '+esc(t.horario)+'</span>');
 const detalles=[];
 if(t.horaInicio)detalles.push('Inicio: '+esc(t.horaInicio));
 if(t.horaFin)detalles.push('Fin: '+esc(t.horaFin));
 if(t.firmante)detalles.push('Firma: '+esc(t.firmante));
 if(t.firmaPreparador)detalles.push('Preparó: '+esc(t.firmaPreparador));
 if(t.firmaAplicador)detalles.push('Aplicó: '+esc(t.firmaAplicador));
 return `<article class="op-archivo-tarjeta">
   <div class="op-archivo-cab"><strong>${esc(t.titulo||'Tarea sin título')}</strong><span class="op-archivo-estado ${completada?'op-archivo-ok':'op-archivo-anulada'}">${estado}</span></div>
   <div class="op-archivo-meta">${meta.join('')}</div>
   ${lugar?'<div class="op-archivo-lugar"><i class="ti ti-map-pin"></i> '+esc(lugar)+'</div>':''}
   ${t.descripcion?'<div class="op-archivo-desc">'+esc(t.descripcion)+'</div>':''}
   ${t.motivoAnulacion?'<div class="op-archivo-nota"><b>Motivo:</b> '+esc(t.motivoAnulacion)+'</div>':''}
   ${detalles.length?'<div class="op-archivo-ejec">'+detalles.join(' · ')+'</div>':''}
 </article>`;
}
function ordenarArchivoTareas(lista){
 const fecha=t=>t.estado==='completada'
   ?(fechaEjecucionTareaISO(t)||t.fechaISO||'')
   :String(t.archivadoEn||t.fechaISO||'').slice(0,10);
 return lista.slice().sort((a,b)=>fecha(b).localeCompare(fecha(a))||String(b.id||'').localeCompare(String(a.id||'')));
}
function renderGrupoArchivoTareas(nombre,lista){
 if(!lista.length)return '';
 return '<section class="op-archivo-seccion"><div class="op-archivo-seccion-cab"><h3>'+nombre+
   '</h3><span class="op-archivo-contador">'+lista.length+'</span></div>'+
   '<div class="op-archivo-grid">'+ordenarArchivoTareas(lista).map(renderTareaArchivoConsultable).join('')+
   '</div></section>';
}
function abrirJornadaPistolaDesdeTareas(id){
  const t=tareasData.find(x=>x.id===id);
  if(!t||!t.origenFito?.serieId)return;
  const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const overlay=getOrCreateOverlay('jornada-pistola-tareas-overlay');
  overlay.style.zIndex='2100';
  overlay.innerHTML=`<div style="background:#fff;border-radius:12px;padding:18px;max-width:480px;width:100%;max-height:88vh;overflow:auto">
    <div style="color:#1558a0;font-weight:800;font-size:16px;margin-bottom:10px">Jornada de Pistola</div>
    <div style="font-size:13px;line-height:1.9">${esc(t.titulo)} · ${esc(t.fechaISO)}
      <div>${esc(invCallesLabelDeTarea(t))}</div>
      <div>PEÓN: ${esc(t.asignadoA)} · ${esc(t.estado)}</div>
      <div>Caldo inicial: ${esc(t.caldoLabel)}</div>
      <div>Inicio: ${esc(t.horaInicio||'—')} · Fin: ${esc(t.horaFin||'—')}</div>
      <div>Preparó: ${esc(t.firmaPreparador||'—')} · Aplicó: ${esc(t.firmaAplicador||'—')}</div></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:15px">
      <button onclick="document.getElementById('jornada-pistola-tareas-overlay').style.display='none'" style="padding:9px 14px;border:1px solid #a8c4e8;background:#fff;color:#1558a0;border-radius:7px">Cerrar</button>
      <button onclick="document.getElementById('jornada-pistola-tareas-overlay').style.display='none';document.getElementById('tareas-overlay').style.display='none';showFitoModule()" style="padding:9px 14px;border:0;background:#1558a0;color:#fff;border-radius:7px">Plaguicidas</button>
    </div></div>`;
  overlay.style.display='flex';
}
function imprimirTareasGestorActivas(){
 // Se imprimen únicamente partes operativos activos de PEÓN; los partes de
 // Pistola y Específicos mantienen su propio circuito e impresión.
 const f=tareasGestorFiltros;
 const buscar=String(f.busqueda||'').toLocaleLowerCase('es').trim();
 const tareas=tareasData.filter(t=>{
   if(USER_ROLES[t.asignadoA]!=='PEON'||esTareaArchivada(t)||['completada','anulada'].includes(t.estado))return false;
   if(t.origenFito?.serieId||t.categoria==='fumigacion'||t.categoria==='especifico')return false;
   // Lo impreso respeta los filtros visibles de Operativas.
   if(buscar&&![t.titulo,t.descripcion,t.inv,t.calles,t.fechaISO,t.asignadoA,t.horario,tareaOrigenGestion(t)].join(' ').toLocaleLowerCase('es').includes(buscar))return false;
   if(f.estado!=='todas'&&t.estado!==f.estado)return false;
   if(f.origen!=='todos'&&tareaOrigenGestion(t)!==f.origen)return false;
   if(f.sala!=='todas'&&salaDeInv(t.inv)!==f.sala)return false;
   if(f.asignado!=='todos'&&t.asignadoA!==f.asignado)return false;
   return !f.fecha||t.fechaISO===f.fecha;
 });
 if(!tareas.length){showToast('No hay partes operativos imprimibles con estos filtros');return;}
 showImprimirTareasSelector(tareas,'operativas');
}
async function descargarRespaldoTareas(){
 if(currentUserRole!=='ADMIN')return;
 try{
   const datos=await Promise.all([window.storage.get(TAREAS_KEY),window.storage.get(MANTENIMIENTO_KEY)]);
   if(!datos[0]||!datos[1])throw Error('Datos remotos no disponibles');
   const tareas=JSON.parse(datos[0].value),mantenimiento=JSON.parse(datos[1].value);
   if(!Array.isArray(tareas)||!Array.isArray(mantenimiento))throw Error('Formato inesperado');
   const data={tipo:'ViguerAPP TEST - respaldo de Tareas',exportadoEn:new Date().toISOString(),version:1,tareas,mantenimiento};
   const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
   const url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download='viguerapp-tareas-backup-'+fechaLocalISO(new Date())+'.json';
   document.body.appendChild(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch(e){showToast('No se ha generado el respaldo: '+e.message);}
}
function renderTareasGestorFullScreen(overlay){
 overlay.style.padding='0';
 const old=overlay.querySelector('#tareas-gestor-content-wrap'),scroll=old?old.scrollTop:0;
 const vista=tareasGestorVista||'operativas',f=tareasGestorFiltros;
 const all=tareasData.filter(t=>vista==='archivo'?esTareaArchivada(t):!esTareaArchivada(t))
    .concat(vista==='archivo'?archivoMantenimientoRegistros():[]);
 const filtered=all.filter(t=>{
   const buscar=String(f.busqueda||'').toLocaleLowerCase('es').trim();
   if(buscar&&![t.titulo,t.descripcion,t.inv,t.calles,t.fechaISO,t.asignadoA,t.horario,tareaOrigenGestion(t),t.motivoAnulacion,t.firmante,t.firmaPreparador,t.firmaAplicador].join(' ').toLocaleLowerCase('es').includes(buscar))return false;
   if(f.estado!=='todas'&&t.estado!==f.estado)return false;
   if(f.origen!=='todos'&&tareaOrigenGestion(t)!==f.origen)return false;
   if(f.sala!=='todas'&&salaDeInv(t.inv)!==f.sala)return false;
   if(f.asignado!=='todos'&&(vista==='archivo'?!String(t.asignadoA||'').split(/\s*,\s*/).includes(f.asignado):t.asignadoA!==f.asignado))return false;
   return !f.fecha||t.fechaISO===f.fecha;
 });
 const active=filtered.filter(t=>t.estado!=='completada'&&t.estado!=='anulada'),done=filtered.filter(t=>t.estado==='completada');
 const nav=(key,label,count,icon)=>`<button onclick="irATareasGestorVista('${key}')" style="flex:1;min-width:0;padding:7px 3px;font-size:11px;font-weight:800;background:${vista===key?'#0d396b':'#1558a0'};color:#fff;border:1px solid ${vista===key?'#c8def7':'#8eb1d5'};border-radius:7px;cursor:pointer;white-space:nowrap"><i class="ti ${icon}"></i> ${label} ${count}</button>`;
 const select=(campo,ops)=>`<select aria-label="${campo}" onchange="cambiarFiltroTareasGestor('${campo}',this.value)" style="min-width:110px;max-width:190px;padding:8px;border:1px solid #a8c4e8;border-radius:7px;background:#fff;color:#1558a0;font-size:12px">${ops.map(([val,label])=>`<option value="${val}" ${f[campo]===val?'selected':''}>${label}</option>`).join('')}</select>`;
 const origen=[['todos','Todos los orígenes'],['manual','Manual'],['riego','Riego'],['especificos','Específicos'],['pistola','Pistola'],['mantenimiento','Mantenimiento'],['sin_origen','Antiguos']];
 const salas=[['todas','Todas las salas'],...['sala1','sala2','sala3','sala4','sala5'].map((v,i)=>[v,'Sala '+(i+1)])];
 const personal=[['todos','Todos los operarios'],...Object.keys(USER_ROLES).map(u=>[u,u])];
 const estadoExtra=vista==='operativas'?select('estado',[['todas','Todos los estados'],['pendiente','Pendientes'],['iniciada','En curso'],['completada','Completadas']]):'';
 const fechaBar=vista!=='operativas'?'':`<div class="op-fecha">
   <button type="button" class="op-btn" onclick="cambiarFechaTareasGestor(-1)" aria-label="Día anterior" title="Día anterior"><i class="ti ti-chevron-left"></i></button>
   <input type="date" aria-label="Fecha de tareas" value="${f.fecha}" onchange="cambiarFiltroTareasGestor('fecha',this.value)">
   <button type="button" class="op-btn" onclick="cambiarFechaTareasGestor(1)" aria-label="Día siguiente" title="Día siguiente"><i class="ti ti-chevron-right"></i></button>
   <button type="button" class="op-btn" onclick="cambiarFiltroTareasGestor('fecha','')">Todos</button>
 </div>`;
 const qSafe=String(f.busqueda||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
 const filtroHTML=vista==='mantenimiento'?'':vista==='operativas'?`
   <div class="op-ui op-buscador">
     <input id="tareas-gestor-buscar" type="search" aria-label="Buscar tareas" value="${qSafe}" placeholder="Buscar tarea, INV, persona…" oninput="cambiarBusquedaTareasGestor(this)">
     ${fechaBar}
     <button type="button" class="op-btn" onclick="abrirFiltrosTareasGestor()" aria-expanded="${tareasGestorFiltrosAbiertos}"><i class="ti ti-filter"></i> Filtros${tareasGestorFiltrosAbiertos?' −':' +'}</button>
     ${tareasGestorFiltrosAbiertos?`<div class="op-filtros-extra">
       ${select('origen',origen)}${select('sala',salas)}${select('asignado',personal)}${estadoExtra}
       <button type="button" class="op-btn" onclick="resetFiltrosTareasGestor()"><i class="ti ti-x"></i> Limpiar</button>
     </div>`:''}
   </div>`:
   `<div class="op-ui op-buscador">
     <input id="tareas-gestor-buscar" type="search" aria-label="Buscar archivo" value="${qSafe}" placeholder="Buscar en archivo…" oninput="cambiarBusquedaTareasGestor(this)">
     <button type="button" class="op-btn" onclick="abrirFiltrosTareasGestor()" aria-expanded="${tareasGestorFiltrosAbiertos}"><i class="ti ti-filter"></i> Filtros${tareasGestorFiltrosAbiertos?' −':' +'}</button>
     ${tareasGestorFiltrosAbiertos?`<div class="op-filtros-extra">
       ${select('estado',[['todas','Todos los estados'],['completada','Completadas'],['anulada','Anuladas / archivadas']])}
       ${select('origen',origen)}${select('sala',salas)}${select('asignado',personal)}
       <input type="date" aria-label="Fecha de tarea" title="Fecha programada de la tarea" value="${f.fecha}" onchange="cambiarFiltroTareasGestor('fecha',this.value)">
       <button type="button" class="op-btn" onclick="resetFiltrosTareasGestor()"><i class="ti ti-x"></i> Limpiar</button>
     </div>`:''}
   </div>`;
 const action=(fn,icon,label)=>`<button type="button" class="op-btn" onclick="${fn}()"><i class="ti ${icon}"></i> ${label}</button>`;
 const pendientesRiego=leerColaRiegoTareas().length;
 const avisoRiegoPendiente=vista==='operativas'&&pendientesRiego?`<div role="status" style="padding:9px 12px;background:#fff8e1;color:#795300;border-bottom:1px solid #e4d39b;font-size:12px;font-weight:700">
   Riego · ${pendientesRiego} invernadero(s) pendiente(s) de conciliar
   ${currentUserRole==='ADMIN'?'<button onclick="procesarColaRiegoTareas()" style="margin-left:9px;background:#1558a0;color:#fff;border:0;border-radius:6px;padding:6px 10px;cursor:pointer">Reintentar</button>':''}
 </div>`:'';
 const toolbar=vista==='operativas'?`<div class="op-toolbar">
   ${action('showNuevaTareaForm','ti-plus','Nueva tarea')}
 </div><div id="nueva-tarea-form-wrap"></div>`:'';
 const batch=vista==='operativas'&&active.some(t=>t.estado==='pendiente'&&tareaOrigenGestion(t)==='manual')?`<div class="op-batch">
   <span style="font-weight:700;color:#1558a0">Reasignar marcadas</span>
   <select id="lote-asignado-select" aria-label="Operario destino"><option value="">Elegir usuario</option>${usuariosAsignablesOperativas('manual').map(u=>`<option value="${u}">${u}</option>`).join('')}</select>
   <button type="button" id="btn-asignar-lote" class="op-btn" onclick="asignarTareasEnLote()" disabled>Asignar (<span id="lote-contador">0</span>)</button>
 </div>`:'';
 const cards=(list,selectable)=>`<div class="op-lista">${list.map(t=>buildTareaGestorRow(t,selectable&&t.estado==='pendiente'&&tareaOrigenGestion(t)==='manual')).join('')||'<div style="font-size:12px;color:#667">Sin tareas.</div>'}</div>`;
 const body=vista==='mantenimiento'?renderMantenimientoColgandoHTML()
   :vista==='archivo'?`<div class="op-ui">
     <div class="op-archivo-toolbar"><strong>Archivo · ${filtered.length} registros</strong>
       ${currentUserRole==='ADMIN'?action('descargarRespaldoTareas','ti-download','Respaldo JSON'):''}
     </div>
     ${filtered.length?
       renderGrupoArchivoTareas('Completadas',filtered.filter(t=>t.estado==='completada'))+
       renderGrupoArchivoTareas('Anuladas y archivadas',filtered.filter(t=>t.estado!=='completada')):
       '<div class="op-archivo-empty">No hay registros para los filtros seleccionados.</div>'}
   </div>`
   :`<div class="op-ui">${toolbar}${batch}
       <div class="op-seccion-cab"><h3>Pendientes y en curso</h3><span class="op-count">${active.length}</span></div>
       ${cards(ordenarTareasPorHorario(active),true)}
       ${done.length?`<div class="op-seccion-cab"><h3>Completadas recientes</h3><span class="op-count">${done.length}</span></div>
       ${cards(ordenarTareasCompletadas(done),false)}`:''}
     </div>`;
 overlay.innerHTML=`<div style="background:#f7faff;width:100vw;height:100vh;max-width:100vw;overflow:hidden;display:flex;flex-direction:column">
   <div style="background:var(--grad-blue);padding:7px 11px;color:#fff;display:flex;align-items:center;justify-content:space-between">
     <strong style="font-size:16px"><i class="ti ti-clipboard-list"></i> Tareas</strong>
     <div style="display:flex;align-items:center;gap:6px">
       ${vista==='operativas'?'<button type="button" onclick="imprimirTareasGestorActivas()" style="background:#1558a0;color:#fff;border:1px solid #8eb1d5;border-radius:7px;width:34px;height:34px;cursor:pointer" title="Imprimir partes de Operativas con los filtros actuales" aria-label="Imprimir tareas"><i class="ti ti-printer" style="font-size:18px"></i></button>':''}
       <button type="button" onclick="document.getElementById('tareas-overlay').style.display='none'" style="background:#1558a0;color:#fff;border:0;border-radius:6px;width:34px;height:34px;cursor:pointer" aria-label="Cerrar"><i class="ti ti-x"></i></button>
     </div>
   </div>
   <div style="padding:6px 9px;background:#1558a0;display:flex;gap:6px;box-sizing:border-box;width:100%">
     ${nav('operativas','Operativas',vista==='operativas'?filtered.length:tareasData.filter(t=>!esTareaArchivada(t)).length,'ti-list-check')}
     ${nav('mantenimiento','Mantenimiento',mantenimientoData.filter(t=>!ticketMantenimientoArchivado(t)&&t.estado!=='cerrado').length,'ti-tool')}
     ${nav('archivo','Archivo',tareasData.filter(esTareaArchivada).length+archivoMantenimientoRegistros().length,'ti-archive')}
        </div>
   ${avisoRiegoPendiente}
   ${filtroHTML}
   <div id="tareas-gestor-content-wrap" style="flex:1;overflow-y:auto;padding:8px 10px">
     ${body}
   </div>
 </div>`;
 const next=overlay.querySelector('#tareas-gestor-content-wrap');if(next)next.scrollTop=scroll;
}
function renderTareasGestorResumenHTML(counts){
  const subLabel = key => key==='mantenimiento' ? (counts[key]===1?'ticket abierto':'tickets abiertos') : key==='indice' ? 'agua y abono' : (counts[key]===1?'pendiente':'pendientes');
  return `
    <div style="margin-bottom:1.5rem">
      <h2 style="font-size:22px;font-weight:800;color:var(--text);margin-bottom:4px">Resumen de Tareas</h2>
      <p style="font-size:13px;color:var(--muted)">Vista general por fecha, más Mantenimiento de Parcelas.</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:2rem">
      ${TAREAS_GESTOR_VISTAS.map(v=>`
        <div onclick="irATareasGestorVista('${v.key}')" style="cursor:pointer;background:${v.color};color:#fff;border-radius:14px;padding:1.25rem 1.4rem;box-shadow:var(--shadow-md)">
          <i class="ti ${v.icon}" style="font-size:22px;opacity:.9"></i>
          <div style="font-size:13px;font-weight:700;margin-top:10px;opacity:.9">${v.label}</div>
          ${v.key==='indice' ? '' : `<div style="font-size:28px;font-weight:800;margin-top:4px">${counts[v.key]}</div>`}
          <div style="font-size:11px;opacity:.85;margin-top:2px">${subLabel(v.key)}</div>
        </div>`).join('')}
    </div>
    <button onclick="showNuevaTareaForm()" class="btn-elevado" style="padding:9px 16px;font-size:12px;font-weight:700;background:#2e7d32;color:#fff;border:none;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;gap:6px">
      <i class="ti ti-plus" style="font-size:14px"></i> Nueva tarea
    </button>
    <div id="nueva-tarea-form-wrap"></div>`;
}
// Contenido de una sección del menú lateral: Mantenimiento es el tablero
// kanban de siempre; las 3 de fecha muestran una tabla de pendientes
// (con selección + asignar en lote, igual que antes) y otra de completadas
// debajo, ambas ordenadas por horario (a petición de Paula) en vez de por
// prioridad/fecha como antes — ya no hace falta elegir Sala 1/2 aparte, la
// columna Invernadero de la tabla ya lo deja ver.
function renderTareasGestorVistaHTML(vista, porFecha){
  if(vista==='mantenimiento'){
    return `
      <div style="margin-bottom:1rem">
        <h2 style="font-size:22px;font-weight:800;color:var(--text)">🌱 Mantenimiento de Parcelas</h2>
        <p style="font-size:13px;color:var(--muted)">${mantenimientoData.filter(t=>!ticketMantenimientoArchivado(t)&&t.estado!=='cerrado').length} tickets abiertos.</p>
      </div>
      ${renderMantenimientoColgandoHTML()}`;
  }
  if(vista==='indice'){
    // Mismo Índice Abonos que ve el Regante (a petición de Paula, 2026-08-18:
    // "que también aparezca en Tareas de los técnicos y admins") — es de
    // solo lectura y no depende del rol, así que se reutiliza sin cambios.
    return `
      <div style="margin-bottom:1rem">
        <h2 style="font-size:22px;font-weight:800;color:var(--text)">📑 Índice Abonos</h2>
        <p style="font-size:13px;color:var(--muted)">Todos los riegos de agua y abono de hoy y mañana, ordenados por horario.</p>
      </div>
      ${renderIndiceAbonos()}`;
  }
  const v = TAREAS_GESTOR_VISTAS.find(x=>x.key===vista);
  const lista = porFecha[vista] || [];
  const { activas, completadas } = splitTareasPorEstado(lista);
  const activasOrdenadas = ordenarTareasPorHorario(activas);
  const completadasOrdenadas = ordenarTareasPorHorario(completadas);
  // Asignar en lote (patrón CRM de tickets, a petición de Paula): marcar
  // varias tareas pendientes y asignarlas todas a la vez a una persona, en
  // vez de editarlas una a una. Solo tiene sentido sobre las pendientes. Una
  // sola barra para toda la sección (no una por sala) — la selección ya es
  // global (tareasSeleccionadas), así que puede mezclar tareas de las dos salas.
  const loteToolbar = activasOrdenadas.length ? `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;padding:8px 10px;background:#eef4fb;border:1px solid #a8c4e8;border-radius:8px;flex-wrap:wrap">
      <span style="font-size:11px;font-weight:700;color:#1558a0">Asignar seleccionadas a:</span>
      <select id="lote-asignado-select" style="padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:12px">
        <option value="">— Elige —</option>
        ${Object.keys(USER_ROLES).map(u=>`<option value="${u}">${u}</option>`).join('')}
      </select>
      <button id="btn-asignar-lote" onclick="asignarTareasEnLote()" disabled style="padding:6px 14px;font-size:12px;font-weight:800;background:#1558a0;color:#fff;border:none;border-radius:6px;cursor:pointer;opacity:.5">Confirmar (<span id="lote-contador">0</span>)</button>
    </div>` : '';
  // A petición de Paula (2026-07-30): dentro de cada apartado, las tareas se
  // subdividen también por Sala 1 / Sala 2 (y "Sin invernadero" si hiciera
  // falta), cada una con sus propias pendientes/completadas — ya no basta con
  // la columna Invernadero de la tabla sola.
  const activasPorSala = agruparTareasPorSala(activasOrdenadas);
  const completadasPorSala = agruparTareasPorSala(completadasOrdenadas);
  const bloques = [
    renderTareaSalaBloque('Sala 1', activasPorSala.sala1, completadasPorSala.sala1),
    renderTareaSalaBloque('Sala 2', activasPorSala.sala2, completadasPorSala.sala2),
    renderTareaSalaBloque('Sala 3', activasPorSala.sala3, completadasPorSala.sala3),
    renderTareaSalaBloque('Sala 4', activasPorSala.sala4, completadasPorSala.sala4),
    renderTareaSalaBloque('Sala 5', activasPorSala.sala5, completadasPorSala.sala5),
    (activasPorSala.otras.length || completadasPorSala.otras.length) ? renderTareaSalaBloque('Sin invernadero', activasPorSala.otras, completadasPorSala.otras) : ''
  ].join('');
  return `
    <div style="margin-bottom:1rem;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
      <div>
        <h2 style="font-size:22px;font-weight:800;color:var(--text)">${v.label}</h2>
        <p style="font-size:13px;color:var(--muted)">Ordenadas por horario, por sala.${vista==='antiguas'?' Se eliminan solas 1 día después de cumplirse/completarse.':''}</p>
      </div>
      <button onclick="showNuevaTareaForm()" class="btn-elevado" style="padding:9px 16px;font-size:12px;font-weight:700;background:#2e7d32;color:#fff;border:none;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap">
        <i class="ti ti-plus" style="font-size:14px"></i> Nueva tarea
      </button>
    </div>
    <div id="nueva-tarea-form-wrap"></div>
    ${loteToolbar}
    ${activasOrdenadas.length===0 && completadasOrdenadas.length===0 ? `<div style="text-align:center;padding:1.5rem;color:var(--muted);font-style:italic">No hay tareas aquí.</div>` : bloques}`;
}
// Agrupa una lista de tareas (ya ordenada por horario, el orden se conserva)
// en Sala 1 / Sala 2 / Sin invernadero, reutilizando salaDeInv (mismo criterio
// que el resto de la app para saber a qué sala pertenece un INV).
function agruparTareasPorSala(lista){
  return {
    sala1: lista.filter(t=>salaDeInv(t.inv)==='sala1'),
    sala2: lista.filter(t=>salaDeInv(t.inv)==='sala2'),
    sala3: lista.filter(t=>salaDeInv(t.inv)==='sala3'),
    sala4: lista.filter(t=>salaDeInv(t.inv)==='sala4'),
    sala5: lista.filter(t=>salaDeInv(t.inv)==='sala5'),
    otras: lista.filter(t=>!salaDeInv(t.inv))
  };
}
// Un bloque "Sala X" dentro de un apartado de Tareas: su propia tabla de
// pendientes (con checkbox, para el asignar en lote de arriba) y su propia
// tabla de completadas debajo — no se pinta nada si la sala no tiene
// ninguna tarea (ni pendiente ni completada) en este apartado.
function renderTareaSalaBloque(salaLabel, activasSala, completadasSala){
  if(!activasSala.length && !completadasSala.length) return '';
  const filasActivas = activasSala.map(t=>buildTareaGestorRow(t,true)).join('');
  const filasCompletadas = completadasSala.map(t=>buildTareaGestorRow(t,false)).join('');
  return `
    <div style="margin:0 0 .6rem;font-size:13px;font-weight:800;color:#1558a0;text-transform:uppercase;letter-spacing:.04em;display:flex;align-items:center;gap:8px">
      <i class="ti ti-building-warehouse" style="font-size:15px"></i> ${salaLabel}
    </div>
    ${activasSala.length===0 ? `<div style="padding:.75rem 0 1rem;color:var(--muted);font-style:italic;font-size:12px">No hay tareas pendientes.</div>` : `
    <div style="margin-bottom:${completadasSala.length?'1rem':'1.5rem'}">
      ${tareaTableHead(true)}
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px 16px;margin-top:6px">
        ${filasActivas}
      </div>
    </div>`}
    ${completadasSala.length ? `
    <div style="font-size:11px;font-weight:800;color:#2e7d32;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">✓ Completadas (${completadasSala.length})</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px 16px;opacity:.85;margin-bottom:1.5rem">
      ${filasCompletadas}
    </div>` : ''}`;
}
function renderTareasContent(overlay, esGestor){
  if(esGestor){
    renderTareasGestorFullScreen(overlay);
  } else {
    // PEÓN: ordenadas por horario y de una en una — hasta que no se complete
    // y firme la actual no aparece la siguiente (a petición de Paula).
    const todasMias = tareasData.filter(t=>t.asignadoA===currentUser && !esTareaArchivada(t));
    const { activas, completadas } = splitTareasPorEstado(todasMias);
    const activasOrdenadas = ordenarTareasPorHorario(activas), completadasRev = ordenarTareasCompletadas(completadas);
    tareasImprimirMias = activasOrdenadas;
    const actual = activasOrdenadas[0];
    if(actual) peonVistaMantenimiento = false;
    const bloqueSinActiva = !peonVistaMantenimiento ? `
      <div style="text-align:center;padding:2rem 1rem">
        <div style="font-size:16px;font-weight:800;color:#2e7d32;margin-bottom:16px">✓ Has terminado todas las tareas de riego.<br>Continúa con las tareas de mantenimiento.</div>
        <button onclick="continuarConMantenimientoPeon()" style="padding:12px 32px;font-size:14px;font-weight:800;background:#1558a0;color:#fff;border:none;border-radius:10px;cursor:pointer">Continuar</button>
      </div>` : renderMantenimientoPeonHTML();
    const cardsHTML = todasMias.length===0
      ? `<div style="text-align:center;padding:2.5rem;color:var(--muted);font-style:italic">No tienes tareas asignadas.</div>`
      : (actual ? buildTareaCardParaPeon(actual) : bloqueSinActiva)
        + (completadasRev.length ? `
        <div style="font-size:11px;font-weight:800;color:#2e7d32;text-transform:uppercase;letter-spacing:.04em;margin-top:6px">✓ Completadas</div>
        ${completadasRev.map(t=>buildTareaCard(t)).join('')}` : '');
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:14px;max-width:640px;width:100%;max-height:92vh;overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,.25)">
        <div style="background:var(--grad-blue);color:#fff;padding:1.1rem 1.5rem;border-radius:14px 14px 0 0;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0">
          <div style="font-size:16px;font-weight:800">📋 Mis tareas</div>
          <div style="display:flex;align-items:center;gap:8px">
            ${currentUserRole==='PEON' ? `
            <button onclick="showImprimirTareasSelector(tareasImprimirMias)" title="Imprimir mis trabajos" style="background:rgba(255,255,255,.15);border:none;color:#fff;border-radius:6px;padding:5px 12px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:5px">
              <i class="ti ti-printer" style="font-size:14px"></i> Imprimir
            </button>` : ''}
            <button onclick="this.closest('.modal-overlay-dyn').style.display='none'" style="background:rgba(255,255,255,.15);border:none;color:#fff;border-radius:6px;padding:5px 12px;cursor:pointer;font-size:12px">✕</button>
          </div>
        </div>
        <div style="padding:1rem 1.25rem;display:flex;flex-direction:column;gap:10px">${cardsHTML}</div>
      </div>`;
  }
}
// Fecha completa tipo "LUNES 13 JULIO 2026" a partir de fechaISO (que ya
// llevan casi todas las tareas); si no hay fechaISO (tareas muy antiguas),
// se usa la fecha corta que hubiera guardada como respaldo.
function showImprimirTareasSelectorLoaded(tareas,origen='peon'){
  if(!tareas.length){ showToast('No hay tareas para imprimir'); return; }
  const esOperativas=origen==='operativas';
  const fechas = [...new Set(tareas.map(t=>t.fechaISO).filter(Boolean))].sort();
  const hoyISO = fechaLocalISO(new Date());
  const fechaInicial=fechas.includes(hoyISO)?hoyISO:fechas[0];
  const salasDisponibles=[...new Set(tareas.map(t=>t.inv?salaDeInv(t.inv):null).filter(Boolean))].sort();
  const mo = getOrCreateOverlay('imprimir-tareas-selector-overlay');
  mo.dataset.itIds = JSON.stringify(tareas.map(t=>t.id));
  const labelFecha = f => {
    const d = new Date(f+'T00:00:00');
    const s = d.toLocaleDateString('es-ES',{weekday:'short',day:'2-digit',month:'short'}).replace('.','');
    return s.charAt(0).toUpperCase()+s.slice(1);
  };
  mo.innerHTML = `
    <div style="background:#fff;border-radius:12px;max-width:420px;width:100%;padding:16px;box-shadow:0 8px 40px rgba(0,0,0,.3)">
      <div style="font-size:15px;font-weight:800;margin-bottom:5px;color:#1558a0">Imprimir tareas · ${tareas.length}</div>
      ${esOperativas?'<div style="font-size:11px;color:#55687e;line-height:1.4;margin-bottom:12px">Partes activos asignados a PEÓN según los filtros. Pistola y Específicos tienen impresión propia.</div>':''}
      ${fechas.length ? `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <label style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">Días con tareas</label>
        <label style="font-size:11px;font-weight:600;display:flex;align-items:center;gap:4px;cursor:pointer">
          <input type="checkbox" onchange="document.querySelectorAll('#imprimir-tareas-selector-overlay .it-dia-chk').forEach(c=>c.checked=this.checked);actualizarConteoImprimirTareas()"> Todos
        </label>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;max-height:160px;overflow-y:auto;border:1px solid var(--border);border-radius:7px;padding:8px;margin-bottom:14px">
        ${fechas.map(f=>`
          <label style="font-size:12px;display:flex;align-items:center;gap:6px;cursor:pointer">
            <input type="checkbox" class="it-dia-chk" value="${f}" onchange="actualizarConteoImprimirTareas()" ${f===fechaInicial?'checked':''}> ${labelFecha(f)}
          </label>`).join('')}
      </div>` : `
      <div style="font-size:12px;color:var(--muted);font-style:italic;margin-bottom:14px">Estas tareas no tienen fecha asignada — se imprimirán todas.</div>`}
      ${salasDisponibles.length?'<label style="font-size:11px;font-weight:700;color:var(--muted);display:block;margin-bottom:5px">Salas con tareas</label><div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">'+salasDisponibles.map(sala=>'<label style="font-size:12px;display:flex;align-items:center;gap:4px;border:1px solid #cbd9e9;border-radius:6px;padding:5px 8px;cursor:pointer"><input type="checkbox" class="it-sala-chk" value="'+sala+'" onchange="actualizarConteoImprimirTareas()" checked> Sala '+sala.slice(-1)+'</label>').join('')+'</div>':''}
      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button type="button" onclick="this.closest('.modal-overlay-dyn').style.display='none'" style="padding:8px 12px;font-size:12px;background:#1558a0;color:#fff;border:0;border-radius:7px;cursor:pointer">Cancelar</button>
        <button type="button" id="it-imprimir-confirmar" onclick="confirmarImprimirTareasSeleccionadas()" style="padding:8px 12px;font-size:12px;font-weight:800;background:#1558a0;color:#fff;border:0;border-radius:7px;cursor:pointer">Imprimir (<span id="it-contador">0</span>)</button>
      </div>
    </div>`;
  mo.style.display='flex';
  actualizarConteoImprimirTareas();
}
function tareasElegidasParaImprimir(){
  const mo=document.getElementById('imprimir-tareas-selector-overlay');
  if(!mo)return [];
  const ids=JSON.parse(mo.dataset.itIds||'[]');
  const diasChk=Array.from(mo.querySelectorAll('.it-dia-chk'));
  const dias=diasChk.filter(c=>c.checked).map(c=>c.value);
  const salasChk=Array.from(mo.querySelectorAll('.it-sala-chk'));
  const salas=salasChk.filter(c=>c.checked).map(c=>c.value);
  if((diasChk.length&&!dias.length)||(salasChk.length&&!salas.length))return [];
  return tareasData.filter(t=>{
    if(!ids.includes(t.id))return false;
    if(diasChk.length&&!dias.includes(t.fechaISO))return false;
    const sala=t.inv?salaDeInv(t.inv):null;
    return !sala||salas.includes(sala);
  });
}
function actualizarConteoImprimirTareas(){
  const mo=document.getElementById('imprimir-tareas-selector-overlay');
  if(!mo)return;
  const tareas=tareasElegidasParaImprimir();
  const contador=mo.querySelector('#it-contador'),boton=mo.querySelector('#it-imprimir-confirmar');
  if(contador)contador.textContent=tareas.length;
  if(boton){boton.disabled=!tareas.length;boton.style.opacity=tareas.length?'1':'.5';}
}
function confirmarImprimirTareasSeleccionadas(){
  const tareas=tareasElegidasParaImprimir();
  if(!tareas.length){showToast('Selecciona al menos un día y sala con tareas');return;}
  document.getElementById('imprimir-tareas-selector-overlay').style.display='none';
  imprimirTareas(tareas);
}
// Botón "Imprimir" junto a Editar/Eliminar en la tabla de gestión — imprime
// esa única tarea directamente, sin el selector de día/sala (ya se sabe
// exactamente cuál se quiere) — a petición de Paula, 2026-08-10.
function imprimirTareaSuelta(id){
  const t = tareasData.find(x=>x.id===id);
  if(!t){ showToast('Tarea no encontrada'); return; }
  imprimirTareas([t]);
}
function imprimirTareas(tareasConPosiblesDuplicados){
  // Una misma tarea puede llegar repetida (ej. si aparece en más de una
  // lista de origen antes de filtrar) — se quita por id para que cada
  // tarea salga una sola vez en la hoja impresa.
  const vistos = new Set();
  const tareas = tareasConPosiblesDuplicados.filter(t=>{
    if(vistos.has(t.id)) return false;
    vistos.add(t.id);
    return true;
  });
  if(!tareas.length){ showToast('No hay tareas para imprimir'); return; }
  const escapar = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // Mismo trabajo (mismo título) + mismo día + mismo horario: salen juntos
  // en UNA sola hoja, con un bloque INV→calles por cada invernadero, en vez
  // de una hoja por invernadero — a petición de Paula, 2026-08-10 (ejemplo
  // real: "Puntas de pasillo + Puntas de atrás" en INV 2A/2B/3B, todos Sala
  // 1). Las tareas sin invernadero (fumigaciones con objetivos propios,
  // etc.) no se agrupan, cada una imprime su propia hoja como siempre.
  // A petición de Vigueras (2026-09-21): el agua NO tiene restricción de
  // cuba (cualquier invernadero se puede combinar en la misma hoja); el
  // abono foliar SÍ respeta la misma cuba fija que Plaguicidas/Específicos
  // (ver grupoCubaDeInv/CUBA_GRUPOS) — t.esFoliar ya viene calculado desde
  // generarTareasDesdeRiego (ver tituloTrabajoEsFoliar). Una tarea sin ese
  // campo (creada por otra vía, ej. tareas manuales) se trata como sin
  // restricción, igual que el agua.
  const grupos = [];
  const indice = new Map();
  tareas.forEach(t=>{
    const grupoCuba = t.esFoliar ? grupoCubaDeInv(t.inv) : 'SIN_RESTRICCION_CUBA';
    const key = t.inv ? [t.fechaISO||'', t.titulo, t.horario||t.turno||'', grupoCuba].join('||') : ('sola_'+t.id);
    if(indice.has(key)) grupos[indice.get(key)].push(t);
    else { indice.set(key, grupos.length); grupos.push([t]); }
  });
  const paginas = grupos.map(grupo=>{
    const primero = grupo[0];
    const bloques = grupo.map(t=>{
      const calles = t.calles ? (/\(INV completo\)$/.test(t.calles) ? 'ENTERO' : t.calles) : '';
      // Si son varios tramos (separados por ", " al construirlos, ver
      // tramosLabelTexto), cada uno va en su propia línea en vez de todos
      // seguidos — más fácil de leer en la hoja impresa.
      const callesPartes = calles && calles!=='ENTERO' ? calles.split(', ') : (calles ? [calles] : []);
      return {inv: t.inv, callesPartes};
    });
    return `<div class="hoja-tarea">
      <div class="p-fecha">${escapar(fechaCompletaImprimir(primero))}</div>
      <div class="p-trabajo">${escapar(primero.titulo)}</div>
      ${bloques.some(b=>b.inv || b.callesPartes.length) ? `<div class="p-invcalles">
        ${bloques.map(b=>`
        <div class="p-invcalles-top">
          ${b.inv ? `<span class="p-inv-box">INV ${escapar(b.inv)}</span>` : ''}
          ${b.inv && b.callesPartes.length===1 ? `<span class="p-arrow">→</span>` : ''}
          ${b.callesPartes.length===1 ? `<span class="p-calles">${escapar(b.callesPartes[0])}</span>` : ''}
        </div>
        ${b.callesPartes.length>1 ? `<div class="p-calles-lista">${b.callesPartes.map(p=>`<div class="p-calles-linea">${escapar(p)}</div>`).join('')}</div>` : ''}`).join('')}
      </div>` : ''}
      ${(primero.horario || primero.turno) ? `<div class="p-horario">${escapar(primero.horario || primero.turno)}</div>` : ''}
    </div>`;
  }).join('');
  let iframe = document.getElementById('print-tareas-iframe');
  if(!iframe){
    iframe = document.createElement('iframe');
    iframe.id = 'print-tareas-iframe';
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none';
    document.body.appendChild(iframe);
  }
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tareas</title>
    <style>
      @page { size: 148mm 210mm; margin: 10mm; }
      html, body { width: 128mm; height: 190mm; margin:0; }
      body { font-family: Arial, Helvetica, sans-serif; color:#1a1e18 }
      .hoja-tarea { page-break-after: always; page-break-inside: avoid; width: 128mm; min-height: 190mm; display:flex; flex-direction:column; justify-content:space-evenly; align-items:center; text-align:center; gap:14mm; box-sizing:border-box; }
      .hoja-tarea:last-child { page-break-after: auto; }
      .p-fecha { font-size: 32px; font-weight: 700; }
      .p-trabajo { font-size: 46px; font-weight: 800; line-height:1.3; }
      .p-invcalles { font-size: 40px; font-weight: 700; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; }
      .p-invcalles-top { display:flex; align-items:center; justify-content:center; gap:22px; flex-wrap:wrap; }
      .p-calles-lista { display:flex; flex-direction:column; align-items:center; gap:8px; }
      .p-calles-linea { font-size:40px; font-weight:700; }
      .p-inv-box { border: 4px solid #1a1e18; border-radius: 12px; padding: 14px 26px; }
      .p-arrow { font-size: 52px; font-weight:800; }
      .p-horario { font-size: 54px; font-weight: 800; color:#c62828; text-align:center; border:4px solid #c62828; border-radius:14px; padding:10px 26px; }
    </style></head><body>${paginas}</body></html>`);
  doc.close();
  setTimeout(()=>{ iframe.contentWindow.focus(); iframe.contentWindow.print(); }, 200);
}
function actualizarResumenAsignacionOperativas(tipo){
  if(tipo!=='nt'&&tipo!=='et')return;
  const seleccionados=document.querySelectorAll('#'+tipo+'-asignado-chips .chip-asignado-on').length;
  const label=document.getElementById(tipo+'-asignados-resumen');
  if(label)label.textContent=seleccionados+' seleccionado'+(seleccionados===1?'':'s');
}
function showNuevaTareaForm(){
  if(!['ADMIN','TECNICO'].includes(currentUserRole)){showToast('Solo ADMIN y TÉCNICO pueden gestionar Tareas.');return;}
  const wrap=document.getElementById('nueva-tarea-form-wrap');
  if(!wrap)return;
  const asignables=usuariosAsignablesOperativas('manual');
  const hoyISO=fechaLocalISO(new Date());
  const invOptions='<option value="">Invernadero (opcional)</option>'+
    '<optgroup label="Sala 1">'+ALL_INV_IDS_SALA1.map(id=>`<option value="${id}">${id}</option>`).join('')+'</optgroup>'+
    '<optgroup label="Sala 2">'+ALL_INV_IDS.map(id=>`<option value="${id}">${id}</option>`).join('')+'</optgroup>'+
    '<optgroup label="Sala 3">'+ALL_INV_IDS_SALA3.map(id=>`<option value="${id}">${id}</option>`).join('')+'</optgroup>'+
    '<optgroup label="Sala 4">'+ALL_INV_IDS_SALA4.map(id=>`<option value="${id}">${id}</option>`).join('')+'</optgroup>'+
    '<optgroup label="Sala 5">'+ALL_INV_IDS_SALA5.map(id=>`<option value="${id}">${id}</option>`).join('')+'</optgroup>';
  wrap.innerHTML=`<div class="op-nt-form">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:9px;margin-bottom:9px">
      <strong style="font-size:13px;color:#1558a0">Nueva tarea manual</strong>
      <button type="button" class="op-btn" onclick="document.getElementById('nueva-tarea-form-wrap').innerHTML=''"><i class="ti ti-x"></i> Cerrar</button>
    </div>
    <input id="nt-titulo" type="text" aria-label="Título de tarea" placeholder="Título de la tarea" style="width:100%;margin-bottom:7px">
    <div class="op-nt-grid">
      <select id="nt-inv" aria-label="Invernadero">${invOptions}</select>
      <input id="nt-calles" type="text" aria-label="Calles" placeholder="Calle(s)">
      <input id="nt-fecha" type="date" aria-label="Fecha" value="${hoyISO}">
      <select id="nt-turno" aria-label="Turno"><option value="">Turno (opcional)</option><option value="Mañana">Mañana</option><option value="Tarde">Tarde</option></select>
    </div>
    <details class="op-personal"><summary>Asignar usuarios · <span id="nt-asignados-resumen">0 seleccionados</span></summary>
      <div id="nt-asignado-chips">
        ${asignables.map(u=>`<button type="button" data-nt-asignado-chip="${u}" onclick="this.classList.toggle('chip-asignado-on');actualizarResumenAsignacionOperativas('nt')" class="chip-asignado">${u}</button>`).join('')}
      </div>
    </details>
    <textarea id="nt-desc" aria-label="Descripción" placeholder="Descripción (opcional)"></textarea>
    <div class="op-nt-footer">
      <label><input type="checkbox" id="nt-prioridad"> Prioridad alta</label>
      <button type="button" class="op-btn" onclick="document.getElementById('nueva-tarea-form-wrap').innerHTML=''">Cancelar</button>
      <button type="button" class="op-btn" onclick="crearTarea()"><i class="ti ti-check"></i> Crear y asignar</button>
    </div>
  </div>`;
}
async function crearTarea(){
  if(!['ADMIN','TECNICO'].includes(currentUserRole)){showToast('Solo ADMIN y TÉCNICO pueden gestionar Tareas.');return;}
  const titulo = document.getElementById('nt-titulo')?.value?.trim();
  // Asignar a varias personas a la vez (a petición de Paula, 2026-08-11) —
  // se crea UNA TAREA POR CADA PERSONA marcada (mismo título/descripción/
  // horario/prioridad, cada una con su propio asignadoA), en vez de meter un
  // array en asignadoA. Mismo patrón fan-out que ya usa
  // autoAsignarTareaEspecifico para REGANTE — así ningún sitio de lectura
  // existente (filtros t.asignadoA===currentUser, contarTareasNuevas,
  // generarTareasDesdeRiego, impresión...) necesita cambiar.
  const asignados = Array.from(document.querySelectorAll('#nt-asignado-chips .chip-asignado-on')).map(b=>b.dataset.ntAsignadoChip);
  const descripcion = document.getElementById('nt-desc')?.value?.trim()||'';
  const prioridad = document.getElementById('nt-prioridad')?.checked ? 'alta' : 'normal';
  const inv = document.getElementById('nt-inv')?.value||'';
  const calles = document.getElementById('nt-calles')?.value?.trim()||'';
  const turno = document.getElementById('nt-turno')?.value||'';
  const fechaRaw = document.getElementById('nt-fecha')?.value;
  const fecha = fechaRaw ? new Date(fechaRaw+'T00:00:00').toLocaleDateString('es-ES',{day:'2-digit',month:'short'}).replace('.','') : '';
  if(!titulo||!asignados.length||asignados.some(u=>!usuariosAsignablesOperativas('manual').includes(u))){ showToast('Indica título y operarios válidos'); return; }
  const nuevasTareas=[];
  asignados.forEach(asignadoA=>{
    nuevasTareas.push({
      id: 'tarea_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),
      titulo, descripcion, asignadoA, asignadoPor: currentUser||'—',
      inv, calles, fecha, fechaISO: fechaRaw||null, turno,
      categoria:'manual', origenTarea:'manual', prioridad, estado:'pendiente', horaInicio:null, horaFin:null, firmante:null,
      visto: false,
      creadoEn: new Date().toLocaleString('es-ES')
    });
  });
  const tx=await actualizarStorageJsonConEtag(TAREAS_KEY,[],cloud=>{
    if(!Array.isArray(cloud))throw Error('Tareas: formato inválido');
    return cloud.concat(nuevasTareas);
  });
  if(!tx.ok){avisarFalloGuardado();showToast('No se ha confirmado la creación de la tarea');return;}
  tareasData=tx.value;
  logHistorial(`Creó la tarea "${titulo}" y la asignó a ${asignados.join(', ')}`);
  showToast('✓ Tarea creada y asignada a '+asignados.join(', '));
  showTareasModule();
}

// ── EDITAR / ELIMINAR TAREAS (ADMIN/TÉCNICO, vista de gestión) ─────
// A diferencia de persistTareasData() (que fusiona por id sumando lo local
// y lo de la nube — pensado para no perder tareas creadas casi a la vez),
// aquí hace falta lo contrario: releer la nube, modificar/quitar la tarea
// exacta y guardar ese resultado tal cual, para que una edición o un
// borrado no reaparezcan fusionados con la versión antigua.
function showEditarTareaForm(id){
  if(!['ADMIN','TECNICO'].includes(currentUserRole)){showToast('Solo ADMIN y TÉCNICO pueden gestionar Tareas.');return;}
  const t=tareasData.find(x=>x.id===id);
  if(!t){showToast('No se encontró la tarea');return;}
  if(tareaOrigenGestion(t)!=='manual'||t.estado!=='pendiente'){showToast('Solo se editan tareas manuales pendientes.');return;}
  if(esTareaArchivada(t)){showToast('El archivo es de solo consulta.');return;}
  const wrap=document.getElementById('nueva-tarea-form-wrap');
  if(!wrap)return;
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const asignables=usuariosAsignablesOperativas('manual');
  const invOptions='<option value="">Invernadero (opcional)</option>'+
    '<optgroup label="Sala 1">'+ALL_INV_IDS_SALA1.map(x=>`<option value="${esc(x)}" ${t.inv===x?'selected':''}>${esc(x)}</option>`).join('')+'</optgroup>'+
    '<optgroup label="Sala 2">'+ALL_INV_IDS.map(x=>`<option value="${esc(x)}" ${t.inv===x?'selected':''}>${esc(x)}</option>`).join('')+'</optgroup>'+
    '<optgroup label="Sala 3">'+ALL_INV_IDS_SALA3.map(x=>`<option value="${esc(x)}" ${t.inv===x?'selected':''}>${esc(x)}</option>`).join('')+'</optgroup>'+
    '<optgroup label="Sala 4">'+ALL_INV_IDS_SALA4.map(x=>`<option value="${esc(x)}" ${t.inv===x?'selected':''}>${esc(x)}</option>`).join('')+'</optgroup>'+
    '<optgroup label="Sala 5">'+ALL_INV_IDS_SALA5.map(x=>`<option value="${esc(x)}" ${t.inv===x?'selected':''}>${esc(x)}</option>`).join('')+'</optgroup>';
  wrap.innerHTML=`<div class="op-nt-form">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:9px;margin-bottom:9px">
      <strong style="font-size:13px;color:#1558a0">Editar tarea manual</strong>
      <button type="button" class="op-btn" onclick="document.getElementById('nueva-tarea-form-wrap').innerHTML=''"><i class="ti ti-x"></i> Cerrar</button>
    </div>
    <input id="et-titulo" type="text" aria-label="Título de tarea" value="${esc(t.titulo)}" placeholder="Título de la tarea" style="width:100%;margin-bottom:7px">
    <div class="op-nt-grid">
      <select id="et-inv" aria-label="Invernadero">${invOptions}</select>
      <input id="et-calles" type="text" aria-label="Calles" value="${esc(t.calles)}" placeholder="Calle(s)">
      <input id="et-fecha" type="date" aria-label="Fecha" value="${esc(t.fechaISO)}">
      <select id="et-turno" aria-label="Turno">
        <option value="" ${!t.turno?'selected':''}>Turno (opcional)</option>
        <option value="Mañana" ${t.turno==='Mañana'?'selected':''}>Mañana</option>
        <option value="Tarde" ${t.turno==='Tarde'?'selected':''}>Tarde</option>
      </select>
    </div>
    <details class="op-personal"><summary>Asignar usuarios · <span id="et-asignados-resumen">1 seleccionado</span></summary>
      <div id="et-asignado-chips">
        ${asignables.map(u=>`<button type="button" data-et-asignado-chip="${esc(u)}" onclick="this.classList.toggle('chip-asignado-on');actualizarResumenAsignacionOperativas('et')" class="chip-asignado${t.asignadoA===u?' chip-asignado-on':''}">${esc(u)}</button>`).join('')}
      </div>
      <div style="font-size:10.5px;color:#5a7288;padding:0 9px 8px">Seleccionar varios crea una tarea individual adicional por cada usuario nuevo.</div>
    </details>
    <textarea id="et-desc" aria-label="Descripción" placeholder="Descripción (opcional)">${esc(t.descripcion)}</textarea>
    <div class="op-nt-footer">
      <label><input type="checkbox" id="et-prioridad" ${t.prioridad==='alta'?'checked':''}> Prioridad alta</label>
      <button type="button" class="op-btn" onclick="document.getElementById('nueva-tarea-form-wrap').innerHTML=''">Cancelar</button>
      <button type="button" class="op-btn" onclick="guardarEdicionTarea('${t.id}')"><i class="ti ti-check"></i> Guardar cambios</button>
    </div>
  </div>`;
  actualizarResumenAsignacionOperativas('et');
}
async function guardarEdicionTarea(id){
  if(!['ADMIN','TECNICO'].includes(currentUserRole)){showToast('Solo ADMIN y TÉCNICO pueden gestionar Tareas.');return;}
  const titulo=document.getElementById('et-titulo')?.value?.trim();
  const asignadosMarcados=Array.from(document.querySelectorAll('#et-asignado-chips .chip-asignado-on')).map(b=>b.dataset.etAsignadoChip);
  const asignadoA=asignadosMarcados[0];
  const extraAsignados=asignadosMarcados.slice(1);
  if(!titulo||!asignadoA||asignadosMarcados.some(u=>!usuariosAsignablesOperativas('manual').includes(u))){ showToast('Indica título y operarios válidos'); return; }
  const nuevoEstado='pendiente'; // La ejecución/cierre se realiza exclusivamente desde el operario
  const fechaRaw=document.getElementById('et-fecha')?.value||'';
  const fechaLabel=fechaRaw ? new Date(fechaRaw+'T00:00:00').toLocaleDateString('es-ES',{day:'2-digit',month:'short'}).replace('.','') : '';
  const campos={
    titulo,asignadoA,
    descripcion:document.getElementById('et-desc')?.value?.trim()||'',
    inv:document.getElementById('et-inv')?.value||'',
    calles:document.getElementById('et-calles')?.value?.trim()||'',
    fecha:fechaLabel,fechaISO:fechaRaw||null,
    turno:document.getElementById('et-turno')?.value||'',
    prioridad:document.getElementById('et-prioridad')?.checked?'alta':'normal',
    estado:nuevoEstado
  };
  const tx=await actualizarStorageJsonConEtag(TAREAS_KEY,[],cloud=>{
    if(!Array.isArray(cloud)) cloud=[];
    const idx=cloud.findIndex(x=>x.id===id);
    if(idx<0) return {value:cloud,result:{missing:true}};
    if(tareaOrigenGestion(cloud[idx])!=='manual'||cloud[idx].estado!=='pendiente')return {value:cloud,result:{protected:true}};
    if(esTareaArchivada(cloud[idx]))return {value:cloud,result:{archived:true}};
    const cambioDeDueño=cloud[idx].asignadoA!==asignadoA;
    const actualizada={...cloud[idx],...campos,visto:cambioDeDueño?false:cloud[idx].visto};
    if(nuevoEstado==='pendiente'){ actualizada.horaInicio=null;actualizada.horaFin=null;actualizada.firmante=null;actualizada.completadoISO=null; }
    if(nuevoEstado==='iniciada'){ actualizada.horaFin=null;actualizada.firmante=null;actualizada.completadoISO=null;if(!actualizada.horaInicio) actualizada.horaInicio=new Date().toLocaleString('es-ES'); }
    if(nuevoEstado==='completada' && !actualizada.horaFin){ actualizada.horaFin=new Date().toLocaleString('es-ES');actualizada.completadoISO=fechaLocalISO(new Date());if(!actualizada.firmante) actualizada.firmante=currentUser||'—'; }
    cloud[idx]=actualizada;
    extraAsignados.forEach(u=>cloud.push({...actualizada,id:'tarea_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),asignadoA:u,visto:false}));
    return {value:cloud,result:{missing:false}};
  });
  if(!tx.ok){ avisarFalloGuardado();showToast('✗ No se han podido guardar los cambios');return; }
  if(tx.result?.missing){ showToast('No se encontró la tarea (puede que ya se haya eliminado)');return; }
  if(tx.result?.protected){showToast('La jornada Pistola protege su tarea vinculada.');return;}
   if(tx.result?.archived){showToast('El archivo es de solo consulta.');return;}
   tareasData=tx.value;
  logHistorial(`Editó la tarea "${titulo}" (asignada a ${asignadosMarcados.join(', ')})`);
  const wrap=document.getElementById('nueva-tarea-form-wrap');
  if(wrap) wrap.innerHTML='';
  showToast('✓ Cambios guardados');
  refreshTareasViews();
}
async function eliminarTarea(id){
 if(!['ADMIN','TECNICO'].includes(currentUserRole))return;
 const tarea=tareasData.find(t=>t.id===id);
 if(!tarea){showToast('Tarea no encontrada');return;}
 if(tareaOrigenGestion(tarea)!=='manual'||tarea.estado!=='pendiente'||esTareaArchivada(tarea)){showToast('Esta tarea está protegida.');return;}
 if(!confirm('¿Anular la tarea "'+tarea.titulo+'"? Se conservará en el Archivo, sin borrarse.'))return;
 const tx=await actualizarStorageJsonConEtag(TAREAS_KEY,[],cloud=>{
   if(!Array.isArray(cloud))throw Error('Tareas: formato inválido');
   const t=cloud.find(x=>x.id===id);
   if(!t||tareaOrigenGestion(t)!=='manual'||t.estado!=='pendiente'||esTareaArchivada(t))return undefined;
   const fecha=new Date().toISOString();
   return cloud.map(x=>x.id===id?{...x,estado:'anulada',archivadaEn:fecha,motivoAnulacion:'Anulada desde Tareas',anuladaPor:currentUser}:x);
 });
 if(!tx.ok||tx.noChange){showToast('No se confirmó la anulación.');return;}
 tareasData=tx.value;
 logHistorial('Anuló una tarea y la conservó en el Archivo');
 showToast('✓ Tarea anulada y archivada');
 refreshTareasViews();
}

// Refresca la vista de tareas que esté activa en cada momento: el panel
// fijo del PEÓN en su pantalla de inicio, y/o el modal de Tareas si está
// abierto (gestión o "Mis tareas" de REGANTE).
// A petición de Paula: en cuanto el peón termina TODAS sus tareas de riego
// activas, en vez de "no te quedan tareas pendientes" se le invita a
// continuar con Mantenimiento de Parcelas (los tickets que le asignen
// técnicos/admins desde el kanban). peonVistaMantenimiento controla si ya
// pulsó "Continuar" — se resetea a false en cuanto vuelva a tener una tarea
// de riego activa (para no quedarse "atascado" en mantenimiento).
// ════════════════════════════════════════════════════════════════
