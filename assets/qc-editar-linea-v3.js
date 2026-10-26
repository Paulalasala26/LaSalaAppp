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
})(window);
