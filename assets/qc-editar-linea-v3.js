'use strict';
/* QC 0.107: editor de línea común Túnel / Carga, sin maestros nuevos.
 * No cambia permisos ni genera líneas; mantiene intactos los campos antiguos no editados.
 */
(function(root){
  let ctx=null;
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const field=(name,html)=>'<label class="qc107-field">'+esc(name)+html+'</label>';
  const selectInv=actual=>{
    const salas=[['Sala 1',ALL_INV_IDS_SALA1],['Sala 2',ALL_INV_IDS],
      ['Sala 3',ALL_INV_IDS_SALA3],['Sala 4',ALL_INV_IDS_SALA4],['Sala 5',ALL_INV_IDS_SALA5]];
    return '<option value="">— Seleccionar —</option>'+
      salas.map(([name,ids])=>'<optgroup label="'+esc(name)+'">'+ids.map(inv=>
        '<option value="'+esc(inv)+'"'+(inv===actual?' selected':'')+'>INV '+esc(inv)+'</option>').join('')+'</optgroup>').join('');
  };
  const calleOptions=(inv,current)=>{
    const layout=INV_LAYOUT[inv];
    const nums=layout?[...new Set([...layout.row1,...layout.row2])].sort((a,b)=>a-b):[];
    return '<option value="">— Calle —</option>'+nums.map(n=>
      '<option value="'+n+'"'+(String(n)===String(current)?' selected':'')+'>'+n+'</option>').join('');
  };
  function pairing(c){
    let cliente=String(c.cliente||'').trim(),variedad=String(c.variedad||'').trim();
    const raw=String(c.clienteVariedad||'').trim();
    if((!cliente||!variedad)&&raw.includes(' — ')){
      const p=raw.lastIndexOf(' — ');
      cliente=raw.slice(0,p).trim();variedad=raw.slice(p+3).trim();
    }
    return {cliente,variedad,raw,legacy:!cliente||!variedad};
  }
  function read(id){return document.getElementById(id)?.value??'';}
  function setError(msg){const el=document.getElementById('qc107-error');if(el)el.textContent=msg;}
  function chosenLocation(c){
    const tr=c.tipo==='tunel'?calleTramoDeTunel(c):calleTramoDeCargaDirecta(c);
    const inv=String(c.invId&&INV_LAYOUT[c.invId]?c.invId:tr?.invId&&INV_LAYOUT[tr.invId]?tr.invId:'');
    return {inv,from:inv&&tr?String(tr.desde):'',to:inv&&tr?String(tr.hasta):''};
  }
  async function show(id){
    const c=controlChecksData.find(x=>x.id===id);
    if(c?.tipo==='preinjerto_patron')return showPreinjertoPatron(id);
    if(!c||!['tunel','carga'].includes(c.tipo))return;
    const state={id,tipo:c.tipo,busy:false,serial:Date.now()+Math.random()};ctx=state;
    const overlay=getOrCreateOverlay('control-editar-overlay');
    overlay.innerHTML='<div class="qc107-modal" role="status">Cargando opciones de los partes…</div>';
    overlay.style.display='flex';
    const loaded=await loadControlTipoCompleto(c.tipo,false);
    if(loaded&&c.tipo==='tunel'&&['ADMIN','TECNICO'].includes(currentUserRole))
      await loadControlTipoCompleto('carga',false);
    if(ctx!==state||overlay.style.display!=='flex')return;
    const line=controlChecksData.find(x=>x.id===id);
    if(!line){setError('No se ha encontrado la línea.');return;}
    const pair=pairing(line);
    state.catalogo=qcAltaCatalogo();
    if(!pair.legacy&&!state.catalogo.some(p=>p.cliente===pair.cliente&&p.variedad===pair.variedad))
      state.catalogo.push({cliente:pair.cliente,variedad:pair.variedad});
    state.legacy=pair.legacy;
    const clients=[...new Set(state.catalogo.map(p=>p.cliente))].sort((a,b)=>a.localeCompare(b,'es'));
    const clienteHTML=(pair.legacy?'<option value="__ORIGINAL__" selected>Conservar valor anterior</option>':'')+
      '<option value="">— Seleccionar cliente —</option>'+clients.map(n=>
        '<option value="'+esc(n)+'"'+(!pair.legacy&&n===pair.cliente?' selected':'')+'>'+esc(n)+'</option>').join('');
    const vars=[...new Set(state.catalogo.filter(p=>p.cliente===pair.cliente).map(p=>p.variedad))];
    const varHTML=pair.legacy?'<option value="">Valor anterior conservado</option>':
      '<option value="">— Seleccionar variedad —</option>'+vars.map(n=>
        '<option value="'+esc(n)+'"'+(n===pair.variedad?' selected':'')+'>'+esc(n)+'</option>').join('');
    const loc=chosenLocation(line);
    state.originalLoc=loc;
    const locationDisplay=controlQCInfoVisual(line);
    overlay.innerHTML='<div class="qc107-modal" role="dialog" aria-label="Editar partida">'+
      '<h2>Editar partida</h2>'+
      '<section class="qc107-section"><h3>Datos de la partida</h3><div class="qc107-grid">'+
      field('Día','<select id="qc107-day">'+generarOpcionesDiaControl(line.dia)+'</select>')+
      field('Nº de partida','<input id="qc107-partida" type="text" maxlength="24" value="'+esc(line.partida)+'">')+
      field('Cliente','<select id="qc107-client" onchange="qc107CambiarCliente()">'+clienteHTML+'</select>')+
      field('Variedad','<select id="qc107-variedad"'+(pair.legacy?' disabled':'')+'>'+varHTML+'</select>')+
      field('Bandejas','<input id="qc107-bandejas" type="number" min="1" step="1" value="'+esc(line.numBandejas)+'">')+
      '</div></section>'+
      '<section class="qc107-section"><h3>Ubicación</h3>'+
      '<div class="qc107-location-current">Actual: '+esc(locationDisplay.inv)+' · Calle '+esc(locationDisplay.calles)+'</div>'+
      '<div class="qc107-grid">'+
      field('Invernadero','<select id="qc107-inv" onchange="qc107CambiarInv()">'+selectInv(loc.inv)+'</select>')+
      field('Calle desde','<select id="qc107-from" onchange="qc107CambiarCalle()">'+calleOptions(loc.inv,loc.from)+'</select>')+
      field('Calle hasta','<select id="qc107-to" onchange="qc107CambiarCalle()">'+calleOptions(loc.inv,loc.to)+'</select>')+
      '</div>'+
      (line.tipo==='tunel'?'<button class="qc107-advanced" type="button" onclick="qc107Avanzada()">Editar varios tramos / invernaderos</button>':'')+
      '</section><div id="qc107-error" role="alert"></div>'+
      '<div class="qc107-actions"><button type="button" class="qc107-cancel" onclick="qc107Cancelar()">Cancelar</button>'+
      '<button type="button" id="qc107-save" class="qc107-save" onclick="qc107Guardar()">Guardar</button></div></div>';
  }
  root.qc107Cancelar=function(){
    const el=document.getElementById('control-editar-overlay');
    if(el)el.style.display='none';
    ctx=null;
  };
  root.qc107CambiarCliente=function(){
    if(!ctx)return;
    const c=read('qc107-client'),el=document.getElementById('qc107-variedad');
    if(!el)return;
    el.disabled=c==='__ORIGINAL__';
    if(el.disabled){el.innerHTML='<option value="">Valor anterior conservado</option>';return;}
    const vars=[...new Set(ctx.catalogo.filter(p=>p.cliente===c).map(p=>p.variedad))]
      .sort((a,b)=>a.localeCompare(b,'es'));
    el.innerHTML='<option value="">— Seleccionar variedad —</option>'+
      vars.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');
  };
  root.qc107CambiarInv=function(){
    const inv=read('qc107-inv');
    for(const id of ['qc107-from','qc107-to']){
      const el=document.getElementById(id);
      if(el)el.innerHTML=calleOptions(inv,'');
    }
  };
  root.qc107CambiarCalle=function(){setError('');};
  root.qc107Avanzada=function(){
    if(!ctx||ctx.tipo!=='tunel')return;
    if(!confirm('La edición avanzada de ubicación se guarda aparte. Se descartarán los cambios no guardados en esta ficha. ¿Continuar?'))return;
    const id=ctx.id;
    root.qc107Cancelar();
    mostrarAsignarCalleControl(id);
  };
  root.qc107Guardar=async function(){
    const state=ctx;if(!state||state.busy)return false;
    const c=controlChecksData.find(x=>x.id===state.id);
    if(!c)return false;
    const fail=m=>{setError(m);return false;};
    const dia=Number(read('qc107-day'));
    if(!Number.isInteger(dia)||dia<15)return fail('Día no válido.');
    if(dia!==c.dia&&!puedeCrearLineaControlQC(dia))return fail('No se puede mover a una fecha pasada.');
    const partida=read('qc107-partida').trim().toUpperCase();
    if(!/^\d{2}[A-Z]{0,2}\d{4,6}$/.test(partida)||/ZE|YE/.test(partida))return fail('Nº de partida inválido.');
    const textoB=read('qc107-bandejas').trim(),bandejas=Number(textoB);
    if(!textoB||!Number.isSafeInteger(bandejas)||bandejas<=0)return fail('Indica bandejas enteras positivas.');
    let cliente='',variedad='',combinado='';
    if(state.legacy&&read('qc107-client')==='__ORIGINAL__'){
      cliente=String(c.cliente||'');variedad=String(c.variedad||'');
      combinado=String(c.clienteVariedad||'');
    }else{
      cliente=read('qc107-client');variedad=read('qc107-variedad');
      if(!state.catalogo.some(p=>p.cliente===cliente&&p.variedad===variedad))
        return fail('Selecciona cliente y variedad de las opciones disponibles.');
      combinado=cliente+' — '+variedad;
    }
    const inv=read('qc107-inv'),from=read('qc107-from'),to=read('qc107-to');
    const prior=state.originalLoc;
    let loc=null;
    if(inv!==prior.inv||from!==prior.from||to!==prior.to){
      if(!INV_LAYOUT[inv]||!from||!to)return fail('Indica el invernadero y ambas calles.');
      const allowed=[...INV_LAYOUT[inv].row1,...INV_LAYOUT[inv].row2];
      const a=Number(from),b=Number(to);
      if(!Number.isInteger(a)||!Number.isInteger(b)||!allowed.includes(a)||!allowed.includes(b))
        return fail('Las calles no pertenecen al invernadero.');
      loc={invId:inv,desde:Math.min(a,b),hasta:Math.max(a,b)};
    }
    const target=loc||(c.tipo==='tunel'?calleTramoDeTunel(c):calleTramoDeCargaDirecta(c));
    if(controlChecksData.some(x=>{
      if(x.id===c.id||x.tipo!==c.tipo||x.dia!==dia||String(x.partida||'').toUpperCase()!==partida||!target)return false;
      const t=c.tipo==='tunel'?calleTramoDeTunel(x):calleTramoDeCargaDirecta(x);
      const invSame=t&&(c.tipo==='tunel'?String(t.invId)===String(target.invId):
        String(t.invId).replace(/[A-Za-z]+$/,'')===String(target.invId).replace(/[A-Za-z]+$/,''));
      return invSame&&t.desde===target.desde&&t.hasta===target.hasta;
    }))return fail('Ya existe otra línea con la misma partida, día y ubicación.');
    state.busy=true;const btn=document.getElementById('qc107-save');if(btn)btn.disabled=true;
    try{
      const newDay=dia!==c.dia;
      const ok=c.tipo==='tunel'?
        await aplicarEditarControlCheck(c.id,dia,combinado,partida,String(bandejas),newDay,loc,cliente,variedad):
        await aplicarEditarControlCargaCheck(c.id,dia,cliente,partida,variedad,String(bandejas),
          loc?String(parseInt(loc.invId,10))+'-'+loc.desde+'-'+loc.hasta:c.invernadero,newDay,loc);
      if(ok){ctx=null;volverTrasGuardarDatosControlBackoffice(c.id);}
      else fail('Guardado pendiente de sincronizar. Comprueba el estado antes de repetir.');
      return ok;
    }catch(e){return fail('No se ha podido confirmar el cambio.');}
    finally{state.busy=false;if(btn&&btn.isConnected)btn.disabled=false;}
  };
  root.mostrarEditarControlCheck=show;
  root.mostrarEditarControlCargaCheck=show;

  // Editor específico Carga Injerto. La fecha/hora de la carga proceden de GS
  // y se mantienen inmutables; los campos corregidos en APP se guardan aparte
  // para que una sincronización posterior del conector no los pise.
  let qciState=null;
  function qciLocation(c){
    const tr=calleTramoDeCargaDirecta(c);
    return {
      inv:String(tr?.invId??c.invId??'').trim(),
      from:String(tr?.desde??c.calleDesde??'').trim(),
      to:String(tr?.hasta??c.calleHasta??'').trim()
    };
  }
  function qciInvOptions(current){
    const known=!!INV_LAYOUT[current.inv];
    let html=selectInv(known?current.inv:'');
    if(!known&&current.inv){
      html='<option value="__GS_ORIGINAL__" selected>Conservar ubicación GS · INV '+esc(current.inv)+'</option>'+
        html.replace('<option value="">— Seleccionar —</option>','');
    }
    return html;
  }
  function qciStreetOptions(inv,current){
    const layout=INV_LAYOUT[inv];
    const nums=layout?[...new Set([...layout.row1,...layout.row2])].sort((a,b)=>a-b):[];
    let html='<option value="">— Calle —</option>';
    if(current&& !nums.includes(Number(current)))
      html+='<option value="'+esc(current)+'" selected>'+esc(current)+' (GS)</option>';
    html+=nums.map(n=>'<option value="'+n+'"'+(String(n)===String(current)?' selected':'')+'>'+n+'</option>').join('');
    return html;
  }
  function qciSetError(message){
    const el=document.getElementById('qci-error');if(el)el.textContent=message;
  }
  async function showCargaInjerto(id){
    const line=controlChecksData.find(x=>x.id===id);
    if(!line||line.tipo!=='carga_injerto'){showToast('No se ha encontrado la línea de Carga Injerto.');return;}
    if(!['ADMIN','TECNICO','CARGADOR'].includes(currentUserRole)){showToast('No tienes permiso para editar esta partida.');return;}
    const original=qciLocation(line),known=!!INV_LAYOUT[original.inv];
    qciState={id,busy:false,original,invOption:known?original.inv:(original.inv?'__GS_ORIGINAL__':'')};
    const overlay=getOrCreateOverlay('control-editar-injerto-overlay');
    overlay.innerHTML='<div class="qc107-modal" role="dialog" aria-label="Editar partida Carga Injerto">'+
      '<h2>Editar partida · Carga Injerto</h2>'+
      '<section class="qc107-section"><h3>Datos GS</h3><div class="qc107-grid">'+
      field('Fecha y hora (no editable)','<input type="text" disabled value="'+esc(riegoDiaLabelCorto(line.dia)+' · '+(line.hora||''))+'">')+
      field('Nº de partida','<input id="qci-partida" type="text" maxlength="100" value="'+esc(line.partida)+'">')+
      field('Cliente','<input id="qci-cliente" type="text" maxlength="180" value="'+esc(line.cliente)+'">')+
      field('Variedad','<input id="qci-variedad" type="text" maxlength="180" value="'+esc(line.variedad)+'">')+
      field('Bandejas','<input id="qci-bandejas" type="number" min="1" step="1" value="'+esc(line.numBandejas)+'">')+
      '</div></section><section class="qc107-section"><h3>Ubicación corregida en APP</h3>'+
      '<div class="qc107-location-current">Actual: '+esc(controlQCInfoVisual(line).inv)+' · Calle '+esc(controlQCInfoVisual(line).calles)+'</div>'+
      '<div class="qc107-grid">'+
      field('Invernadero','<select id="qci-inv" onchange="qciCambiarInv()">'+qciInvOptions(original)+'</select>')+
      field('Calle desde','<select id="qci-from">'+qciStreetOptions(original.inv,original.from)+'</select>')+
      field('Calle hasta','<select id="qci-to">'+qciStreetOptions(original.inv,original.to)+'</select>')+
      '</div><p class="qc107-note">La corrección queda en ViguerAPP; no modifica GS. La fecha y hora originales se conservan.</p>'+
      '</section><div id="qci-error" role="alert"></div>'+
      '<div class="qc107-actions"><button type="button" class="qc107-cancel" onclick="qciCancelar()">Cancelar</button>'+
      '<button type="button" id="qci-save" class="qc107-save" onclick="qciGuardar()">Guardar</button></div></div>';
    overlay.style.display='flex';
    if(qciState.invOption==='__GS_ORIGINAL__'){
      document.getElementById('qci-from').disabled=true;
      document.getElementById('qci-to').disabled=true;
    }
  }
  root.qciCambiarInv=function(){
    if(!qciState)return;
    const inv=read('qci-inv'),from=document.getElementById('qci-from'),to=document.getElementById('qci-to');
    if(inv==='__GS_ORIGINAL__'){
      if(from){from.disabled=true;from.innerHTML=qciStreetOptions(qciState.original.inv,qciState.original.from);}
      if(to){to.disabled=true;to.innerHTML=qciStreetOptions(qciState.original.inv,qciState.original.to);}
      return;
    }
    if(from){from.disabled=false;from.innerHTML=qciStreetOptions(inv,'');}
    if(to){to.disabled=false;to.innerHTML=qciStreetOptions(inv,'');}
  };
  root.qciCancelar=function(){
    const overlay=document.getElementById('control-editar-injerto-overlay');
    if(overlay)overlay.style.display='none';
    qciState=null;
  };
  root.qciGuardar=async function(){
    const state=qciState;if(!state||state.busy)return false;
    const line=controlChecksData.find(x=>x.id===state.id);
    if(!line||line.tipo!=='carga_injerto')return false;
    const fail=message=>{qciSetError(message);return false;};
    const partida=read('qci-partida').trim().toUpperCase();
    if(!/^[A-Za-z0-9._-]{1,100}$/.test(partida))return fail('Nº de partida no válido.');
    const bandejas=Number(read('qci-bandejas'));
    if(!Number.isSafeInteger(bandejas)||bandejas<=0)return fail('Indica bandejas enteras positivas.');
    const cliente=read('qci-cliente').trim(),variedad=read('qci-variedad').trim();
    if(cliente.length>180||variedad.length>180)return fail('Cliente o variedad superan el máximo permitido.');
    const selectedInv=read('qci-inv');
    let location;
    if(selectedInv==='__GS_ORIGINAL__'){
      location={invId:String(line.invId??''),calleDesde:line.calleDesde??null,calleHasta:line.calleHasta??null};
    }else if(!selectedInv&&!state.original.inv){
      location={invId:'',calleDesde:null,calleHasta:null};
    }else{
      const from=read('qci-from'),to=read('qci-to'),layout=INV_LAYOUT[selectedInv];
      if(!layout||!from||!to)return fail('Indica un invernadero y ambas calles.');
      const allowed=[...layout.row1,...layout.row2],a=Number(from),b=Number(to);
      if(!Number.isInteger(a)||!Number.isInteger(b)||!allowed.includes(a)||!allowed.includes(b))
        return fail('Las calles no pertenecen al invernadero.');
      location={invId:selectedInv,calleDesde:Math.min(a,b),calleHasta:Math.max(a,b)};
    }
    const target=location.invId&&location.calleDesde!==null&&location.calleHasta!==null
      ?{invId:String(location.invId),desde:Number(location.calleDesde),hasta:Number(location.calleHasta)}:null;
    if(controlChecksData.some(other=>{
      if(other.id===line.id||other.tipo!=='carga_injerto'||other.dia!==line.dia||
         String(other.partida||'').trim().toUpperCase()!==partida||!target)return false;
      const t=calleTramoDeCargaDirecta(other);
      return t&&String(t.invId)===target.invId&&t.desde===target.desde&&t.hasta===target.hasta;
    }))return fail('Ya existe otra línea con la misma partida, fecha y ubicación.');
    const fields={partida,cliente,variedad,numBandejas:bandejas,
      invId:String(location.invId||''),calleDesde:location.calleDesde,calleHasta:location.calleHasta};
    const edit={actualizadoPor:String(currentUser||''),actualizadoEn:new Date().toISOString(),campos:fields};
    state.busy=true;const button=document.getElementById('qci-save');if(button)button.disabled=true;
    try{
      const ok=await root.aplicarEditarControlCargaInjerto(line.id,edit);
      if(ok){qciCancelar();return true;}
      return fail('Cambios guardados localmente o pendientes. Comprueba la sincronización antes de repetir.');
    }catch(e){return fail('No se ha podido guardar la corrección.');}
    finally{state.busy=false;if(button&&button.isConnected)button.disabled=false;}
  };
  root.aplicarEditarControlCargaInjerto=async function(id,edit){
    const line=controlChecksData.find(x=>x.id===id);
    const fields=edit&&edit.campos;
    if(!line||line.tipo!=='carga_injerto'||!fields)return false;
    const qid=encolarAccionOffline('aplicarEditarControlCargaInjerto',[id,edit]);
    line.partida=fields.partida;line.cliente=fields.cliente;line.variedad=fields.variedad;
    line.clienteVariedad=fields.cliente;line.numBandejas=fields.numBandejas;
    line.invId=fields.invId;line.calleDesde=fields.calleDesde;line.calleHasta=fields.calleHasta;
    line.invernadero=fields.invId&&fields.calleDesde!==null&&fields.calleHasta!==null
      ?fields.invId+'-'+fields.calleDesde+'-'+fields.calleHasta:'';
    line.edicionQC=edit;
    renderControlContent(document.getElementById('control-overlay'));
    marcarControlCheckSucio(id);
    const ok=await persistControlChecksData();
    if(ok)desencolarAccion(qid);else avisarGuardadoLocalPendiente(leerColaOffline().length);
    return ok;
  };

  // Preinjerto Patrón reutiliza el mismo modal/flujo del editor de Túnel.
  // Los códigos PAR_CAS/PAR_UBIC se editan como valores GS sin traducirlos
  // a un nombre de invernadero ni alterar las fechas de origen.
  let qcpState=null;
  function qcpRaw(line,key){return line?.[key]??line?.gsDetalles?.[key]??'';}
  function qcpOverlay(){
    return getOrCreateOverlay('control-editar-overlay');
  }
  function qcpSetError(message){
    const el=document.getElementById('qcp-error');if(el)el.textContent=message;
  }
  async function showPreinjertoPatron(id){
    const line=controlChecksData.find(x=>x.id===id);
    if(!line||line.tipo!=='preinjerto_patron'){showToast('No se ha encontrado la partida de Preinjerto Patrón.');return;}
    if(!['ADMIN','TECNICO'].includes(currentUserRole)){showToast('No tienes permiso para editar esta partida.');return;}
    qcpState={id,busy:false};
    const overlay=qcpOverlay();
    overlay.innerHTML='<div class="qc107-modal" role="dialog" aria-label="Editar Preinjerto Patrón">'+
      '<h2>Editar partida · Preinjerto Patrón</h2>'+
      '<section class="qc107-section"><h3>Datos GS</h3><div class="qc107-grid">'+
      field('Fechas de origen (no editables)','<input type="text" disabled value="'+esc((line.fSiembra||'—')+' · Entrega '+(line.fEntrega||'—'))+'">')+
      field('Nº de partida','<input id="qcp-partida" type="text" maxlength="100" value="'+esc(line.partida)+'">')+
      field('Cliente','<input id="qcp-cliente" type="text" maxlength="180" value="'+esc(line.cliente)+'">')+
      field('Variedad','<input id="qcp-variedad" type="text" maxlength="180" value="'+esc(line.variedad)+'">')+
      field('Bandejas','<input id="qcp-bandejas" type="number" min="1" step="1" value="'+esc(line.numBandejas)+'">')+
      '</div></section><section class="qc107-section"><h3>Ubicación registrada en GS</h3>'+
      '<div class="qc107-grid">'+
      field('PAR_CAS · código GS','<input id="qcp-par-cas" type="text" maxlength="20" value="'+esc(qcpRaw(line,'PAR_CAS'))+'">')+
      field('PAR_UBIC · ubicación GS','<input id="qcp-par-ubic" type="text" inputmode="numeric" maxlength="10" value="'+esc(qcpRaw(line,'PAR_UBIC'))+'">')+
      '</div><p class="qc107-note">Se guardará una corrección en ViguerAPP. No se modifica GS. Las fechas originales se conservan.</p>'+
      '</section><div id="qcp-error" role="alert"></div>'+
      '<div class="qc107-actions"><button type="button" class="qc107-cancel" onclick="qcpCancelar()">Cancelar</button>'+
      '<button type="button" id="qcp-save" class="qc107-save" onclick="qcpGuardar()">Guardar</button></div></div>';
    overlay.style.display='flex';
  }
  root.qcpCancelar=function(){
    const overlay=document.getElementById('control-editar-overlay');
    if(overlay)overlay.style.display='none';
    qcpState=null;
  };
  function qcpFields(line,withLocation){
    const partida=read('qcp-partida').trim().toUpperCase();
    if(!/^[A-Za-z0-9._-]{1,100}$/.test(partida))throw Error('Nº de partida no válido.');
    if(controlChecksData.some(x=>x.id!==line.id&&x.tipo===line.tipo&&x.dia===line.dia&&
       String(x.partida||'').toUpperCase()===partida))throw Error('Ya existe otra línea con esa partida y fecha.');
    const cliente=read('qcp-cliente').trim(),variedad=read('qcp-variedad').trim();
    if(cliente.length>180||variedad.length>180)throw Error('Cliente o variedad superan el máximo permitido.');
    const rawTrays=read('qcp-bandejas').trim();
    let numBandejas=null;
    if(rawTrays!==''){
      numBandejas=Number(rawTrays);
      if(!Number.isSafeInteger(numBandejas)||numBandejas<=0)throw Error('Bandejas debe ser un entero positivo o quedar vacío.');
    }
    const campos={partida,cliente,variedad,numBandejas};
    if(withLocation){
      const PAR_CAS=read('qcp-par-cas').trim();
      const raw=read('qcp-par-ubic').trim();
      if(PAR_CAS&&!/^[A-Za-z0-9_-]{1,20}$/.test(PAR_CAS))throw Error('PAR_CAS no es válido.');
      if(raw&&!/^(?:0|[1-9]\d{0,8})$/.test(raw))throw Error('PAR_UBIC debe ser un código numérico.');
      const PAR_UBIC=raw&&raw!=='0'?raw:'';
      campos.PAR_CAS=PAR_CAS;campos.PAR_UBIC=PAR_UBIC;
      campos.invId=PAR_CAS||null;
      campos.calleDesde=PAR_UBIC||null;campos.calleHasta=PAR_UBIC||null;
    }
    return campos;
  }
  async function applyPreinjertoPatron(line,campos){
    const edit={actualizadoPor:String(currentUser||''),actualizadoEn:new Date().toISOString(),campos};
    const qid=encolarAccionOffline('aplicarEditarControlPreinjertoPatron',[line.id,edit]);
    line.partida=campos.partida;line.cliente=campos.cliente;line.variedad=campos.variedad;
    line.clienteVariedad=campos.cliente+' — '+campos.variedad;
    line.numBandejas=campos.numBandejas;
    if(Object.prototype.hasOwnProperty.call(campos,'PAR_CAS')){
      line.PAR_CAS=campos.PAR_CAS;line.invId=campos.invId;
      line.PAR_UBIC=campos.PAR_UBIC;line.calleDesde=campos.calleDesde;line.calleHasta=campos.calleHasta;
      line.gsDetalles={...(line.gsDetalles||{}),PAR_CAS:campos.PAR_CAS||null,PAR_UBIC:campos.PAR_UBIC||null};
    }
    line.edicionQC=edit;
    renderControlContent(document.getElementById('control-overlay'));
    marcarControlCheckSucio(line.id);
    const ok=await persistControlChecksData();
    if(ok)desencolarAccion(qid);else avisarGuardadoLocalPendiente(leerColaOffline().length);
    return ok;
  }
  root.aplicarEditarControlPreinjertoPatron=async function(id,edit){
    const line=controlChecksData.find(x=>x.id===id),campos=edit?.campos;
    if(!line||line.tipo!=='preinjerto_patron'||!campos)return false;
    // Las acciones pendientes de red se reproducen con el mismo registro de cola;
    // no volver a encolar al reintentar desde el sincronizador offline.
    if(arguments.length>2)return false;
    return applyPreinjertoPatron(line,campos);
  };
  root.qcpGuardar=async function(){
    const state=qcpState;if(!state||state.busy)return false;
    const line=controlChecksData.find(x=>x.id===state.id);
    if(!line)return false;
    let campos;
    try{campos=qcpFields(line,true);}
    catch(error){qcpSetError(error.message);return false;}
    state.busy=true;const button=document.getElementById('qcp-save');if(button)button.disabled=true;
    try{
      const ok=await applyPreinjertoPatron(line,campos);
      if(ok)root.qcpCancelar();
      else qcpSetError('Corrección guardada localmente o pendiente de sincronizar.');
      return ok;
    }catch(_){qcpSetError('No se ha podido guardar la corrección.');return false;}
    finally{state.busy=false;if(button&&button.isConnected)button.disabled=false;}
  };
  async function showPreinjertoPatronUbicacion(id){
    const line=controlChecksData.find(x=>x.id===id);
    if(!line||line.tipo!=='preinjerto_patron')return false;
    if(!['ADMIN','TECNICO'].includes(currentUserRole)){showToast('No tienes permiso para editar esta ubicación.');return false;}
    qcpState={id,busy:false,locationOnly:true};
    const overlay=getOrCreateOverlay('control-calle-overlay');
    overlay.innerHTML='<div class="qc107-modal" role="dialog" aria-label="Editar ubicación Preinjerto Patrón">'+
      '<h2>Editar ubicación GS · Preinjerto Patrón</h2>'+
      '<section class="qc107-section"><h3>Códigos de origen</h3><div class="qc107-grid">'+
      field('PAR_CAS · código GS','<input id="qcp-par-cas" type="text" maxlength="20" value="'+esc(qcpRaw(line,'PAR_CAS'))+'">')+
      field('PAR_UBIC · ubicación GS','<input id="qcp-par-ubic" type="text" inputmode="numeric" maxlength="10" value="'+esc(qcpRaw(line,'PAR_UBIC'))+'">')+
      '</div><p class="qc107-note">Mantiene los códigos GS tal como se reciben; no traduce PAR_CAS a un invernadero físico.</p></section>'+
      '<div id="qcp-error" role="alert"></div><div class="qc107-actions">'+
      '<button type="button" class="qc107-cancel" onclick="qcpCancelarUbicacion()">Cancelar</button>'+
      '<button type="button" id="qcp-save" class="qc107-save" onclick="qcpGuardarUbicacion()">Guardar</button></div></div>';
    overlay.style.display='flex';return true;
  }
  root.qcpCancelarUbicacion=function(){
    const overlay=document.getElementById('control-calle-overlay');
    if(overlay)overlay.style.display='none';
    qcpState=null;
  };
  root.qcpGuardarUbicacion=async function(){
    const state=qcpState;if(!state||!state.locationOnly||state.busy)return false;
    const line=controlChecksData.find(x=>x.id===state.id);if(!line)return false;
    let campos;
    try{
      const PAR_CAS=read('qcp-par-cas').trim(),raw=read('qcp-par-ubic').trim();
      if(PAR_CAS&&!/^[A-Za-z0-9_-]{1,20}$/.test(PAR_CAS))throw Error('PAR_CAS no es válido.');
      if(raw&&!/^(?:0|[1-9]\d{0,8})$/.test(raw))throw Error('PAR_UBIC debe ser un código numérico.');
      const PAR_UBIC=raw&&raw!=='0'?raw:'';
      campos={PAR_CAS,PAR_UBIC,invId:PAR_CAS||null,calleDesde:PAR_UBIC||null,calleHasta:PAR_UBIC||null};
    }catch(error){qcpSetError(error.message);return false;}
    state.busy=true;const button=document.getElementById('qcp-save');if(button)button.disabled=true;
    try{
      const ok=await applyPreinjertoPatron(line,campos);
      if(ok)root.qcpCancelarUbicacion();
      else qcpSetError('Corrección guardada localmente o pendiente de sincronizar.');
      return ok;
    }catch(_){qcpSetError('No se ha podido guardar la ubicación.');return false;}
    finally{state.busy=false;if(button&&button.isConnected)button.disabled=false;}
  };
  const originalAssignLocation=root.mostrarAsignarCalleControl;
  root.mostrarAsignarCalleControl=function(id){
    const line=controlChecksData.find(x=>x.id===id);
    if(line?.tipo==='preinjerto_patron')return showPreinjertoPatronUbicacion(id);
    return originalAssignLocation?.(id);
  };

  root.mostrarEditarControlCargaInjerto=showCargaInjerto;

})(window);
