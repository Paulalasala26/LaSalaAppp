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
    if(c&&['preinjerto_patron','preinjerto_variedad'].includes(c.tipo))return showPreinjerto(id);
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
      html='<option value="__KEEP_CURRENT__" selected>Mantener ubicación actual · INV '+esc(current.inv)+'</option>'+
        html.replace('<option value="">— Seleccionar —</option>','');
    }
    return html;
  }
  function qciStreetOptions(inv,current){
    const layout=INV_LAYOUT[inv];
    const nums=layout?[...new Set([...layout.row1,...layout.row2])].sort((a,b)=>a-b):[];
    let html='<option value="">— Calle —</option>';
    if(current&& !nums.includes(Number(current)))
      html+='<option value="'+esc(current)+'" selected>'+esc(current)+' (actual)</option>';
    html+=nums.map(n=>'<option value="'+n+'"'+(String(n)===String(current)?' selected':'')+'>'+n+'</option>').join('');
    return html;
  }
  function qciGSLocationHTML(line){
    const gs=line.gsDetalles&&typeof line.gsDetalles==='object'?line.gsDetalles:{};
    const edited=!!line.edicionQC?.campos;
    const greenhouse=String(gs.invernadero||gs.invernaderoNombre||(!edited?line.invernadero:'')||'').trim();
    const greenhouseId=String(gs.idInvernadero??(!edited?line.invId:'')??'').trim();
    const from=String(gs.ubicacionDesde??(!edited?line.calleDesde:'')??'').trim();
    const to=String(gs.ubicacionHasta??(!edited?line.calleHasta:'')??'').trim();
    const values=greenhouse||greenhouseId||from||to;
    if(!values)return '<section class="qc107-section"><h3>Ubicación recibida de GS</h3><p class="qc107-note">Esta línea no trae una ubicación de origen en los datos disponibles de GS.</p></section>';
    return '<section class="qc107-section"><h3>Ubicación recibida de GS</h3><div class="qc107-grid">'+
      field('Invernadero · GS','<input type="text" disabled value="'+esc(greenhouse||greenhouseId)+'">')+
      field('Calle desde · GS','<input type="text" disabled value="'+esc(from)+'">')+
      field('Calle hasta · GS','<input type="text" disabled value="'+esc(to)+'">')+
      '</div><p class="qc107-note">Origen de los datos. La ubicación efectiva en ViguerAPP se configura abajo.</p></section>';
  }
  function qciSetError(message){
    const el=document.getElementById('qci-error');if(el)el.textContent=message;
  }
  async function showCargaInjerto(id){
    const line=controlChecksData.find(x=>x.id===id);
    if(!line||line.tipo!=='carga_injerto'){showToast('No se ha encontrado la línea de Carga Injerto.');return;}
    if(!['ADMIN','TECNICO','CARGADOR'].includes(currentUserRole)){showToast('No tienes permiso para editar esta partida.');return;}
    const original=qciLocation(line),known=!!INV_LAYOUT[original.inv];
    qciState={id,busy:false,original,invOption:known?original.inv:(original.inv?'__KEEP_CURRENT__':'')};
    const overlay=getOrCreateOverlay('control-editar-injerto-overlay');
    overlay.innerHTML='<div class="qc107-modal" role="dialog" aria-label="Editar partida Carga Injerto">'+
      '<h2>Editar partida · Carga Injerto</h2>'+
      '<section class="qc107-section"><h3>Datos de la partida</h3><div class="qc107-grid">'+
      field('Fecha y hora (no editable)','<input type="text" disabled value="'+esc(riegoDiaLabelCorto(line.dia)+' · '+(line.hora||''))+'">')+
      field('Nº de partida','<input id="qci-partida" type="text" maxlength="100" value="'+esc(line.partida)+'">')+
      field('Cliente','<input id="qci-cliente" type="text" maxlength="180" value="'+esc(line.cliente)+'">')+
      field('Variedad','<input id="qci-variedad" type="text" maxlength="180" value="'+esc(line.variedad)+'">')+
      field('Bandejas','<input id="qci-bandejas" type="number" min="1" step="1" value="'+esc(line.numBandejas)+'">')+
      '</div></section>'+qciGSLocationHTML(line)+'<section class="qc107-section"><h3>Ubicación en ViguerAPP</h3>'+
      '<div class="qc107-location-current">Ubicación actual: '+esc(original.inv?('INV '+original.inv):'Sin invernadero')+' · '+
      esc(original.from?(original.from===original.to?'Calle '+original.from:'Calles '+original.from+'–'+original.to):'Sin calles asignadas')+'</div>'+
      '<p class="qc107-note">Es la ubicación física que utiliza la app para esta partida.</p>'+
      '<div class="qc107-grid">'+
      field('Invernadero','<select id="qci-inv" onchange="qciCambiarInv()">'+qciInvOptions(original)+'</select>')+
      field('Calle desde','<select id="qci-from">'+qciStreetOptions(original.inv,original.from)+'</select>')+
      field('Calle hasta','<select id="qci-to">'+qciStreetOptions(original.inv,original.to)+'</select>')+
      '</div>'+
      '</section><div id="qci-error" role="alert"></div>'+
      '<div class="qc107-actions"><button type="button" class="qc107-cancel" onclick="qciCancelar()">Cancelar</button>'+
      '<button type="button" id="qci-save" class="qc107-save" onclick="qciGuardar()">Guardar</button></div></div>';
    overlay.style.display='flex';
    if(qciState.invOption==='__KEEP_CURRENT__'){
      document.getElementById('qci-from').disabled=true;
      document.getElementById('qci-to').disabled=true;
    }
  }
  root.qciCambiarInv=function(){
    if(!qciState)return;
    const inv=read('qci-inv'),from=document.getElementById('qci-from'),to=document.getElementById('qci-to');
    if(inv==='__KEEP_CURRENT__'){
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
    if(selectedInv==='__KEEP_CURRENT__'){
      location={invId:String(line.invId??''),calleDesde:line.calleDesde??null,calleHasta:line.calleHasta??null};
    }else if(!selectedInv){
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
    if(!line.edicionQC){
      const source={...(line.gsDetalles||{})};
      if(!Object.prototype.hasOwnProperty.call(source,'idInvernadero'))source.idInvernadero=line.invId??'';
      if(!Object.prototype.hasOwnProperty.call(source,'invernadero'))source.invernadero=line.invernadero??'';
      if(!Object.prototype.hasOwnProperty.call(source,'ubicacionDesde'))source.ubicacionDesde=line.calleDesde??null;
      if(!Object.prototype.hasOwnProperty.call(source,'ubicacionHasta'))source.ubicacionHasta=line.calleHasta??null;
      line.gsDetalles=source;
    }
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

  // Preinjerto mantiene separados los datos originales GS y la ubicación
  // física efectiva en la app. PAR_CAS/PAR_UBIC nunca se interpretan como
  // invernadero/calle sin una equivalencia validada.
  let qcpState=null;
  function qcpRaw(line,key){
    const details=line?.gsDetalles||{},correction=line?.edicionQC?.campos||{};
    if(Object.prototype.hasOwnProperty.call(details,key))return details[key]??'';
    if(Object.prototype.hasOwnProperty.call(correction,key))return '';
    return line?.[key]??'';
  }
  function qcpAppLocation(line){
    const correction=line?.edicionQC?.campos||{};
    const legacyRaw=Object.prototype.hasOwnProperty.call(correction,'PAR_CAS')||
      Object.prototype.hasOwnProperty.call(correction,'PAR_UBIC');
    if(!legacyRaw)return qciLocation(line);
    const locations=Array.isArray(line.gsDetalles?.ubicacionesGS)?line.gsDetalles.ubicacionesGS:[];
    if(locations.length!==1)return {inv:'',from:'',to:''};
    const location=locations[0]||{};
    return {inv:String(location.invId??'').trim(),from:String(location.desde??'').trim(),to:String(location.hasta??location.desde??'').trim()};
  }
  function qcpSourceLocationHTML(line){
    const locations=Array.isArray(line.gsDetalles?.ubicacionesGS)?line.gsDetalles.ubicacionesGS:
      (line.edicionQC?.campos&&(Object.prototype.hasOwnProperty.call(line.edicionQC.campos,'PAR_CAS')||
        Object.prototype.hasOwnProperty.call(line.edicionQC.campos,'PAR_UBIC'))?[]:
        line.gsDetalles&&Object.prototype.hasOwnProperty.call(line.gsDetalles,'ubicacionesGS')?[]:
        Array.isArray(line.ubicacionesGS)?line.ubicacionesGS:[]);
    const allocations=locations.map(location=>{
      const greenhouse=String(location?.invernadero||'').trim()||
        (location?.invId!=null?'INV '+String(location.invId).trim():'');
      const from=location?.desde==null?'':String(location.desde),to=location?.hasta==null?from:String(location.hasta);
      const streets=from?(from===to?'Calle '+esc(from):'Calles '+esc(from)+'–'+esc(to)):'Calles sin informar';
      return '<li>'+esc(greenhouse||'Invernadero sin informar')+' · '+streets+'</li>';
    }).join('');
    return '<section class="qc107-section"><h3>Ubicación recibida de GS</h3><div class="qc107-grid">'+
      field('PAR_CAS · código GS','<input type="text" disabled value="'+esc(qcpRaw(line,'PAR_CAS'))+'">')+
      field('PAR_UBIC · código GS','<input type="text" disabled value="'+esc(qcpRaw(line,'PAR_UBIC'))+'">')+
      '</div><p class="qc107-note">Son códigos de origen. Por sí solos no identifican el invernadero y la calle físicos.</p>'+ 
      '<div class="qc107-note"><strong>Ubicaciones físicas que GS aporta</strong>'+
      (allocations?'<ul>'+allocations+'</ul>':'<div>GS no ha devuelto una asignación física para esta partida.</div>')+
      '</div></section>';
  }
  function qcpLocationSection(line){
    const original=qcpAppLocation(line);
    return '<section class="qc107-section"><h3>Ubicación en ViguerAPP</h3>'+ 
      '<div class="qc107-location-current">Ubicación actual: '+esc(original.inv?('INV '+original.inv):'Sin invernadero')+
      ' · '+esc(original.from?(original.from===original.to?'Calle '+original.from:'Calles '+original.from+'–'+original.to):'Sin calles asignadas')+'</div>'+ 
      '<p class="qc107-note">Esta es la ubicación física que utiliza la app para la partida.</p><div class="qc107-grid">'+
      field('Invernadero','<select id="qcp-inv" onchange="qcpCambiarInv()">'+qciInvOptions(original)+'</select>')+
      field('Calle desde','<select id="qcp-from">'+qciStreetOptions(original.inv,original.from)+'</select>')+
      field('Calle hasta','<select id="qcp-to">'+qciStreetOptions(original.inv,original.to)+'</select>')+
      '</div></section>';
  }
  function qcpPrepareLocationControls(){
    if(qcpState?.invOption!=='__KEEP_CURRENT__')return;
    const from=document.getElementById('qcp-from'),to=document.getElementById('qcp-to');
    if(from)from.disabled=true;if(to)to.disabled=true;
  }
  root.qcpCambiarInv=function(){
    if(!qcpState)return;
    const inv=read('qcp-inv'),from=document.getElementById('qcp-from'),to=document.getElementById('qcp-to');
    if(inv==='__KEEP_CURRENT__'){
      if(from){from.disabled=true;from.innerHTML=qciStreetOptions(qcpState.original.inv,qcpState.original.from);}
      if(to){to.disabled=true;to.innerHTML=qciStreetOptions(qcpState.original.inv,qcpState.original.to);}
      return;
    }
    const keep=inv===qcpState.original.inv;
    if(from){from.disabled=false;from.innerHTML=qciStreetOptions(inv,keep?qcpState.original.from:'');}
    if(to){to.disabled=false;to.innerHTML=qciStreetOptions(inv,keep?qcpState.original.to:'');}
  };
  function qcpAppLocationFields(){
    const state=qcpState,selected=read('qcp-inv');
    if(selected==='__KEEP_CURRENT__')return {invId:state.original.inv||null,
      calleDesde:state.original.from||null,calleHasta:state.original.to||null};
    if(!selected)return {invId:null,calleDesde:null,calleHasta:null};
    const from=read('qcp-from'),to=read('qcp-to'),layout=INV_LAYOUT[selected];
    if(!layout||!from||!to)throw Error('Indica un invernadero y ambas calles.');
    const allowed=[...layout.row1,...layout.row2],a=Number(from),b=Number(to);
    if(!Number.isInteger(a)||!Number.isInteger(b)||!allowed.includes(a)||!allowed.includes(b))
      throw Error('Las calles no pertenecen al invernadero.');
    return {invId:selected,calleDesde:Math.min(a,b),calleHasta:Math.max(a,b)};
  }
  function qcpOverlay(){
    return getOrCreateOverlay('control-editar-overlay');
  }
  function qcpSetError(message){
    const el=document.getElementById('qcp-error');if(el)el.textContent=message;
  }
  async function showPreinjerto(id){
    const line=controlChecksData.find(x=>x.id===id);
    if(!line||!['preinjerto_patron','preinjerto_variedad'].includes(line.tipo)){showToast('No se ha encontrado la partida de Preinjerto.');return;}
    const label=line.tipo==='preinjerto_patron'?'Preinjerto Patrón':'Preinjerto Variedad';
    if(!['ADMIN','TECNICO'].includes(currentUserRole)){showToast('No tienes permiso para editar esta partida.');return;}
    const original=qcpAppLocation(line),known=!!INV_LAYOUT[original.inv];
    qcpState={id,busy:false,original,invOption:known?original.inv:(original.inv?'__KEEP_CURRENT__':'')};
    const overlay=qcpOverlay();
    overlay.innerHTML='<div class="qc107-modal" role="dialog" aria-label="Editar '+label+'">'+
      '<h2>Editar partida · '+label+'</h2>'+
      '<section class="qc107-section"><h3>Datos de la partida</h3><div class="qc107-grid">'+
      field('Fechas de origen (no editables)','<input type="text" disabled value="'+esc((line.fSiembra||'—')+' · Entrega '+(line.fEntrega||'—'))+'">')+
      field('Nº de partida','<input id="qcp-partida" type="text" maxlength="100" value="'+esc(line.partida)+'">')+
      field('Cliente','<input id="qcp-cliente" type="text" maxlength="180" value="'+esc(line.cliente)+'">')+
      field('Variedad','<input id="qcp-variedad" type="text" maxlength="180" value="'+esc(line.variedad)+'">')+
      field('Bandejas','<input id="qcp-bandejas" type="number" min="1" step="1" value="'+esc(line.numBandejas)+'">')+
      '</div></section>'+qcpSourceLocationHTML(line)+qcpLocationSection(line)+
      '<div id="qcp-error" role="alert"></div>'+
      '<div class="qc107-actions"><button type="button" class="qc107-cancel" onclick="qcpCancelar()">Cancelar</button>'+
      '<button type="button" id="qcp-save" class="qc107-save" onclick="qcpGuardar()">Guardar</button></div></div>';
    overlay.style.display='flex';
    qcpPrepareLocationControls();
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
    if(withLocation)Object.assign(campos,qcpAppLocationFields());
    return campos;
  }
  async function applyPreinjerto(line,campos){
    const prior={...(line.edicionQC?.campos&&typeof line.edicionQC.campos==='object'?line.edicionQC.campos:{})};
    const legacyRawLocation=Object.prototype.hasOwnProperty.call(prior,'PAR_CAS')||
      Object.prototype.hasOwnProperty.call(prior,'PAR_UBIC');
    delete prior.PAR_CAS;delete prior.PAR_UBIC;
    if(legacyRawLocation){delete prior.invId;delete prior.calleDesde;delete prior.calleHasta;}
    const allFields={...prior,...campos};
    const edit={actualizadoPor:String(currentUser||''),actualizadoEn:new Date().toISOString(),campos:allFields};
    const qid=encolarAccionOffline('aplicarEditarControlPreinjerto',[line.id,edit]);
    for(const key of ['partida','cliente','variedad','numBandejas']){
      if(Object.prototype.hasOwnProperty.call(allFields,key))line[key]=allFields[key];
    }
    if(Object.prototype.hasOwnProperty.call(allFields,'cliente')||Object.prototype.hasOwnProperty.call(allFields,'variedad')){
      const customer=String(line.cliente||''),variety=String(line.variedad||'');
      line.clienteVariedad=variety?customer+' — '+variety:customer;
    }
    if(['invId','calleDesde','calleHasta'].some(key=>Object.prototype.hasOwnProperty.call(allFields,key))){
      line.invId=allFields.invId||null;
      line.calleDesde=allFields.calleDesde??null;line.calleHasta=allFields.calleHasta??null;
    }
    line.edicionQC=edit;
    renderControlContent(document.getElementById('control-overlay'));
    marcarControlCheckSucio(line.id);
    const ok=await persistControlChecksData();
    if(ok)desencolarAccion(qid);else avisarGuardadoLocalPendiente(leerColaOffline().length);
    return ok;
  }
  root.aplicarEditarControlPreinjerto=async function(id,edit){
    const line=controlChecksData.find(x=>x.id===id),campos=edit?.campos;
    if(!line||!['preinjerto_patron','preinjerto_variedad'].includes(line.tipo)||!campos)return false;
    // Las acciones pendientes de red se reproducen con el mismo registro de cola;
    // no volver a encolar al reintentar desde el sincronizador offline.
    if(arguments.length>2)return false;
    return applyPreinjerto(line,campos);
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
      const ok=await applyPreinjerto(line,campos);
      if(ok)root.qcpCancelar();
      else qcpSetError('Corrección guardada localmente o pendiente de sincronizar.');
      return ok;
    }catch(_){qcpSetError('No se ha podido guardar la corrección.');return false;}
    finally{state.busy=false;if(button&&button.isConnected)button.disabled=false;}
  };
  async function showPreinjertoUbicacion(id){
    const line=controlChecksData.find(x=>x.id===id);
    if(!line||!['preinjerto_patron','preinjerto_variedad'].includes(line.tipo))return false;
    const label=line.tipo==='preinjerto_patron'?'Preinjerto Patrón':'Preinjerto Variedad';
    if(!['ADMIN','TECNICO'].includes(currentUserRole)){showToast('No tienes permiso para editar esta ubicación.');return false;}
    const original=qcpAppLocation(line),known=!!INV_LAYOUT[original.inv];
    qcpState={id,busy:false,locationOnly:true,original,invOption:known?original.inv:(original.inv?'__KEEP_CURRENT__':'')};
    const overlay=getOrCreateOverlay('control-calle-overlay');
    overlay.innerHTML='<div class="qc107-modal" role="dialog" aria-label="Editar ubicación '+label+'">'+
      '<h2>Editar ubicación · '+label+'</h2>'+qcpLocationSection(line)+
      '<div id="qcp-error" role="alert"></div><div class="qc107-actions">'+
      '<button type="button" class="qc107-cancel" onclick="qcpCancelarUbicacion()">Cancelar</button>'+
      '<button type="button" id="qcp-save" class="qc107-save" onclick="qcpGuardarUbicacion()">Guardar</button></div></div>';
    overlay.style.display='flex';qcpPrepareLocationControls();return true;
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
    try{campos=qcpAppLocationFields();}
    catch(error){qcpSetError(error.message);return false;}
    state.busy=true;const button=document.getElementById('qcp-save');if(button)button.disabled=true;
    try{
      const ok=await applyPreinjerto(line,campos);
      if(ok)root.qcpCancelarUbicacion();
      else qcpSetError('Corrección guardada localmente o pendiente de sincronizar.');
      return ok;
    }catch(_){qcpSetError('No se ha podido guardar la ubicación.');return false;}
    finally{state.busy=false;if(button&&button.isConnected)button.disabled=false;}
  };
  const originalAssignLocation=root.mostrarAsignarCalleControl;
  root.mostrarAsignarCalleControl=function(id){
    const line=controlChecksData.find(x=>x.id===id);
    if(line&&['preinjerto_patron','preinjerto_variedad'].includes(line.tipo))return showPreinjertoUbicacion(id);
    return originalAssignLocation?.(id);
  };

  root.aplicarEditarControlPreinjertoPatron=root.aplicarEditarControlPreinjerto;
  if(typeof ACCIONES_OFFLINE_REPLAYABLES==='object'){
    ACCIONES_OFFLINE_REPLAYABLES.aplicarEditarControlPreinjerto=root.aplicarEditarControlPreinjerto;
    ACCIONES_OFFLINE_REPLAYABLES.aplicarEditarControlPreinjertoPatron=root.aplicarEditarControlPreinjerto;
  }
  root.mostrarEditarControlCargaInjerto=showCargaInjerto;

})(window);
