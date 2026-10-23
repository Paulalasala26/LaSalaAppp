'use strict';
/* Captura cuantitativa operativa: separada de la escritura histórica y sin cola offline ficticia. */
(function(){
  const API='/api/admin-qc-mediciones';
  const AUTH='lasala-firebase-auth-v1';
  const API_KEY='AIzaSyDdDdMg6M1jVIssvGYKsdRA-mRug31Yt_g';
  const CATS=[
    ['color','Color',[['verde','Verde'],['amarillo','Amarillo'],['verdeClaro','Verde claro'],['ok','OK']]],
    ['tamano','Tamaño',[['grande','Grande'],['pequeno','Pequeño'],['ok','OK']]],
    ['sanidad','Sanidad',[['ok','OK'],['enferma','Enferma']]],
    ['flores','Flores',[['ok','Ok'],['si','Con flores']]],
    ['raices','Raíces',[['pocaRaiz','Poca raíz'],['raizVariedad','Raíz en variedad'],['ok','OK']]]
  ];
  CATS.forEach(cat=>cat[2].push(['noEvaluada','No evaluada']));
  function categoryIssue(category,values,total){
    const notEvaluated=values.noEvaluada||0;
    if(category!=='raices'){
      const sum=Object.values(values).reduce((a,b)=>a+b,0);
      if(sum!==total)return sum<total?'Faltan '+(total-sum)+' bandejas.':'Sobran '+(sum-total)+' bandejas.';
      return '';
    }
    // Los dos defectos de raíces pueden coexistir en una bandeja.
    // OK y No evaluada no se solapan con bandejas defectuosas.
    const evaluated=total-notEvaluated,ok=values.ok||0;
    if(ok>evaluated)return 'OK supera las evaluadas en '+(ok-evaluated)+' bandejas.';
    const affected=evaluated-ok;
    const low=values.pocaRaiz||0,inVariety=values.raizVariedad||0;
    const minimum=Math.max(low,inVariety),maximum=low+inVariety;
    if(affected<minimum)return 'Sobran '+(minimum-affected)+' bandejas con defectos respecto a las evaluadas.';
    if(affected>maximum)return 'Faltan '+(affected-maximum)+' bandejas por clasificar.';
    return '';
  }
  let active=null,sequence=0,writing=false,version=0,record=null,original='',lastTotal=null;
  let savedMeasurement=null,currentRules=null,observer=null,loading=false,legacyApi=null,notesPending=null,switchingRecord=false;
  // Guardado confirmado mientras continúa abierta la ficha.
  let savedForList=null;
  function controlButton(){
    const root=document.getElementById('control-overlay');
    if(!root||!record)return null;
    const expected="abrirMedicionesControl('"+record.id+"')";
    const anchor=Array.from(root.querySelectorAll('[data-qco-anchor]'))
      .find(a=>a.dataset.qcoAnchor===record.id);
    return anchor||Array.from(root.querySelectorAll('button[onclick]'))
      .find(b=>b.getAttribute('onclick')===expected)||null;
  }
  // Mantener una sola presentación de las opciones en las tarjetas clásicas.
  // Los inputs visibles son un reflejo de la medición, no modifican los checks
  // históricos ni generan operaciones de escritura independientes.
  function embedAmounts(){active?.classList.remove('qco-merged');}
  function showCardExtras(show){
    if(!record)return;
    const root=document.getElementById('control-overlay');
    root?.querySelectorAll('[data-qc-legacy-extras]').forEach(el=>{
      if(el.dataset.qcLegacyExtras===record.id)
        el.classList.toggle('qco-original-hidden',!show);
    });
    if(show){
      const input=root?.querySelector('[data-qc-legacy-extras="'+record.id+'"] input[onchange^="guardarControlObservaciones"]');
      if(input&&legacyApi?.getObservations)input.value=String(legacyApi.getObservations()??'');
    }
  }
  function refreshPhoto(){
    if(!active||!record)return;
    const area=active.querySelector('.qco-photo-area');
    if(!area)return;
    const image=area.querySelector('img'),label=area.querySelector('.qco-photo-action-text');
    const source=legacyApi?.photoPreview?.()||'';
    image.hidden=!source;
    if(source)image.src=source;else image.removeAttribute('src');
    label.textContent=source?'Cambiar foto':'Añadir foto';
  }
  function notesChanged(){
    const field=active?.querySelector('.qco-notes input');
    return !!(field&&legacyApi&&
      field.value!==String(legacyApi.getObservations?.()??''));
  }
  function persistNotes(){
    if(notesPending)return notesPending;
    const editor=active,context=legacyApi;
    const field=editor?.querySelector('.qco-notes input');
    if(!field||!context||!notesChanged())return Promise.resolve(true);
    const value=field.value;
    field.disabled=true;
    const promise=Promise.resolve().then(()=>context.saveObservations(value))
      .then(synced=>{
        if(editor===active&&synced===false)
          report('Observaciones pendientes de sincronizar.','');
        return true; // La cola histórica conserva el cambio si no hay conexión.
      })
      .catch(()=>{
        if(editor===active)
          report('No se han podido confirmar las observaciones. Inténtalo de nuevo.','error');
        return false;
      })
      .finally(()=>{
        if(editor===active)field.disabled=false;
        if(notesPending===promise)notesPending=null;
      });
    notesPending=promise;
    return promise;
  }
  async function settleNotes(){
    if(notesPending&&!(await notesPending))return false;
    return notesChanged()?persistNotes():true;
  }
  function mount(){
    if(!active)return;
    const button=controlButton();
    if(button){
      active.classList.remove('qco-floating');
      if(button.hasAttribute('data-qco-anchor'))button.insertAdjacentElement('afterend',active);
      else button.parentElement.insertAdjacentElement('afterend',active);
      if(button.tagName==='BUTTON')button.setAttribute('aria-expanded','true');
      showCardExtras(false);
      refreshPhoto();
      embedAmounts();
    }else{
      // Un repintado automático puede retirar temporalmente la ficha.
      // No cerrar el editor ni descartar su contexto por ese motivo.
      active.classList.remove('qco-merged');
      active.classList.add('qco-floating');
      if(active.parentElement!==document.body)document.body.append(active);
    }
  }
  function observeControl(){
    if(observer)observer.disconnect();
    const root=document.getElementById('control-overlay');
    if(!root)return;
    observer=new MutationObserver(()=>{
      if(active&&(!active.isConnected||(active.classList.contains('qco-floating')&&controlButton())))mount();
    });
    observer.observe(root,{childList:true,subtree:true});
  }
  const node=(tag,txt,cls)=>{
    const n=document.createElement(tag);
    if(txt!==null&&txt!==undefined)n.textContent=String(txt);
    if(cls)n.className=cls;
    return n;
  };
  function report(msg,type){
    const box=active?.querySelector('.qco-feedback');
    if(!box)return;
    box.hidden=!msg;box.className='qco-feedback'+(type?' '+type:'');
    box.textContent=msg||'';
  }
  function strCount(value){
    const text=String(value??'').trim();
    if(!/^\d+$/.test(text))return null;
    const n=Number(text);
    return Number.isSafeInteger(n)&&n>=1&&n<=10000000?n:null;
  }
  function snapshot(){
    if(!active)return null;
    const out={bandejasInspeccionadas:active.querySelector('.qco-total input').value,categorias:{}};
    for(const [cat] of CATS){
      const wrap=active.querySelector('[data-qco-cat="'+cat+'"]');
      out.categorias[cat]={opciones:Array.from(wrap.querySelectorAll('input[type="checkbox"]:checked')).map(x=>x.value),porcentajeInvalidas:Number(wrap.querySelector('.qco-percent').value)};
    }
    return out;
  }
  function changed(){return original!==JSON.stringify(snapshot())}
  function close(force=false){
    if(writing)return false;
    const quantitiesAtRequest=JSON.stringify(snapshot());
    if(!force&&active&&changed()&&!confirm('Hay cantidades sin guardar. ¿Salir sin guardar?'))return false;
    if(notesPending||notesChanged()){
      const editor=active;
      report('Guardando observaciones…','');
      void settleNotes().then(ok=>{
        if(ok&&active===editor){
          close(JSON.stringify(snapshot())===quantitiesAtRequest);
        }
      });
      return false;
    }
    const previous=active,button=controlButton(),refreshRef=savedForList;
    showCardExtras(true);
    sequence++;active=null;record=null;original='';lastTotal=null;loading=false;
    savedMeasurement=null;currentRules=null;legacyApi=null;savedForList=null;
    if(observer){observer.disconnect();observer=null;}
    if(button)button.setAttribute('aria-expanded','false');
    document.querySelectorAll('#control-overlay .qco-live-control, #control-overlay .qco-live-slot, #control-overlay .qco-live-balance').forEach(x=>x.remove());
    if(previous)previous.remove();
    // Actualizar el estado del listado una vez retirada la ficha.
    if(refreshRef&&typeof window.marcarControlQCMedido==='function')
      window.marcarControlQCMedido(refreshRef);
    return true;
  }
  async function prepareRecordSwitch(fromId){
    if(!active)return {allowed:true,reopen:false};
    if(writing)return {allowed:false,reopen:false};
    const editor=active;
    if(!(await settleNotes())||active!==editor)return {allowed:false,reopen:false};
    const reopen=record?.id===fromId;
    return {allowed:close(),reopen};
  }
  async function token(){
    let saved=null;
    try{saved=JSON.parse(localStorage.getItem(AUTH)||'null')}catch(e){}
    if(!saved?.user||!saved.refreshToken)throw Error('LOGIN_REQUIRED');
    const r=await fetch('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(API_KEY),{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'refresh_token',refresh_token:saved.refreshToken}).toString(),
      cache:'no-store'
    });
    if(!r.ok)throw Error('LOGIN_REQUIRED');
    const v=await r.json();
    if(!v.id_token||!v.refresh_token)throw Error('LOGIN_REQUIRED');
    localStorage.setItem(AUTH,JSON.stringify({user:saved.user,refreshToken:v.refresh_token}));
    return v.id_token;
  }
  // Solo un control SIN mediciones previas recibe propuesta inicial.
  // Usamos bandejas informadas de ESTE registro, nunca de otras partidas.
  function chooseState(box){
    const wrap=box.closest('.qco-cat');
    if(box.checked&&box.value==='noEvaluada')
      wrap.querySelectorAll('input[type="checkbox"]').forEach(x=>{if(x!==box)x.checked=false;});
    else if(box.checked){const n=wrap.querySelector('input[value="noEvaluada"]');if(n)n.checked=false;}
    const selected=Array.from(wrap.querySelectorAll('input[type="checkbox"]:checked')).map(x=>x.value);
    const picker=wrap.querySelector('.qco-percent'),mixed=selected.length>=2&&!selected.includes('noEvaluada');
    if(mixed&&picker.disabled)picker.value='10';
    if(!mixed)picker.value=selected.length===1&&selected[0]!=='ok'&&selected[0]!=='noEvaluada'?'100':'0';
    picker.disabled=!mixed||loading||writing;
    updateIndicatorVisibility();
  }
  function restorePercentControls(){
    if(!active)return;
    active.querySelectorAll('.qco-cat input[type="checkbox"]').forEach(box=>box.disabled=false);
    for(const wrap of active.querySelectorAll('.qco-cat')){
      const selected=Array.from(wrap.querySelectorAll('input[type="checkbox"]:checked')).map(box=>box.value);
      wrap.querySelector('.qco-percent').disabled=!(selected.length>=2&&!selected.includes('noEvaluada'));
    }
  }
  // El histórico puede conservar Flores/No (equivalente agronómico a OK).
  // Adaptar solo para presentar; nunca modificar un registro sin guardado expreso.
  function normalizeOptions(cat,values){
    const seen=new Set();
    return values.map(v=>cat==='flores'&&v==='no'?'ok':v)
      .filter(v=>{if(seen.has(v))return false;seen.add(v);return true;});
  }
  function populate(saved,rec){
    version=saved?.version||0;
    const total=saved?strCount(saved.bandejasInspeccionadas):strCount(rec?.numBandejas);
    active.querySelector('.qco-total input').value=total===null?'':String(total);
    active.querySelector('.qco-total-value').textContent=total===null?'No disponible':total.toLocaleString('es-ES');
    for(const [cat,,opts] of CATS){
      const wrap=active.querySelector('[data-qco-cat="'+cat+'"]');
      let chosen=saved?.categorias?.[cat]?.opciones;
      if(!Array.isArray(chosen)){
        const old=saved?.mediciones?.[cat];
        chosen=old?Object.keys(old).filter(k=>Number(old[k])>0):['ok'];
      }
      chosen=normalizeOptions(cat,chosen);
      if(chosen.includes('noEvaluada')&&chosen.length>1)chosen=chosen.filter(k=>k!=='noEvaluada');
      for(const box of wrap.querySelectorAll('input[type="checkbox"]')){box.checked=chosen.includes(box.value);box.disabled=false;}
      const picker=wrap.querySelector('.qco-percent');
      const mixed=chosen.length>=2&&!chosen.includes('noEvaluada');
      const old=saved?.mediciones?.[cat];
      const prior=old&&total?Math.max(0,Math.min(100,Math.round((total-(Number(old.ok)||0)-(Number(old.noEvaluada)||0))/total*10)*10)):0;
      picker.value=String(saved?.categorias?.[cat]?.porcentajeInvalidas??prior);
      if(!mixed)picker.value=chosen.length===1&&chosen[0]!=='ok'&&chosen[0]!=='noEvaluada'?'100':'0';
      picker.disabled=!mixed;
    }
    savedMeasurement=saved;lastTotal=total;loading=false;
    original=saved?JSON.stringify(snapshot()):'';
    updateIndicatorVisibility();report('','');
  }
  async function fetchRules(jwt,stage){
    const response=await fetch('/api/admin-qc-reglas?stage='+encodeURIComponent(stage),{
      method:'GET',headers:{Authorization:'Bearer '+jwt},cache:'no-store'
    });
    if(!response.ok)throw Error('RULES_UNAVAILABLE');
    const data=await response.json();
    if(!data.ok||data.stage!==stage||!data.rules?.criterios)throw Error('RULES_UNAVAILABLE');
    return data.rules;
  }
  function renderBalances(){ /* El porcentaje sustituye al cuadre por opción. */ }
  function updateIndicatorVisibility(){
    renderBalances();
    const isSaved=!!savedMeasurement&&!changed();
    // No permitir guardar de nuevo sin modificar cantidades.
    const submit=active?.querySelector('.qco-save');
    if(submit)submit.disabled=loading||writing||!changed();
    // Un cambio posterior ya no está guardado: retirar la confirmación anterior.
    if(!isSaved&&active?.querySelector('.qco-feedback')?.textContent==='✓ Porcentajes guardados')
      report('','');
    const details=active?.querySelector('.qco-indicators');
    if(details)details.hidden=!isSaved;
    document.querySelectorAll('#control-overlay .qco-live-indicator').forEach(el=>el.hidden=!isSaved);
  }
  function syncInlineIndicators(){ /* Porcentaje agregado por categoría. */ }
  function renderIndicators(expand){
    const d=active?.querySelector('.qco-indicators');if(!d)return;d.hidden=true;
    if(!savedMeasurement||!window.QCIndicators)return;
    const v=window.QCIndicators.evaluate(savedMeasurement,currentRules);if(!v.available)return;
    d.querySelector('summary').textContent='Resumen QC guardado';
    const list=d.querySelector('.qco-indicator-list');list.replaceChildren();
    for(const entry of v.rows){
      const line=node('div',null,'qco-indicator-row');
      line.append(node('span',entry.categoryLabel+' · '+entry.optionLabel),
        node('span',entry.count===null?'—':entry.count+' / '+v.inspected),
        node('span',entry.percentDisplay+' %','qco-indicator-value '+entry.level));list.append(line);
    }
    d.hidden=false;if(expand)d.open=true;updateIndicatorVisibility();
  }
  function validate(){
    const v=snapshot(),total=strCount(v.bandejasInspeccionadas),errors=[];
    if(total===null)errors.push('No consta el total de bandejas de la partida.');
    for(const [cat,name,opts] of CATS){
      const {opciones:a,porcentajeInvalidas:p}=v.categorias[cat];
      const allowed=new Set(opts.map(([k])=>k));
      if(!a.length||new Set(a).size!==a.length||a.some(k=>!allowed.has(k)))errors.push(name+': selecciona al menos una opción.');
      if(a.includes('noEvaluada')&&a.length!==1)errors.push(name+': No evaluada debe ir sola.');
      if(!Number.isInteger(p)||p<0||p>100||p%10)errors.push(name+': porcentaje incorrecto.');
      if(a.length===1&&a[0]==='ok'&&p!==0)errors.push(name+': OK requiere 0 %.');
      if(a.length===1&&a[0]==='noEvaluada'&&p!==0)errors.push(name+': No evaluada requiere 0 %.');
      if(a.length===1&&!['ok','noEvaluada'].includes(a[0])&&p!==100)errors.push(name+': solo defecto requiere 100 %.');
    }
    return {errors,total,categorias:v.categorias};
  }
  // Tras una respuesta de guardado incierta, solo LEER la misma medición.
  // Nunca reintentar la escritura automáticamente (evita duplicados/conflictos).
  async function verificarGuardadoIncierto(jwt,ref,expected,previousVersion){
    if(!jwt)return {state:'unknown'};
    try{
      const q=new URLSearchParams({id:ref.id,tipo:ref.tipo,dia:String(ref.dia)});
      const response=await fetch(API+'?'+q.toString(),{
        method:'GET',headers:{Authorization:'Bearer '+jwt},cache:'no-store'
      });
      if(!response.ok)return {state:'unknown'};
      const data=await response.json();
      if(!data.ok||data.sourcePartida!==ref.partida)return {state:'unknown'};
      const saved=data.record;
      if(!saved)return {state:'absent'};
      if(!Number.isInteger(saved.version)||saved.version<=previousVersion)
        return {state:'different'};
      const same=saved.bandejasInspeccionadas===expected.total && Object.keys(expected.categorias).every(cat=>JSON.stringify(saved.categorias?.[cat])===JSON.stringify(expected.categorias[cat]));
      return same?{state:'confirmed',value:saved}:{state:'different'};
    }catch(_){return {state:'unknown'};}
  }
  // Solo tras confirmación del servidor o lectura posterior equivalente.
  function mostrarConfirmacionQC(){
    let aviso=document.getElementById('qco-guardado-ok');
    if(!aviso){
      aviso=document.createElement('div');
      aviso.id='qco-guardado-ok';
      aviso.setAttribute('role','status');
      aviso.setAttribute('aria-live','polite');
      aviso.style.cssText='position:fixed;top:calc(12px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:100002;max-width:calc(100vw - 24px);min-width:min(300px,calc(100vw - 24px));background:#1558a0;color:#fff;border:1px solid #9ec1e5;border-radius:9px;padding:13px 16px;box-shadow:0 6px 24px rgba(0,0,0,.22);font-size:14px;font-weight:800;text-align:center;pointer-events:none';
      document.body.appendChild(aviso);
    }
    aviso.textContent='✓ Porcentajes QC guardados';
    clearTimeout(aviso._qcoTimeout);
    aviso._qcoTimeout=setTimeout(()=>aviso.remove(),4500);
  }
  async function save(e){
    e.preventDefault();
    if(!active||!record||writing)return;
    const checked=validate();
    if(checked.errors.length){report('No se puede guardar: '+checked.errors.slice(0,7).join(' · '),'error');return;}
    if(navigator.onLine===false){
      report('Sin conexión. No guardado.','error');return;
    }
    const editor=active;
    let confirmed=false,jwt=null,requestSent=false;
    const refAtSave={...record},versionAtSave=version;
    writing=true;
    // Los campos quedan congelados hasta confirmar la escritura.
    active.querySelectorAll('.qco-cat input[type="checkbox"], .qco-cat select')
      .forEach(input=>{input.disabled=true;});
    active.querySelectorAll('.qco-live-control input').forEach(x=>x.disabled=true);
    document.querySelectorAll('#control-overlay .qco-live-control input').forEach(x=>x.disabled=true);
    const btn=active.querySelector('.qco-save');btn.disabled=true;
    report('Guardando…','');
    try{
      if(!(await settleNotes()))throw Error('NOTES_FAILED');
      jwt=await token();
      requestSent=true;
      const r=await fetch(API,{
        method:'POST',headers:{Authorization:'Bearer '+jwt,'Content-Type':'application/json'},
        body:JSON.stringify({
          id:record.id,tipo:record.tipo,dia:record.dia,partida:record.partida,
          version,bandejasInspeccionadas:checked.total,categorias:checked.categorias
        }),cache:'no-store'
      });
      if(!r.ok){
        const errorPayload=await r.json().catch(()=>null);
        const code=typeof errorPayload?.diagnostic==='string'&&/^QC_[A-Z0-9_]{1,65}$/.test(errorPayload.diagnostic)
          ?' '+errorPayload.diagnostic:
          typeof errorPayload?.error==='string'&&/^[A-Z0-9_]{1,45}$/.test(errorPayload.error)
          ?' '+errorPayload.error:'';
        if(r.status===403)throw Error('FORBIDDEN');
        if(r.status===409)throw Error('CONFLICT');
        throw Error('HTTP '+r.status+code);
      }
      const data=await r.json();
      if(!data.ok||!Number.isInteger(data.version))throw Error('INVALID_RESPONSE');
      version=data.version;original=JSON.stringify(snapshot());
      savedMeasurement={schemaVersion:2,version,bandejasInspeccionadas:checked.total,categorias:checked.categorias};
      confirmed=true;
    }catch(err){
      const reason=String(err?.message||'').slice(0,80);
      if(reason==='NOTES_FAILED')
        report('No se han podido guardar las observaciones. Revisa antes de continuar.','error');
      else if(reason==='CONFLICT')
        report('Conflicto: datos modificados. Cierra y vuelve a abrir.','error');
      else if(reason==='FORBIDDEN')
        report('Sin permiso para este estadio.','error');
      else if(reason==='LOGIN_REQUIRED')
        report('No se ha podido autenticar la sesión. Vuelve a identificarte.','error');
      else{
        const state=requestSent?
          await verificarGuardadoIncierto(jwt,refAtSave,checked,versionAtSave):{state:'unknown'};
        if(state.state==='confirmed'){
          version=state.value.version;
          original=JSON.stringify(snapshot());
          savedMeasurement=state.value;
          confirmed=true;
        }else if(state.state==='absent'){
          report('No constan cantidades guardadas en el servidor. '+reason+
            '. Conserva los valores y no repitas hasta revisar el fallo.','error');
        }else if(state.state==='different'){
          report('El servidor tiene datos distintos. Cierra y reabre para evitar sobrescrituras. '+reason,'error');
        }else{
          report('Guardado sin confirmar ('+(reason||'red')+'). Reabre antes de repetir.','error');
        }
      }
    }finally{
      writing=false;
      if(active===editor){
        if(confirmed){
          // Permanecer en la inspección con los datos y versión confirmados.
          savedForList=refAtSave;
          restorePercentControls();
          embedAmounts();
          renderIndicators(false);
          updateIndicatorVisibility();
          report('✓ Porcentajes guardados','');
          if(typeof window.marcarControlQCMedido==='function')
            window.marcarControlQCMedido(refAtSave);
          mostrarConfirmacionQC();
        }else{
          btn.disabled=false;
          restorePercentControls();
          embedAmounts();
        }
      }
    }
  }
  function build(rec){
    const overlay=node('section',null,'qco-inline');overlay.id='qco-inline';
    const dialog=node('div',null,'qco-dialog');dialog.setAttribute('role','region');
    dialog.setAttribute('aria-label','Estados y porcentajes de calidad');
    const head=node('div',null,'qco-header'),heading=node('div','Control de Calidad · Porcentajes','qco-title');
    const exit=node('button','×','qco-close');exit.type='button';exit.title='Cerrar';exit.addEventListener('click',()=>close());
    head.append(heading,exit);dialog.append(head);
    const body=node('div',null,'qco-body'),form=node('form');form.noValidate=true;form.addEventListener('submit',save);
    const total=node('div',null,'qco-total');
    total.append(node('span','Bandejas de la partida: '),node('strong','—','qco-total-value'));
    const count=node('input');count.type='hidden';total.append(count);form.append(total);
    for(const [cat,name,options] of CATS){
      const wrap=node('fieldset',null,'qco-cat');wrap.dataset.qcoCat=cat;wrap.append(node('legend',name));
      const choices=node('div',null,'qco-choices');
      for(const [value,label] of [...options.filter(x=>x[0]==='ok'),...options.filter(x=>x[0]!=='ok')]){
        const row=node('label',null,'qco-option');row.dataset.option=value;
        const input=node('input');input.type='checkbox';input.value=value;input.disabled=true;
        input.addEventListener('change',()=>chooseState(input));
        row.append(input,node('span',label));choices.append(row);
      }
      wrap.append(choices);
      const footer=node('label',null,'qco-percent-row');footer.append(node('span','% inválidas'));
      const picker=node('select',null,'qco-percent');picker.disabled=true;
      picker.setAttribute('aria-label',name+' · porcentaje de inválidas');
      for(let n=0;n<=100;n+=10){const o=node('option',n+' %');o.value=String(n);picker.append(o);}
      picker.addEventListener('change',updateIndicatorVisibility);footer.append(picker);wrap.append(footer);form.append(wrap);
    }
    if(legacyApi){
      // Las observaciones/fotos se editan usando su registro histórico original.
      const section=node('section',null,'qco-legacy-extras');
      section.append(node('div','Observaciones y foto','qco-extras-heading'));
      const content=node('div',null,'qco-extras-content');
      const notesField=node('label',null,'qco-notes');
      notesField.append(node('span','Observaciones'));
      const notes=node('input');notes.type='text';
      notes.placeholder='Sin observaciones';
      notes.value=String(legacyApi.getObservations?.()??rec.observaciones??'');
      notes.setAttribute('aria-label','Observaciones de esta partida');
      // Al salir del campo, guardar observaciones en el sistema histórico.
      // Si siguen pendientes, no permitir cerrar ni mezclar registros.
      notes.addEventListener('change',()=>{void persistNotes();});
      notesField.append(notes);content.append(notesField);
      const media=node('div',null,'qco-photo-area');
      const preview=node('img');preview.alt='Fotografía del control';
      preview.hidden=true;preview.tabIndex=0;preview.setAttribute('role','button');
      preview.setAttribute('aria-label','Ver fotografía');
      preview.addEventListener('click',()=>legacyApi?.openPhoto?.());
      preview.addEventListener('keydown',event=>{
        if(event.key==='Enter'||event.key===' '){event.preventDefault();legacyApi?.openPhoto?.();}
      });
      media.append(preview);
      const pick=node('label',null,'qco-photo-action');
      pick.append(node('span','Añadir foto','qco-photo-action-text'));
      const upload=node('input');upload.type='file';upload.accept='image/*';
      upload.setAttribute('capture','environment');
      upload.addEventListener('change',async()=>{
        if(!upload.files?.length)return;
        try{await legacyApi?.uploadPhoto?.(upload);}
        catch(e){report('No se ha podido completar la carga de la foto.','error');}
        finally{if(active)refreshPhoto();upload.value='';}
      });
      pick.append(upload);media.append(pick);content.append(media);
      section.append(content);form.append(section);
    }

    const feedback=node('div',null,'qco-feedback');feedback.hidden=true;feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');form.append(feedback);
    const details=node('details',null,'qco-indicators');details.hidden=true;
    details.append(node('summary','Resumen QC'),node('div',null,'qco-indicator-list'));form.append(details);
    const foot=node('div',null,'qco-footer');
    const cancel=node('button','Cerrar','qco-secondary');cancel.type='button';cancel.addEventListener('click',()=>close());
    const submit=node('button','Guardar porcentajes','qco-save');submit.type='submit';submit.disabled=true;
    foot.append(cancel,submit);form.append(foot);body.append(form);dialog.append(body);overlay.append(dialog);return overlay;
  }
  async function open(rec,context){
    if(!rec||!['tunel','carga'].includes(rec.tipo)||typeof rec.id!=='string'||
      !/^[A-Za-z0-9_-]{1,180}$/.test(rec.id)||!
      Number.isInteger(rec.dia)||rec.dia<15||rec.dia>4000||
      typeof rec.partida!=='string'||!/^[A-Za-z0-9._-]{1,100}$/.test(rec.partida)){
      alert('Este control no tiene todos los identificadores necesarios para cuantificarlo.');
      return;
    }
    if(switchingRecord)return;
    if(active){
      if(record?.id===rec.id){close();return;}
      switchingRecord=true;
      try{
        const navigation=await prepareRecordSwitch(record?.id);
        if(!navigation.allowed||active)return;
      }finally{switchingRecord=false;}
    }
    const thisSequence=++sequence;
    record={id:rec.id,tipo:rec.tipo,dia:rec.dia,partida:rec.partida};
    legacyApi=context||null;
    savedMeasurement=null;currentRules=null;loading=true;savedForList=null;
    active=build(rec);
    mount();observeControl();
    original=JSON.stringify(snapshot());
    const modal=active;
    // No desplegar el teclado móvil antes de recibir los datos.
    try{
      const jwt=await token();
      const q=new URLSearchParams({id:rec.id,tipo:rec.tipo,dia:String(rec.dia)});
      const response=await fetch(API+'?'+q.toString(),{
        method:'GET',headers:{Authorization:'Bearer '+jwt},cache:'no-store'
      });
      if(response.status===403)throw Error('FORBIDDEN');
      if(response.status===409)throw Error('CONFLICT');
      if(!response.ok)throw Error('LOAD_FAILED');
      const data=await response.json();
      if(!data.ok||data.sourcePartida!==rec.partida)throw Error('CONFLICT');
      if(sequence!==thisSequence||active!==modal)return;
      populate(data.record,rec);
      // Guardar se activa exclusivamente cuando se modifican las cantidades.
      // Mostrar el comienzo de la medición en móvil sin abrir el teclado.
      if(window.matchMedia?.('(max-width: 560px)').matches)
        modal.scrollIntoView({block:'start',behavior:'auto'});
      else if(window.matchMedia?.('(min-width: 561px)').matches)
        modal.querySelector('.qco-cat input[type="checkbox"]')?.focus({preventScroll:true});
      renderIndicators(false);
      // Criterios opcionales: su consulta nunca debe retrasar ni impedir guardar.
      fetchRules(jwt,rec.tipo).then(rules=>{
        if(sequence!==thisSequence||active!==modal)return;
        currentRules=rules;renderIndicators(false);
      }).catch(()=>{
        if(sequence!==thisSequence||active!==modal)return;
        currentRules=null;renderIndicators(false);
      });
    }catch(err){
      if(sequence!==thisSequence||active!==modal)return;
      loading=false;
      report(err.message==='FORBIDDEN'?'No tienes permiso para cuantificar este control.':
        err.message==='CONFLICT'?'La partida ha cambiado: vuelve a cargar el control.':
        'No se han podido recuperar las cantidades. El guardado está desactivado para evitar sobrescribir información.','error');
    }
  }
  window.QCOperativo=Object.freeze({open,prepareRecordSwitch});
})();
