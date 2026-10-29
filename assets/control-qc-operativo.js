'use strict';
/* Captura cuantitativa operativa: separada de la escritura histórica y sin cola offline ficticia. */
(function(){
  const API='/api/admin-qc-mediciones';
  const AUTH='lasala-firebase-auth-v1';
  const API_KEY='AIzaSyDdDdMg6M1jVIssvGYKsdRA-mRug31Yt_g';
  const CATS=[
    ['color','Color',[['verde','Verde'],['amarillo','Amarillo'],['verdeClaro','Verde claro'],['ok','OK']]],
    ['tamano','Tamaño',[['grande','Grande'],['pequeno','Pequeño'],['ok','OK']]],
    ['sanidad','Sanidad',[['ok','OK'],['enfermedad1','Enfermedad 1'],['enfermedad2','Enfermedad 2'],['enfermedad3','Enfermedad 3'],['enfermedad4','Enfermedad 4']]],
    ['flores','Flores',[['ok','Ok'],['si','Con flores']]],
    ['raices','Raíces',[['pocaRaiz','Poca raíz'],['raizVariedad','Raíz en variedad'],['ok','OK']]]
  ];
  CATS.forEach(cat=>cat[2].push(['noEvaluada','No evaluada']));
  const HEALTH_KEYS=['enfermedad1','enfermedad2','enfermedad3','enfermedad4'];
  const isDisease=k=>HEALTH_KEYS.includes(k);
  const selectedOf=wrap=>Array.from(wrap.querySelectorAll('input[type="checkbox"]:checked')).map(b=>b.value);
  const sumHealth=wrap=>Array.from(wrap.querySelectorAll('.qco-disease-select')).reduce((n,p)=>
    n+(p.closest('.qco-health-row')?.querySelector('input[type="checkbox"]')?.checked?Number(p.value):0),0);
  const hasProblems=()=>!!active&&CATS.some(([cat])=>
    selectedOf(active.querySelector('[data-qco-cat="'+cat+'"]')).some(k=>k!=='ok'&&k!=='noEvaluada'));
  // Cinco bloques con el mismo peso. Sanidad agrega primero todas las enfermedades
  // y participa una sola vez. No evaluada y OK no suman; el resto, incidencia 100.
  function suggestedGlobal(){
    if(!active)return 0;
    let sum=0;
    for(const [cat] of CATS){
      const wrap=active.querySelector('[data-qco-cat="'+cat+'"]');
      const picked=selectedOf(wrap);
      if(cat==='sanidad')sum+=Math.min(100,sumHealth(wrap));
      else if(picked.some(k=>k!=='ok'&&k!=='noEvaluada'))sum+=100;
    }
    return Math.floor(sum/CATS.length/10)*10;
  }
  // El usuario puede cambiar el total calculado; no se recalcula al restaurar
  // ni al guardar, solo al editar algún estado o porcentaje de enfermedad.
  function syncGlobal(recalculate=false){
    if(!active)return;
    const selector=active.querySelector('.qco-global-percent');
    if(recalculate)selector.value=String(suggestedGlobal());
    if(!hasProblems()){
      selector.value='0';selector.disabled=true;
    }else selector.disabled=loading||writing;
    updateIndicatorVisibility();
  }
  function syncHealthSelectors(){
    if(!active)return;
    for(const select of active.querySelectorAll('.qco-disease-select')){
      const picked=select.closest('.qco-health-row')?.querySelector('input[type="checkbox"]')?.checked;
      select.disabled=!picked||loading||writing;
    }
  }
  function changeDiseasePercent(picker){
    const previous=Number(picker.dataset.previous||10);
    if(sumHealth(active)>100){
      picker.value=String(previous);
      report('Sanidad: la suma de porcentajes por enfermedad no puede superar el 100 %.','error');
    }else{
      picker.dataset.previous=picker.value;
      report('','');
    }
    syncGlobal(true);
  }
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
  let active=null,sequence=0,writing=false,version=0,record=null,original='',initialSnapshot='',lastTotal=null;
  let photoBusy=false,photoRefreshToken=0;
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
  async function refreshPhoto(){
    const editor=active,context=legacyApi,ref=record;
    const gallery=editor?.querySelector('.qco-photo-gallery');
    if(!editor||!gallery||!context?.listPhotos||!ref)return;
    const seq=++photoRefreshToken;
    gallery.replaceChildren(node('span','Cargando fotografías…','qco-photo-empty'));
    try{
      const photos=await context.listPhotos();
      if(editor!==active||context!==legacyApi||seq!==photoRefreshToken)return;
      gallery.replaceChildren();
      if(!photos.length){
        gallery.append(node('span','Sin fotografías','qco-photo-empty'));
        return;
      }
      photos.forEach((photo,i)=>{
        const tile=node('div',null,'qco-photo-tile');
        if(photo.error){
          tile.append(node('span','Foto en SharePoint (vista previa no disponible)','qco-photo-error'));
          gallery.append(tile);return;
        }
        const open=node('button',null,'qco-photo-open');
        open.type='button';open.title='Ampliar foto '+(i+1);
        open.setAttribute('aria-label','Ampliar foto '+(i+1));
        const image=node('img');image.src=photo.t||photo.f;
        image.alt='Miniatura '+(i+1)+' de '+photos.length;
        image.loading='lazy';
        open.append(image);
        open.addEventListener('click',()=>context.openPhoto?.(photo));
        tile.append(open);
        const tag=node('span',photo.pending?'Pendiente local':
          photo.legacy?'Histórica':'SharePoint','qco-photo-source');
        tile.append(tag);
        if(!photo.readonly){
          const trash=node('button','🗑','qco-photo-delete');
          trash.type='button';trash.title=photo.sharepoint?'Retirar de galería (se conserva en SharePoint)':'Eliminar foto local';
          trash.setAttribute('aria-label',trash.title);
          trash.addEventListener('click',async()=>{
            if(photoBusy||!confirm(photo.sharepoint?
              '¿Retirar de la galería? El archivo se conserva en SharePoint.':
              '¿Eliminar esta foto local pendiente de envío?'))return;
            photoBusy=true;trash.disabled=true;
            try{
              await context.deletePhoto(photo.id);
              report(photo.sharepoint?'Foto retirada de la galería. Archivo conservado en SharePoint.':
                'Fotografía local eliminada.','');
            }catch(e){report(e?.message||'No se pudo eliminar la fotografía.','error');}
            finally{
              photoBusy=false;
              if(editor===active)void refreshPhoto();
            }
          });
          tile.append(trash);
        }
        gallery.append(tile);
      });
    }catch(e){
      if(editor!==active||seq!==photoRefreshToken)return;
      gallery.replaceChildren(node('span','No se ha podido cargar la galería. Reabre la inspección.','qco-photo-error'));
    }
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
    const out={categorias:{},
      porcentajeInvalidasGlobal:Number(active.querySelector('.qco-global-percent').value)};
    for(const [cat] of CATS){
      const wrap=active.querySelector('[data-qco-cat="'+cat+'"]');
      const item={opciones:selectedOf(wrap)};
      if(cat==='sanidad'){
        item.porcentajesEnfermedades={};
        for(const key of HEALTH_KEYS){
          if(item.opciones.includes(key))
            item.porcentajesEnfermedades[key]=Number(wrap.querySelector('.qco-health-row[data-option="'+key+'"] .qco-disease-select').value);
        }
      }
      out.categorias[cat]=item;
    }
    return out;
  }
  function changed(){return original!==JSON.stringify(snapshot())}
  function editedByUser(){return initialSnapshot!==JSON.stringify(snapshot())}
  function close(force=false){
    if(writing||photoBusy)return false;
    const quantitiesAtRequest=JSON.stringify(snapshot());
    if(!force&&active&&editedByUser()&&!confirm('Hay cantidades sin guardar. ¿Salir sin guardar?'))return false;
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
    sequence++;active=null;record=null;original='';initialSnapshot='';lastTotal=null;loading=false;
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
    if(writing||photoBusy)return {allowed:false,reopen:false};
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
    const wrap=box.closest('.qco-cat'),cat=wrap.dataset.qcoCat;
    if(box.checked){
      if(cat==='sanidad'){
        if(box.value==='ok'||box.value==='noEvaluada'){
          wrap.querySelectorAll('input[type="checkbox"]').forEach(other=>{if(other!==box)other.checked=false;});
          for(const selector of wrap.querySelectorAll('.qco-disease-select'))selector.value='0';
        }else{
          for(const key of ['ok','noEvaluada']){
            const other=wrap.querySelector('input[value="'+key+'"]');if(other)other.checked=false;
          }
          const picker=box.closest('.qco-health-row').querySelector('.qco-disease-select');
          picker.value='10';
          if(sumHealth(wrap)>100){
            box.checked=false;picker.value='0';
            report('Sanidad: el desglose no puede sumar más del 100 %.','error');
          }else picker.dataset.previous='10';
        }
      }else wrap.querySelectorAll('input[type="checkbox"]').forEach(other=>{if(other!==box)other.checked=false;});
    }else if(cat==='sanidad'&&isDisease(box.value)){
      box.closest('.qco-health-row').querySelector('.qco-disease-select').value='0';
    }
    wrap.dataset.legacyUnresolved='0';
    syncHealthSelectors();
    syncGlobal(true);
  }
  function restorePercentControls(){
    if(!active)return;
    active.querySelectorAll('.qco-cat input[type="checkbox"]').forEach(box=>box.disabled=false);
    syncHealthSelectors();
    syncGlobal();
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
    const savedV5=[5,6].includes(saved?.schemaVersion);
    const aggregate=active.querySelector('.qco-global-percent');
     for(const [cat] of CATS){
      const wrap=active.querySelector('[data-qco-cat="'+cat+'"]');
      const old=saved?.mediciones?.[cat];
      let chosen=saved?.categorias?.[cat]?.opciones;
      if(!Array.isArray(chosen))chosen=old?Object.keys(old).filter(k=>Number(old[k])>0):['ok'];
      chosen=normalizeOptions(cat,chosen);
      let issue='';
      if(chosen.includes('noEvaluada')){
        issue='Esta categoría estaba sin evaluar. Selecciona un estado para actualizarla.';chosen=[];
      }
      if(cat==='sanidad'){
        if(chosen.includes('enferma')){
          issue='Sanidad histórica «Enferma» sin diagnóstico. Selecciona la enfermedad real.';chosen=[];
        }else if(chosen.includes('ok')&&chosen.some(isDisease)){
          issue='Sanidad histórica con OK y enfermedades. Vuelve a seleccionar las enfermedades.';chosen=[];
        }
      }else if(chosen.length>1){
        issue='Medición anterior con varias opciones: selecciona un único estado.';chosen=[];
      }
      wrap.dataset.legacyUnresolved=issue?'1':'0';
       for(const box of wrap.querySelectorAll('input[type="checkbox"]')){
        box.checked=chosen.includes(box.value);box.disabled=false;
      }
      if(cat==='sanidad'){
        const details=saved?.categorias?.sanidad?.porcentajesEnfermedades||{};
        for(const key of HEALTH_KEYS){
          const picker=wrap.querySelector('.qco-health-row[data-option="'+key+'"] .qco-disease-select');
          const n=Number(details[key]);
          picker.value=chosen.includes(key)&&Number.isInteger(n)&&n>=10?String(n):'0';
          picker.dataset.previous=picker.value==='0'?'10':picker.value;
        }
        if(chosen.some(isDisease)&&(!savedV5&&!saved?.categorias?.sanidad?.porcentajesEnfermedades)){
          wrap.dataset.legacyUnresolved='1';
         }
      }
     }
    const global=saved?.porcentajeInvalidasGlobal;
    aggregate.value=savedV5&&Number.isInteger(global)?String(global):'0';
    savedMeasurement=saved;lastTotal=total;loading=false;
    restorePercentControls();
    // Históricos no poseen un global unificado: proponer el nuevo cálculo sin avisos.
    if(!savedV5)syncGlobal(true);
    initialSnapshot=JSON.stringify(snapshot());
    original=saved?initialSnapshot:'';
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
    const v=snapshot(),errors=[];
    const global=v.porcentajeInvalidasGlobal;
    const hasIssue=Object.values(v.categorias).some(i=>i.opciones.some(k=>k!=='ok'&&k!=='noEvaluada'));
    if(!Number.isInteger(global)||global<0||global>100||global%10!==0||
       !hasIssue&&global!==0)
      errors.push('Porcentaje global incorrecto.');
     for(const [cat,name,opts] of CATS){
      const {opciones:a}=v.categorias[cat];
      const wrap=active.querySelector('[data-qco-cat="'+cat+'"]');
      const allowed=new Set(opts.map(([key])=>key));
      if(wrap.dataset.legacyUnresolved==='1')errors.push(name+': revisa las opciones anteriores.');
      if(!a.length||new Set(a).size!==a.length||a.some(k=>!allowed.has(k)))
        errors.push(name+': selecciona una opción válida.');
      if(cat==='sanidad'){
        if(a.length>1&&(a.includes('ok')||a.includes('noEvaluada')))
          errors.push('Sanidad: OK y enfermedades no son compatibles.');
        const details=v.categorias.sanidad.porcentajesEnfermedades;
        const diseases=a.filter(isDisease);
        if(Object.keys(details).length!==diseases.length||
           diseases.some(k=>!Number.isInteger(details[k])||details[k]<10||details[k]>100||details[k]%10!==0))
          errors.push('Sanidad: comprueba el porcentaje de cada enfermedad.');
        const sum=diseases.reduce((n,k)=>n+details[k],0);
        if(sum>100)errors.push('Sanidad: suma de enfermedades superior al 100 %.');
      }else if(a.length!==1)errors.push(name+': solo permite una opción.');
    }
    return {errors,categorias:v.categorias,porcentajeInvalidasGlobal:global};
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
      const same=saved.schemaVersion===6&&
        saved.porcentajeInvalidasGlobal===expected.porcentajeInvalidasGlobal&&
        Object.keys(expected.categorias).every(cat=>JSON.stringify(saved.categorias?.[cat])===JSON.stringify(expected.categorias[cat]));
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
    active.querySelectorAll('.qco-cat input[type="checkbox"], .qco-cat select, .qco-global-percent')
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
          schemaVersion:6,version,
          categorias:checked.categorias,porcentajeInvalidasGlobal:checked.porcentajeInvalidasGlobal
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
      version=data.version;original=JSON.stringify(snapshot());initialSnapshot=original;
      savedMeasurement={schemaVersion:6,version,
        categorias:checked.categorias,porcentajeInvalidasGlobal:checked.porcentajeInvalidasGlobal};
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
          original=JSON.stringify(snapshot());initialSnapshot=original;
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
  async function openQCBrowserCamera(onPhoto){
    if(!navigator.mediaDevices?.getUserMedia){
      report('La cámara no está disponible en este navegador. Usa Elegir fotos.','error');
      return;
    }
    let stream;
    try{
      stream=await navigator.mediaDevices.getUserMedia({
        video:{facingMode:{ideal:'environment'}},audio:false
      });
    }catch(e){
      report(e?.name==='NotAllowedError'?
        'Permiso de cámara denegado. Actívalo en el navegador o usa Elegir fotos.':
        'No se ha podido abrir la cámara. Comprueba la cámara o utiliza Elegir fotos.','error');
      return;
    }
    // Pantalla temporal: captura local; el Blob se entrega al MISMO
    // circuito IndexedDB/SharePoint que los archivos seleccionados.
    const overlay=node('section',null,'qco-camera-overlay');
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-label','Cámara de inspección');
    const body=node('div',null,'qco-camera-dialog');
    const heading=node('h3','Cámara de inspección');
    const video=node('video');
    video.setAttribute('playsinline','');
    video.autoplay=true;video.muted=true;
    video.srcObject=stream;
    const controls=node('div',null,'qco-camera-controls');
    const snap=node('button','Capturar foto');
    snap.type='button';snap.className='qco-camera-capture';
    const cancel=node('button','Cancelar');
    cancel.type='button';cancel.className='qco-camera-cancel';
    let closed=false;
    const stop=()=>{
      if(closed)return;
      closed=true;
      stream.getTracks().forEach(t=>t.stop());
      video.srcObject=null;overlay.remove();
      document.removeEventListener('keydown',onKey);
    };
    const onKey=e=>{if(e.key==='Escape')stop();};
    cancel.addEventListener('click',stop);
    snap.addEventListener('click',async()=>{
      if(closed||!video.videoWidth||!video.videoHeight)return;
      snap.disabled=true;
      try{
        const canvas=document.createElement('canvas');
        canvas.width=video.videoWidth;canvas.height=video.videoHeight;
        const ctx=canvas.getContext('2d');
        if(!ctx)throw Error('No se puede capturar la imagen.');
        ctx.drawImage(video,0,0,canvas.width,canvas.height);
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.86));
        canvas.width=0;canvas.height=0;
        if(!blob||blob.size<100)throw Error('La cámara no ha generado una imagen.');
        const file=new File([blob],'QC_'+Date.now()+'.jpg',{type:'image/jpeg'});
        stop();
        await onPhoto(file);
      }catch(e){
        report(e?.message||'Error al capturar la imagen.','error');
        if(!closed)snap.disabled=false;
      }
    });
    controls.append(cancel,snap);
    body.append(heading,video,controls);overlay.append(body);
    document.body.append(overlay);
    document.addEventListener('keydown',onKey);
    try{await video.play()}catch(e){
      stop();report('La cámara no se ha podido iniciar. Usa Elegir fotos.','error');
    }
    if(!closed)cancel.focus({preventScroll:true});
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
    total.hidden=true; // Campo técnico de compatibilidad v5; no es una medición de QC.
    total.append(node('span','Bandejas de la partida: '),node('strong','—','qco-total-value'));
    const count=node('input');count.type='hidden';total.append(count);form.append(total);
    for(const [cat,name,options] of CATS){
      const wrap=node('fieldset',null,'qco-cat');wrap.dataset.qcoCat=cat;wrap.append(node('legend',name));
      const choices=node('div',null,'qco-choices');
      for(const [value,label] of [...options.filter(x=>x[0]==='ok'),...options.filter(x=>x[0]!=='ok'&&x[0]!=='noEvaluada')]){
        const disease=cat==='sanidad'&&isDisease(value);
        const row=node(disease?'div':'label',null,'qco-option'+(disease?' qco-health-row':''));
        row.dataset.option=value;
        const labelEl=disease?node('label',null,'qco-health-choice'):row;
        const input=node('input');input.type='checkbox';input.value=value;input.disabled=true;
        input.addEventListener('change',()=>chooseState(input));
        labelEl.append(input,node('span',label));
        if(disease){
          row.append(labelEl);
          const picker=node('select',null,'qco-disease-select');
          picker.setAttribute('aria-label',label+' · porcentaje');
          for(let n=0;n<=100;n+=10){const o=node('option',n+' %');o.value=String(n);picker.append(o);}
          picker.value='0';picker.disabled=true;picker.dataset.previous='10';
          picker.addEventListener('change',()=>changeDiseasePercent(picker));
          row.append(picker);
        }
        choices.append(row);
      }
      wrap.append(choices);
      form.append(wrap);
    }
    const globalRow=node('section',null,'qco-global-result');
    globalRow.append(node('strong','Porcentaje global de inválidas','qco-global-heading'));
    const summary=node('div',null,'qco-global-row');
    const percent=node('select',null,'qco-global-percent');percent.disabled=true;
    percent.setAttribute('aria-label','Porcentaje global de inválidas de la evaluación completa');
    for(let n=0;n<=100;n+=10){const op=node('option',n+' %');op.value=String(n);percent.append(op);}
    percent.addEventListener('change',()=>{report('','');updateIndicatorVisibility();});
    summary.append(node('span','Inválidas · Total evaluación'),percent);
    globalRow.append(summary);
    form.append(globalRow);
    if(legacyApi){
      // Las observaciones/fotos se editan usando su registro histórico original.
      const section=node('section',null,'qco-legacy-extras');
      section.append(node('div','Observaciones','qco-extras-heading'));
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
      const actions=node('div',null,'qco-photo-actions');
      // 0.112: cámara y galería son dos acciones separadas. Un selector
      // "multiple" sin capture no abre la cámara en todos los móviles.
      const galleryInput=node('input');
      galleryInput.type='file';galleryInput.accept='image/*';galleryInput.multiple=true;
      galleryInput.className='qco-photo-input';galleryInput.setAttribute('aria-label','Elegir fotos');
      const cameraInput=node('input');
      cameraInput.type='file';cameraInput.accept='image/*';
      cameraInput.setAttribute('capture','environment');
      cameraInput.className='qco-photo-input';cameraInput.setAttribute('aria-label','Hacer foto');
      const cameraButton=node('button',null,'qco-photo-action');
      cameraButton.type='button';
      cameraButton.append(node('i',null,'ti ti-camera'),node('span','Hacer foto'));
      const galleryButton=node('button',null,'qco-photo-action');
      galleryButton.type='button';
      galleryButton.append(node('i',null,'ti ti-photo-plus'),node('span','Elegir fotos'));
      async function uploadPhotoFiles(files){
        const selected=Array.from(files||[]);
        if(!selected.length||photoBusy)return;
        photoBusy=true;
        cameraButton.disabled=true;galleryButton.disabled=true;
        try{
          report(selected.length===1?'Guardando fotografía en el dispositivo…':
            'Guardando '+selected.length+' fotografías en el dispositivo…','');
          const outcome=await legacyApi?.uploadPhoto?.({files:selected});
          report(outcome?.sent?'Fotografías confirmadas en SharePoint.':
            'Fotografías guardadas en este dispositivo. Pendientes de SharePoint.','');
        }catch(e){
          report(e?.message||'No se han podido guardar las fotografías.','error');
        }finally{
          photoBusy=false;
          cameraButton.disabled=false;galleryButton.disabled=false;
          galleryInput.value='';cameraInput.value='';
          if(active)void refreshPhoto();
        }
      }
      galleryInput.addEventListener('change',()=>{void uploadPhotoFiles(galleryInput.files);});
      cameraInput.addEventListener('change',()=>{void uploadPhotoFiles(cameraInput.files);});
      galleryButton.addEventListener('click',()=>{
        if(photoBusy)return;
        galleryInput.value='';
        galleryInput.click();
      });
      cameraButton.addEventListener('click',()=>{
        if(photoBusy)return;
        cameraInput.value='';
        // iOS/Android: captura nativa con la cámara trasera.
        const isMobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent||'')||
          navigator.userAgentData?.mobile===true;
        if(isMobile){cameraInput.click();return;}
        // Escritorio/tableta sin selector nativo: vista de cámara del navegador.
        void openQCBrowserCamera(file=>uploadPhotoFiles([file]));
      });
      actions.append(cameraButton,galleryButton,cameraInput,galleryInput);
      media.append(actions);
      media.append(node('div',null,'qco-photo-gallery'));
      const photoSection=node('section',null,'qco-photo-top');
      photoSection.append(node('div','Fotografías','qco-extras-heading'),media);
      form.insertBefore(photoSection,form.querySelector('.qco-cat'));
      section.append(content);form.append(section);
    }

    const feedback=node('div',null,'qco-feedback');feedback.hidden=true;feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');form.append(feedback);
    const details=node('details',null,'qco-indicators');details.hidden=true;
    details.append(node('summary','Resumen QC'),node('div',null,'qco-indicator-list'));form.append(details);
    const foot=node('div',null,'qco-footer');
    const cancel=node('button','Cerrar','qco-secondary');cancel.type='button';cancel.addEventListener('click',()=>close());
    const submit=node('button','Guardar','qco-save');submit.type='submit';submit.disabled=true;
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
    original=JSON.stringify(snapshot());initialSnapshot=original;
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
