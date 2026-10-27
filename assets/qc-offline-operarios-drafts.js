'use strict';
// ViguerAPP TEST. Borradores QC locales; envío manual protegido por versión+ETag en API existente.
(function(){
 const DB='viguerapp-qc-local-drafts-test-v1',STORE='items',LIMIT=300;
 const CATS=[
  ['color','Color',[['verde','Verde'],['amarillo','Amarillo'],['verdeClaro','Verde claro'],['ok','OK'],['noEvaluada','No evaluada']]],
  ['tamano','Tamaño',[['grande','Grande'],['pequeno','Pequeño'],['ok','OK'],['noEvaluada','No evaluada']]],
  ['sanidad','Sanidad',[['ok','OK'],['enfermedad1','Enfermedad 1'],['enfermedad2','Enfermedad 2'],['enfermedad3','Enfermedad 3'],['enfermedad4','Enfermedad 4'],['noEvaluada','No evaluada']]],
  ['flores','Flores',[['ok','Ok'],['si','Con flores'],['noEvaluada','No evaluada']]],
  ['raices','Raíces',[['pocaRaiz','Poca raíz'],['raizVariedad','Raíz en variedad'],['ok','OK'],['noEvaluada','No evaluada']]]
 ];
 const HEALTH=['enfermedad1','enfermedad2','enfermedad3','enfermedad4'];
 // El detalle por enfermedad v3 persiste solo en los borradores históricos.
 let owner='',role='',drafts=new Map(),editor=null,active=null,startValue='',syncing=false;
 function requireSession(){
  if(window.QCPhotoMainSession){
   const state=window.QCPhotoMainSession();
   if(!state||state.user!==owner||state.role!==role)
    throw Error('La sesión ha cambiado. Borrador conservado en IndexedDB.');
  }
  if(window.QCOfflineSessionGuard&&!window.QCOfflineSessionGuard.active())
   throw Error('La sesión ha cambiado. Borrador conservado; vuelve a iniciar sesión.');
 }
 const el=(tag,value)=>{const node=document.createElement(tag);if(value!==undefined)node.textContent=String(value);return node};
 const key=r=>JSON.stringify([owner,role,r.tipo,r.id]);
 const allowed=tipo=>(role==='ADMIN'||role==='TECNICO'||role==='CARGADOR'&&tipo==='carga')&&
  (tipo==='tunel'||tipo==='carga');
 const refValid=r=>r&&/^[A-Za-z0-9_-]{1,180}$/.test(r.id)&&
  /^[A-Za-z0-9._-]{1,100}$/.test(r.partida)&&Number.isInteger(r.dia)&&r.dia>=15&&r.dia<=4000&&
  allowed(r.tipo);
 const quantity=v=>Number.isSafeInteger(v)&&v>=1&&v<=10000000;
 function db(){
  if(!window.indexedDB)return Promise.reject(Error('IndexedDB no disponible'));
  return new Promise((resolve,reject)=>{
   const req=indexedDB.open(DB,1);
   req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))
    req.result.createObjectStore(STORE,{keyPath:'key'});};
   req.onsuccess=()=>resolve(req.result);
   req.onerror=()=>reject(Error('Almacenamiento local no disponible'));
   req.onblocked=()=>reject(Error('Almacenamiento local bloqueado'));
  });
 }
 async function operation(mode,cb){
  const connection=await db();
  return new Promise((resolve,reject)=>{
   let tx,answer;
   try{tx=connection.transaction(STORE,mode);
    const req=cb(tx.objectStore(STORE));
    req.onsuccess=()=>{answer=req.result};}
   catch(e){connection.close();reject(e);return;}
   tx.oncomplete=()=>{connection.close();resolve(answer)};
   tx.onabort=()=>{connection.close();reject(Error('No se pudo guardar en este dispositivo'))};
  });
 }
 function validate(v){
  const total=v.bandejasInspeccionadas;
  if(v.schemaVersion===5){
   if(!quantity(total))throw Error('Falta el total de bandejas.');
   const cs=v.categorias,g=v.porcentajeInvalidasGlobal;
   if(!cs||Object.keys(cs).sort().join('|')!==CATS.map(x=>x[0]).sort().join('|')||
      !Number.isInteger(g)||g<0||g>100||g%10!==0)
    throw Error('Evaluación o porcentaje global inválidos.');
   let hasIssue=false;
   for(const [cat,name,opts] of CATS){
    const item=cs[cat],health=cat==='sanidad';
    if(!item||Object.keys(item).sort().join('|')!==(health?'opciones|porcentajesEnfermedades':'opciones'))
     throw Error(name+': estructura inválida.');
    const selected=item.opciones;
    const choices=new Set(opts.map(o=>o[0]));
    if(!Array.isArray(selected)||!selected.length||new Set(selected).size!==selected.length||
       selected.some(k=>!choices.has(k))||
       (!health&&selected.length!==1)||
       (selected.length>1&&(selected.includes('ok')||selected.includes('noEvaluada'))))
     throw Error(name+': selección no válida.');
    const disease=selected.filter(k=>k!=='ok'&&k!=='noEvaluada');
    if(disease.length)hasIssue=true;
    if(!health)continue;
    const detail=item.porcentajesEnfermedades;
    if(!detail||typeof detail!=='object'||Array.isArray(detail)||
       Object.keys(detail).length!==disease.length||
       Object.keys(detail).some(k=>!disease.includes(k)))
     throw Error('Sanidad: falta porcentaje por enfermedad.');
    let sum=0;
    for(const key of disease){
     const pct=detail[key];
     if(!HEALTH.includes(key)||!Number.isInteger(pct)||pct<10||pct>100||pct%10)
      throw Error('Sanidad: porcentaje individual incorrecto.');
     sum+=pct;
    }
    if(sum>100)throw Error('Sanidad: suma superior al 100 %.');
   }
   if(!hasIssue&&g!==0)
    throw Error('Sin incidencias el porcentaje global debe ser 0 %.');
   return v;
  }
  if(v.schemaVersion===4){
   if(!quantity(total))throw Error('Falta el total de bandejas.');
   const cats=v.categorias;
   if(!cats||Object.keys(cats).sort().join('|')!==CATS.map(x=>x[0]).sort().join('|'))
    throw Error('Categorías incompletas.');
   for(const [cat,name,opts] of CATS){
    const item=cats[cat],a=item?.opciones,p=item?.porcentajeInvalidas;
    const allowed=new Set(opts.map(([key])=>key));
    if(!item||Object.keys(item).sort().join('|')!=='opciones|porcentajeInvalidas'||
       !Array.isArray(a)||!a.length||new Set(a).size!==a.length||
       a.some(k=>!allowed.has(k))||!Number.isInteger(p)||p<0||p>100||p%10)
      throw Error(name+': selección o porcentaje no válido.');
    if(cat!=='sanidad'&&a.length!==1)throw Error(name+': solo una opción.');
    if(cat==='sanidad'&&a.length>1&&(a.includes('ok')||a.includes('noEvaluada')))
      throw Error('Sanidad: OK y las enfermedades son incompatibles.');
    const affected=a.some(k=>k!=='ok'&&k!=='noEvaluada');
    if(affected&&p<10||!affected&&p!==0)
      throw Error(name+': el porcentaje debe corresponder al estado.');
   }
   return v;
  }
  if(v.categorias){
   if(!quantity(total))throw Error('Falta el total de bandejas.');
   for(const [cat,name,opts] of CATS){
    const item=v.categorias[cat],a=item?.opciones,p=item?.porcentajeInvalidas;
    const disease=cat==='sanidad'&&item?.porcentajesEnfermedades;
    const allowed=new Set([...opts.map(([key])=>key),
      ...(cat==='sanidad'&&!disease?['enferma']:[])]);
    if(!Array.isArray(a)||!a.length||new Set(a).size!==a.length||a.some(k=>!allowed.has(k))||
      !Number.isInteger(p)||p<0||p>100||p%10)throw Error(name+': selección o porcentaje no válido.');
    if(disease){
     const keys=a.filter(k=>HEALTH.includes(k)),entries=Object.keys(disease);
     if(typeof disease!=='object'||Array.isArray(disease)||
        entries.length!==keys.length||entries.some(k=>!keys.includes(k)))
       throw Error('Sanidad: faltan porcentajes por enfermedad.');
     const sum=keys.reduce((acc,k)=>acc+disease[k],0);
     if(keys.some(k=>!Number.isInteger(disease[k])||disease[k]<10||disease[k]>100||disease[k]%10)||
        sum>100||p!==Math.floor(sum/10)*10||
        (!keys.length&&a.length!==1))
       throw Error('Sanidad: los porcentajes individuales no cuadran o superan el 100 %.');
     continue;
    }
    if(a.includes('noEvaluada')&&a.length!==1)throw Error(name+': No evaluada debe estar sola.');
    if(a.length===1&&p!==(a[0]==='ok'||a[0]==='noEvaluada'?0:100))
     throw Error(name+': porcentaje incompatible con la selección.');
   }
   return v;
  }
  if(!quantity(total))throw Error('Indica un número entero positivo de bandejas inspeccionadas.');
  for(const [category,name,opts] of CATS){
   const values=v.mediciones[category],entries=Object.entries(values);
   if(!entries.length)throw Error(name+': falta clasificar las bandejas.');
   // Borradores cuantitativos v1 podían registrar Flores/No: conservar su envío original.
   for(const [option,n] of entries)if(!(opts.some(x=>x[0]===option)||
       category==='flores'&&option==='no'||category==='sanidad'&&option==='enferma')||!quantity(n)||n>total)
    throw Error(name+': cantidad incorrecta.');
   if(category==='raices'){
    const no=values.noEvaluada||0,ok=values.ok||0,affected=total-no-ok;
    const low=values.pocaRaiz||0,variety=values.raizVariedad||0;
    if(no>total||affected<Math.max(low,variety)||affected>low+variety)
     throw Error('Raíces: las bandejas no cuadran (los defectos pueden solaparse).');
   }else if(entries.reduce((n,x)=>n+x[1],0)!==total)
    throw Error(name+': no coincide con el total de bandejas inspeccionadas.');
  }
  return v;
 }
 function input(form){
  const out={schemaVersion:5,
    bandejasInspeccionadas:Number(form.elements.namedItem('total').value),
    categorias:{},
    porcentajeInvalidasGlobal:Number(form.elements.namedItem('globalPct').value)};
  for(const [cat] of CATS){
   const field=form.querySelector('[data-qc-cat="'+cat+'"]');
   const selected=Array.from(field.querySelectorAll('input[type="checkbox"]:checked')).map(x=>x.value);
   const item={opciones:selected};
   if(cat==='sanidad'){
    item.porcentajesEnfermedades={};
    for(const k of HEALTH){
     if(selected.includes(k))item.porcentajesEnfermedades[k]=
       Number(field.querySelector('select[data-qc-disease="'+k+'"]').value);
    }
   }
   out.categorias[cat]=item;
  }
  return out;
 }
 function close(){
  if(!editor)return;
  if(active&&JSON.stringify(input(editor.querySelector('form')))!==startValue&&
   !confirm('¿Descartar los cambios del borrador no guardado?'))return;
  editor.remove();editor=null;active=null;
 }
 async function open(ref,button,label){
  requireSession();
  if(editor||syncing||!refValid(ref))return;
  active=ref;
  const draft=drafts.get(key(ref));
  if(draft?.status==='ENVIO_INCIERTO'&&!confirm(
   'Este borrador tiene un envío anterior sin confirmar. Si lo editas, '+
   'se conservarán las nuevas cantidades, pero tendrás que comprobar '+
   'el servidor antes de enviarlas. ¿Continuar?')){
    active=null;return;
  }
  editor=el('section');
  editor.style.cssText='position:fixed;inset:0;overflow:auto;z-index:100100;background:#f0f4f8;color:#17324e;padding:18px 14px 45px';
  editor.setAttribute('role','dialog');editor.setAttribute('aria-label','Borrador local de cantidades');
  const frame=el('div');frame.style.cssText='max-width:650px;margin:auto';
  const title=el('h2','Borrador local · '+(ref.tipo==='tunel'?'Túnel':'Carga')+' · '+ref.partida);
  title.style.cssText='font-size:20px;color:#1558a0';
  const hint=el('p','No se enviará al servidor. Solo disponible en este dispositivo.');
  const form=el('form');form.noValidate=true;
  const total=el('div','Bandejas de la partida:');
  total.style.cssText='display:flex;gap:8px;align-items:center;color:#1558a0;font-weight:800;margin:12px 0';
  const sourceTotal=quantity(Number(ref.bandejas))&&/^\d+$/.test(String(ref.bandejas||'').trim())?Number(ref.bandejas):null;
  const initialTotal=draft?.bandejasInspeccionadas||sourceTotal;
  const visibleTotal=el('strong',initialTotal?initialTotal.toLocaleString('es-ES'):'No disponible');
  total.append(visibleTotal);
  const totalInput=el('input');totalInput.type='hidden';totalInput.name='total';totalInput.value=initialTotal||'';
  total.append(totalInput);form.append(total);
  const current=draft?.schemaVersion===5;
   const findSelected=cat=>{
   const old=draft?.mediciones?.[cat];
   const options=draft?.categorias?.[cat]?.opciones;
   return Array.isArray(options)?options.slice():
     old?Object.keys(old).filter(k=>Number(old[k])>0):['ok'];
  };
   for(const [cat,name,opts] of CATS){
   const field=el('fieldset');field.dataset.qcCat=cat;
   field.style.cssText='border:1px solid #cad9e7;border-radius:9px;padding:11px;margin:10px 0;background:#fff';
   const legend=el('legend',name);legend.style.cssText='font-size:14px;font-weight:800;color:#1558a0';
   field.append(legend);
   const choices=el('div');choices.style.cssText='display:grid;grid-template-columns:minmax(0,1fr);gap:6px';
   let selected=findSelected(cat);
   selected=[...new Set(selected.map(k=>cat==='flores'&&k==='no'?'ok':k))];
   let warning='';
   if(selected.includes('noEvaluada')){
    warning='Esta categoría estaba sin evaluar. Selecciona un estado para actualizarla.';selected=[];
   }else if(cat==='sanidad'){
    if(selected.includes('enferma')){
     warning='Sanidad antigua sin diagnóstico; selecciona enfermedades reales.';selected=[];
    }else if(selected.includes('ok')&&selected.some(k=>HEALTH.includes(k))){
     warning='Sanidad anterior: OK y enfermedades combinadas. Vuelve a seleccionarlas.';selected=[];
    }
   }else if(selected.length>1){
    warning='Medición anterior con múltiples estados. Selecciona solo uno.';selected=[];
   }
    field.dataset.legacyUnresolved=warning?'1':'0';
   for(const [opt,desc] of [...opts.filter(x=>x[0]==='ok'),...opts.filter(x=>x[0]!=='ok'&&x[0]!=='noEvaluada')]){
    const disease=cat==='sanidad'&&HEALTH.includes(opt);
    const row=el(disease?'div':'label');
    row.style.cssText='box-sizing:border-box;display:flex;width:100%;align-items:center;gap:9px;min-height:43px;border:1px solid #cadcec;border-radius:8px;padding:7px 11px;background:#f6f9fd;color:#294968;font-size:13px;font-weight:750';
    row.dataset.qcRow=opt;
    const labelEl=disease?el('label'):row;
    labelEl.style.cssText='display:flex;flex:1;min-width:0;align-items:center;gap:9px;cursor:pointer';
    const box=el('input');box.type='checkbox';box.value=opt;box.checked=selected.includes(opt);
    box.style.cssText='width:19px;height:19px;accent-color:#1558a0;flex:none';
    labelEl.append(box,el('span',desc));
    if(disease){
     row.append(labelEl);
     const picker=el('select');picker.dataset.qcDisease=opt;
     picker.style.cssText='box-sizing:border-box;width:106px;min-height:43px;margin-left:auto;padding:6px 7px;border:1px solid #adc8e5;border-radius:7px;background:#fff;color:#1558a0;font-size:15px;font-weight:800;flex:none';
     picker.setAttribute('aria-label',desc+' · porcentaje');
     for(let n=0;n<=100;n+=10){const option=el('option',n+' %');option.value=String(n);picker.append(option);}
     const prior=draft?.categorias?.sanidad?.porcentajesEnfermedades?.[opt];
     picker.value=selected.includes(opt)&&Number.isInteger(prior)&&prior>=10?String(prior):'0';
     picker.dataset.previous=picker.value==='0'?'10':picker.value;
     picker.disabled=!box.checked;
     picker.addEventListener('change',()=>{
      if(sumDisease()>100){
       picker.value=picker.dataset.previous;
       feedback.textContent='Sanidad: máximo 100 % sumando porcentajes.';
      }else{picker.dataset.previous=picker.value;feedback.textContent='';}
      updateGlobal(true);
     });
     row.append(picker);
    }
    choices.append(row);
   }
   field.append(choices);
    const paint=()=>{
    for(const row of choices.children){
     const checked=!!row.querySelector('input[type=checkbox]')?.checked;
     row.style.background=checked?'#e2f0ff':'#f6f9fd';
     row.style.borderColor=checked?'#2874b8':'#cadcec';
     row.style.color=checked?'#104f88':'#294968';
    }
   };
   for(const box of choices.querySelectorAll('input[type=checkbox]')){
    box.addEventListener('change',()=>{
      if(box.checked){
      if(cat==='sanidad'){
       if(box.value==='ok'||box.value==='noEvaluada'){
        choices.querySelectorAll('input[type=checkbox]').forEach(other=>{if(other!==box)other.checked=false;});
        field.querySelectorAll('select[data-qc-disease]').forEach(p=>p.value='0');
       }else{
        for(const key of ['ok','noEvaluada']){
         const exclusive=choices.querySelector('input[value="'+key+'"]');if(exclusive)exclusive.checked=false;
        }
        const picker=box.closest('[data-qc-row]').querySelector('select[data-qc-disease]');
        picker.value='10';picker.dataset.previous='10';
        if(sumDisease()>100){box.checked=false;picker.value='0';feedback.textContent='Sanidad: máximo 100 %.';}
       }
      }else choices.querySelectorAll('input[type=checkbox]').forEach(other=>{if(other!==box)other.checked=false;});
     }else if(cat==='sanidad'&&HEALTH.includes(box.value)){
      box.closest('[data-qc-row]').querySelector('select[data-qc-disease]').value='0';
     }
     field.dataset.legacyUnresolved='0';
     paint();updateDiseaseDisabled();updateGlobal(true);
    });
   }
   paint();form.append(field);
  }
  const percentSection=el('section');
  percentSection.style.cssText='border:1px solid #a7c8eb;border-radius:10px;padding:15px 13px;margin:16px 0 10px;background:#edf5ff';
  const titlePercent=el('strong','Porcentaje global de inválidas');
  titlePercent.style.cssText='font-size:15px;font-weight:800;color:#1558a0';
  const line=el('label');
  line.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:12px;padding-top:10px;font-size:13px;color:#245886;font-weight:700';
  line.append(el('span','Total evaluación'));
  const global=el('select');global.name='globalPct';
  global.style.cssText='width:120px;min-height:46px;margin-left:auto;padding:8px 10px;border:1px solid #8db6de;border-radius:8px;background:#fff;color:#1558a0;font-size:17px;font-weight:800';
  for(let n=0;n<=100;n+=10){const option=el('option',n+' %');option.value=String(n);global.append(option);}
  global.value=current?String(draft.porcentajeInvalidasGlobal):'0';
  const feedback=el('p');feedback.setAttribute('role','alert');feedback.style.cssText='color:#a32c27;font-size:12px';
  const hasProblems=()=>CATS.some(([cat])=>Array.from(form.querySelectorAll('[data-qc-cat="'+cat+'"] input[type=checkbox]:checked')).some(k=>k.value!=='ok'&&k.value!=='noEvaluada'));
  const healthField=()=>form.querySelector('[data-qc-cat="sanidad"]');
  const maxDisease=()=>Math.max(0,...Array.from(healthField().querySelectorAll('select[data-qc-disease]')).map(p=>
   p.closest('[data-qc-row]').querySelector('input[type=checkbox]').checked?Number(p.value):0));
  const sumDisease=()=>Array.from(healthField().querySelectorAll('select[data-qc-disease]')).reduce((n,p)=>
   n+(p.closest('[data-qc-row]').querySelector('input[type=checkbox]').checked?Number(p.value):0),0);
  const updateDiseaseDisabled=()=>healthField().querySelectorAll('select[data-qc-disease]').forEach(p=>{
   p.disabled=!p.closest('[data-qc-row]').querySelector('input[type=checkbox]').checked;
  });
  // Fórmula: media de los cinco bloques; enfermedades sumadas dentro de Sanidad.
  const suggestedGlobal=()=>{
   let sum=0;
   for(const [cat] of CATS){
    if(cat==='sanidad')sum+=Math.min(100,sumDisease());
    else{
     const selected=Array.from(form.querySelectorAll('[data-qc-cat="'+cat+'"] input[type=checkbox]:checked'));
     if(selected.some(x=>x.value!=='ok'&&x.value!=='noEvaluada'))sum+=100;
    }
   }
   return Math.floor(sum/CATS.length/10)*10;
  };
  const updateGlobal=(recalculate=false)=>{
   if(recalculate)global.value=String(suggestedGlobal());
   if(!hasProblems()){global.value='0';global.disabled=true;}
   else global.disabled=false;
  };
  global.addEventListener('change',()=>{feedback.textContent='';});
  line.append(global);percentSection.append(titlePercent,line,feedback);
  form.append(percentSection);
  updateDiseaseDisabled();updateGlobal(!current);


   const info=el('p');info.setAttribute('role','alert');info.style.color='#9b1631';
  const actions=el('div');actions.style.cssText='display:flex;gap:10px;flex-wrap:wrap;margin-top:16px';
  const cancel=el('button','Volver');cancel.type='button';
  const save=el('button','Guardar en dispositivo');save.type='submit';
  for(const b of [cancel,save])b.style.cssText='background:#1558a0;color:#fff;font-weight:700;border:0;border-radius:8px;padding:12px';
  cancel.style.background='#697e93';
  cancel.addEventListener('click',close);
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(!active)return;
   save.disabled=true;
   try{
    requireSession();
    if(Array.from(form.querySelectorAll('fieldset[data-qc-cat]')).some(x=>x.dataset.legacyUnresolved==='1'))
     throw Error('La inspección anterior tiene varias opciones. Selecciona expresamente el nuevo estado antes de guardar.');
    const data=validate(input(form));
    const isNew=!drafts.has(key(ref));
    if(isNew&&drafts.size>=LIMIT)throw Error('Hay demasiados borradores. Conéctate para revisarlos.');
    const stored={key:key(ref),owner,role,ref:{id:ref.id,tipo:ref.tipo,dia:ref.dia,partida:ref.partida},
      ...data,
      ...(draft?.mediciones?{legacyMediciones:draft.mediciones}:{}),
      ...(draft?.categorias&&!draft.legacyCategorias?{legacyCategorias:draft.categorias}:
        draft?.legacyCategorias?{legacyCategorias:draft.legacyCategorias}:{}),
      at:Date.now(),status:'PENDIENTE_LOCAL'};
    await operation('readwrite',s=>s.put(stored));
    drafts.set(key(ref),stored);
    window.dispatchEvent(new Event('qc-local-updated'));
    active=null;close();
    button.textContent='Editar borrador';
    if(button.parentElement&&!button.parentElement.querySelector('[data-qc-check]'))
     button.parentElement.append(makeCheckButton(ref));
    if(!label.textContent)label.textContent='Borrador guardado en dispositivo · pendiente de sincronizar';
    const status=document.getElementById('status');
    if(status)status.textContent='Borrador LOCAL guardado. No se ha enviado al servidor.';
   }catch(e){info.textContent=e.message||'No se pudo guardar el borrador';}
   finally{save.disabled=false;}
  });
  actions.append(cancel,save);form.append(info,actions);
  frame.append(title,hint,form);editor.append(frame);document.body.append(editor);
  startValue=JSON.stringify(input(form));
 }
 async function init(user,userRole){
  if(typeof user!=='string'||!user||!['ADMIN','TECNICO','CARGADOR'].includes(userRole))
   throw Error('LOGIN_REQUIRED');
  owner=user;role=userRole;
  const all=await operation('readonly',s=>s.getAll());
  drafts=new Map((all||[]).filter(x=>x.owner===owner&&x.role===role&&
   (x.status==='PENDIENTE_LOCAL'||x.status==='ENVIO_INCIERTO')&&refValid(x.ref))
   .map(x=>[x.key,x]));
  return drafts.size;
 }
 // Primera fase de sincronización: comprobación REMOTA de SOLO LECTURA.
 // No hace POST de inspecciones y no borra ningún borrador local.
 async function checkServer(ref){
  requireSession();
  if(!navigator.onLine)throw Error('Sin conexión. El borrador sigue guardado localmente.');
  if(!refValid(ref)||!drafts.has(key(ref)))throw Error('No hay un borrador autorizado para comprobar.');
  let auth,session;
  try{
   auth=JSON.parse(localStorage.getItem('lasala-firebase-auth-v1')||'null');
   session=JSON.parse(localStorage.getItem('lasala-sesion-v1')||'null');
  }catch(_){throw Error('No hay una sesión válida. Inicia sesión de nuevo.');}
  const sessionRole=window.QCPhotoMainSession?
    window.QCPhotoMainSession()?.role:localStorage.getItem('viguerapp-qc-offline-role-test-v1');
  if(!auth?.refreshToken||auth.user!==owner||session?.user!==owner||sessionRole!==role)
   throw Error('La sesión ha cambiado. Conéctate y vuelve a iniciar sesión.');
  let token;
  try{
   const refresh=await fetch('https://securetoken.googleapis.com/v1/token?key=AIzaSyDdDdMg6M1jVIssvGYKsdRA-mRug31Yt_g',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'refresh_token',refresh_token:auth.refreshToken}).toString(),
    cache:'no-store',signal:AbortSignal.timeout(12000)
   });
   if(!refresh.ok)throw Error('LOGIN_REQUIRED');
   const data=await refresh.json();
   if(!data.id_token||!data.refresh_token)throw Error('LOGIN_REQUIRED');
   token=data.id_token;
   requireSession();
   // Mismo esquema de sesión utilizado por el frontend QC online.
   localStorage.setItem('lasala-firebase-auth-v1',
    JSON.stringify({user:owner,refreshToken:data.refresh_token}));
  }catch(_){throw Error('No se ha podido validar la sesión. El borrador sigue local.');}
  try{
   const q=new URLSearchParams({id:ref.id,tipo:ref.tipo,dia:String(ref.dia)});
   const response=await fetch('/api/admin-qc-mediciones?'+q.toString(),{
    method:'GET',headers:{Authorization:'Bearer '+token},cache:'no-store',
    signal:AbortSignal.timeout(18000)
   });
   if(response.status===401||response.status===403)
    throw Error('Acceso rechazado. Comprueba el usuario y sus permisos.');
   if(response.status===409)throw Error('La inspección ha cambiado o ya no existe en origen.');
   if(!response.ok)throw Error('No se pudo consultar el servidor (HTTP '+response.status+').');
   const result=await response.json();
   requireSession();
   if(result.ok!==true||result.sourcePartida!==ref.partida||
     !Object.prototype.hasOwnProperty.call(result,'record'))
    throw Error('La respuesta del servidor no coincide con la inspección.');
   if(result.record!==null){
    if(!Number.isInteger(result.record.version)||result.record.version<1)
     throw Error('La medición remota no tiene una versión válida.');
    return {state:'CONFLICT',token,record:result.record};
   }
   return {state:'EMPTY',token,record:null};
  }catch(e){
   if(e instanceof TypeError||e?.name==='AbortError'||e?.name==='TimeoutError')
    throw Error('Conexión interrumpida o tiempo agotado. Se conserva el borrador.');
   throw e;
  }
 }
 // Un corte puede producirse tras el PUT remoto y antes de su respuesta.
 // Es obligatorio persistir el intento ANTES de enviar: nunca tratar una foto
 // o un borrador con POST incierto como si nunca hubiera sido enviado.
 const canonical=value=>JSON.stringify(value);
 const matches=(stored,draft)=>{
  if(!stored||stored.bandejasInspeccionadas!==draft.bandejasInspeccionadas)return false;
  if(draft.categorias)return
    (draft.schemaVersion!==5||
      stored.schemaVersion===5&&stored.porcentajeInvalidasGlobal===draft.porcentajeInvalidasGlobal)&&
    CATS.every(([cat])=>JSON.stringify(stored.categorias?.[cat])===JSON.stringify(draft.categorias[cat]));
  return CATS.every(([cat])=>{
   const actual=stored.mediciones?.[cat],expected=draft.mediciones?.[cat];
   return !!actual&&!!expected&&Object.keys(actual).length===Object.keys(expected).length&&
    Object.keys(expected).every(k=>actual[k]===expected[k]);
  });
 };
 // El servidor no almacena ID de intento. Para dar por nuestro un envío
 // anterior se exige además el mismo usuario, versión 1 y fecha posterior
 // al intento guardado. Si falta alguna evidencia, conservar el borrador.
 function ownedRemote(record,d){
  const started=Date.parse(d.attemptedAt||'');
  const written=Date.parse(record?.updatedAt||'');
  return d.status==='ENVIO_INCIERTO'&&record?.version===1&&
   record.updatedBy===owner&&Number.isFinite(started)&&
   Number.isFinite(written)&&written>=started-2000&&matches(record,d);
 }
 async function markAttempt(d){
  const connection=await db();
  return new Promise((resolve,reject)=>{
   const tx=connection.transaction(STORE,'readwrite');
   const store=tx.objectStore(STORE),get=store.get(d.key);
   let next=null;
   get.onsuccess=()=>{
    const current=get.result;
    if(!current||current.owner!==owner||current.role!==role||
       current.at!==d.at||canonical(current.categorias||current.mediciones)!==canonical(d.categorias||d.mediciones)||
       current.bandejasInspeccionadas!==d.bandejasInspeccionadas||
       current.porcentajeInvalidasGlobal!==d.porcentajeInvalidasGlobal||
       !refValid(current.ref)||current.ref.id!==d.ref.id||
       !['PENDIENTE_LOCAL','ENVIO_INCIERTO'].includes(current.status)){
      tx.abort();return;
    }
    next={...current,status:'ENVIO_INCIERTO',attemptedAt:new Date().toISOString()};
    store.put(next);
   };
   tx.oncomplete=()=>{connection.close();drafts.set(d.key,next);resolve(next);};
   tx.onabort=()=>{connection.close();reject(Error(
    'El borrador ha cambiado o no pudo marcarse para envío. No se ha enviado.'));};
  });
 }
 async function removeVerified(d){
  const connection=await db();
  return new Promise((resolve,reject)=>{
   const tx=connection.transaction(STORE,'readwrite');
   const store=tx.objectStore(STORE),get=store.get(d.key);
   get.onsuccess=()=>{
    const current=get.result;
    if(!current||current.owner!==owner||current.role!==role||
       current.at!==d.at||canonical(current.categorias||current.mediciones)!==canonical(d.categorias||d.mediciones)||
       current.bandejasInspeccionadas!==d.bandejasInspeccionadas||
       !refValid(current.ref)||current.ref.id!==d.ref.id||
       current.status!=='ENVIO_INCIERTO'){
      tx.abort();return;
    }
    store.delete(d.key);
   };
   tx.oncomplete=()=>{connection.close();drafts.delete(d.key);
    window.dispatchEvent(new Event('qc-local-updated'));resolve();};
   tx.onabort=()=>{connection.close();reject(Error(
    'El servidor tiene cantidades verificadas, pero cambió el borrador local. Se conserva.'));};
  });
 }
 async function readWritten(ref,token){
  const q=new URLSearchParams({id:ref.id,tipo:ref.tipo,dia:String(ref.dia)});
  const response=await fetch('/api/admin-qc-mediciones?'+q,{
   method:'GET',headers:{Authorization:'Bearer '+token},cache:'no-store',
   signal:AbortSignal.timeout(18000)
  });
  if(!response.ok)throw Error('No se ha podido verificar el guardado (HTTP '+response.status+').');
  const payload=await response.json();
  if(payload.ok!==true||payload.sourcePartida!==ref.partida)
   throw Error('No se puede verificar la inspección de origen.');
  return payload.record;
 }
 async function finishVerified(ref,d,label,button,status,message){
  await removeVerified(d);
  label.textContent='✓ Cantidades sincronizadas y verificadas en servidor';
  button.textContent='Sincronizado';button.disabled=true;
  const edit=button.parentElement?.parentElement?.querySelector('button');
  if(edit&&edit.textContent==='Editar borrador')edit.textContent='Anotar cantidades';
  status.textContent=message;
  const top=document.getElementById('status');
  if(top)top.textContent='✓ Sincronización QC confirmada; cantidades verificadas en servidor.';
 }
 async function syncDraft(ref,label,button,status,globalConfirmed=false){
  requireSession();
  if(syncing||editor)return;
  if(!refValid(ref)||!drafts.has(key(ref)))return;
  const d=drafts.get(key(ref));
  const review=d.status==='ENVIO_INCIERTO';
  if(!globalConfirmed&&!confirm(review?
   'Este borrador tiene un envío anterior sin confirmar. ¿Consultar primero '+
   'el servidor? No se reenviará nada sin tu permiso.':
   '¿Enviar las cantidades del borrador de la partida '+ref.partida+
   ' al servidor TEST? Se comprobará de nuevo que la inspección no tenga cantidades.'))return;
  syncing=true;button.disabled=true;
  status.textContent='Consultando inspección y versión en servidor…';
  let postAttempted=false,confirmed=false;
  try{
   // Siempre GET fresco. Ni errores 409 ni estados ambiguos justifican
   // escribir sobre datos de terceros; version:0 + ETag protege en la API.
   const before=await checkServer(ref);
   requireSession();
   if(drafts.get(key(ref))!==d)
    throw Error('El borrador cambió durante la comprobación. No se ha enviado.');
   if(before.state!=='EMPTY'){
    if(!ownedRemote(before.record,d))
     throw Error('Conflicto: la inspección ya tiene cantidades distintas o '+
      'no se puede atribuir el guardado a este borrador. No sobrescribir.');
    const remote=await readWritten(ref,before.token);
    requireSession();
    if(!ownedRemote(remote,d))
     throw Error('La inspección ha cambiado durante la verificación. No sobrescribir.');
    await finishVerified(ref,d,label,button,status,
     '✓ Envío anterior recuperado y verificado. Borrador local retirado; sin nuevo POST.');
    confirmed=true;return;
   }
   validate(d);
   if(review&&!confirm(
    'No hay cantidades registradas en servidor, pero hubo un envío anterior '+
    'sin confirmar. ¿Reintentar UNA vez el mismo borrador con versión 0? '+
    'El servidor impedirá sobrescribir una medición existente.'))
    throw Error('Reenvío cancelado. Borrador local conservado para revisión.');
   if(!navigator.onLine)throw Error('No hay conexión. Borrador conservado.');
   const payload={id:ref.id,tipo:ref.tipo,dia:ref.dia,partida:ref.partida,
    version:0,bandejasInspeccionadas:d.bandejasInspeccionadas,
    ...(d.schemaVersion===4||d.schemaVersion===5?{schemaVersion:d.schemaVersion}:{}),
    ...(d.schemaVersion===5?{porcentajeInvalidasGlobal:d.porcentajeInvalidasGlobal}:{}),
    ...(d.categorias?{categorias:d.categorias}:{mediciones:d.mediciones})};
   // Persistir el hecho del intento antes del POST; resiste recarga o cierre.
   const attempted=await markAttempt(d);
   postAttempted=true;
   requireSession();
   label.textContent='Envío anterior por revisar · borrador conservado';
   button.textContent='Revisar envío';
   status.textContent='Enviando una única vez…';
   let response;
   try{
    response=await fetch('/api/admin-qc-mediciones',{
     method:'POST',headers:{Authorization:'Bearer '+before.token,'Content-Type':'application/json'},
     body:JSON.stringify(payload),cache:'no-store',signal:AbortSignal.timeout(30000)
    });
   }catch(_){throw Error('Respuesta de envío no recibida. Debe comprobarse el servidor.');}
   if(response.status===409)throw Error('Conflicto: la inspección fue modificada. No sobrescribir.');
   if(response.status===401||response.status===403)throw Error('No autorizado para guardar esta inspección.');
   if(!response.ok)throw Error('Guardado sin confirmar (HTTP '+response.status+').');
   const result=await response.json();
   if(result.ok!==true||result.version!==1)throw Error('Guardado sin confirmación válida.');
   status.textContent='Verificando cantidades guardadas en servidor…';
   const remote=await readWritten(ref,before.token);
   requireSession();
   if(!ownedRemote(remote,attempted))throw Error(
    'La verificación del servidor no coincide con esta inspección. Mantener borrador local.');
   await finishVerified(ref,attempted,label,button,status,
    '✓ Guardado confirmado por lectura posterior. Borrador local retirado.');
   confirmed=true;
  }catch(e){
   // No hay reintentos automáticos; el borrador se guarda ante cualquier error.
   const uncertain=postAttempted||review;
   if(uncertain){
    label.textContent='Envío anterior por revisar · borrador conservado';
    button.textContent='Revisar envío';
   }
   status.textContent=(e?.message||'Error de sincronización')+' '+
    (uncertain?'Revisa el servidor antes de cualquier nuevo intento.':
      'No se ha enviado.')+' Se conserva el borrador.';
  }finally{syncing=false;if(!confirmed)button.disabled=false;}
 }
 function makeSyncButton(ref,label){
  const draft=drafts.get(key(ref));
  const button=el('button',draft?.status==='ENVIO_INCIERTO'?'Revisar envío':'Enviar a TEST');
  button.type='button';
  button.style.cssText='background:#1558a0;border:0;border-radius:7px;color:#fff;padding:8px 10px;font-weight:700';
  const status=el('span');status.setAttribute('role','status');
  status.style.cssText='font-size:12px;color:#33516b';
  button.addEventListener('click',()=>{void syncDraft(ref,label,button,status)});
  const box=el('div');box.dataset.qcSync='1';
  box.style.cssText='display:flex;flex-direction:column;gap:4px;align-items:flex-start';
  box.append(button,status);
  return box;
 }
 function makeCheckButton(ref){
  const btn=el('button','Comprobar servidor');
  btn.type='button';btn.style.cssText='background:#e5eef8;border:1px solid #9fb6d2;border-radius:7px;color:#1558a0;padding:8px 10px;font-weight:700';
  const status=el('span');status.setAttribute('role','status');
  status.style.cssText='font-size:12px;color:#33516b';
  btn.addEventListener('click',async()=>{
   if(btn.disabled)return;
   btn.disabled=true;status.textContent='Consultando estado en servidor…';
   try{
    const state=await checkServer(ref);
    status.textContent=state.state==='EMPTY'?
     'No hay cantidades en servidor. El borrador sigue local; NO se ha enviado.':
     'La inspección YA tiene cantidades en servidor. Revisión necesaria: no sobrescribir. El borrador sigue local.';
   }catch(e){status.textContent=(e?.message||'Consulta fallida')+' No se ha enviado el borrador.';}
   finally{btn.disabled=false;}
  });
  const wrapper=el('div');wrapper.style.cssText='display:flex;flex-direction:column;align-items:flex-start;gap:4px';
  wrapper.dataset.qcCheck='1';wrapper.append(btn,status);
  return wrapper;
 }
 // Recuperación independiente de la copia temporal de partidas (24 h).
 // Los borradores locales no caducan con el snapshot; un servidor real
 // vuelve a validar la inspección, partida, rol y versión antes del POST.
 function renderSaved(parent,visibleRefs=[]){
  if(!parent)return 0;
  parent.replaceChildren();
  const visible=new Set((Array.isArray(visibleRefs)?visibleRefs:[])
   .filter(refValid).map(r=>key(r)));
  const pending=[...drafts.values()]
   .filter(d=>d&&d.key===key(d.ref)&&refValid(d.ref)&&!visible.has(d.key))
   .sort((a,b)=>b.at-a.at);
  if(!pending.length){parent.hidden=true;return 0;}
  const title=el('h2','Borradores de cantidades guardados');
  title.style.cssText='font-size:17px;margin:12px 0;color:#17324e';
  const note=el('p','La copia de estas inspecciones no está disponible. '+
   'Tus cantidades siguen guardadas aquí. Para enviarlas hay que tener Internet; '+
   'se comprobarán la partida y las cantidades del servidor antes de guardar.');
  note.style.cssText='font-size:13px;color:#33516b;margin:4px 0 12px';
  parent.append(title,note);
  for(const d of pending){
   const card=el('div');card.className='item';
   const area=el('div');
   area.append(el('strong',d.ref.partida),
    el('span',(d.ref.tipo==='tunel'?'QC Túnel':'QC Carga')+
     ' · Inspección '+d.ref.id),
    el('span',d.bandejasInspeccionadas+' bandejas inspeccionadas'));
   decorate(area,d.ref);
   card.append(area);
   parent.append(card);
  }
  parent.hidden=false;
  return pending.length;
 }
 function decorate(item,ref){
  if(!refValid(ref))return;
  const saved=drafts.has(key(ref));
  const footer=el('div');footer.style.cssText='display:flex;flex-direction:column;align-items:flex-start;gap:5px;margin-top:8px';
  const d=drafts.get(key(ref));
  const label=el('span',saved?(d.status==='ENVIO_INCIERTO'?
   'Envío anterior por revisar · borrador conservado':
   'Borrador guardado en dispositivo · pendiente de sincronizar'):'');
  label.style.cssText='font-size:12px;font-weight:700;color:#8c5400';
  const button=el('button',saved?'Editar borrador':'Anotar cantidades');
  button.type='button';button.style.cssText='background:#1558a0;border:0;border-radius:7px;color:white;padding:8px 10px;font-weight:700';
  button.addEventListener('click',()=>{void open(ref,button,label)});
  footer.append(label,button);
  if(saved)footer.append(makeCheckButton(ref));
  item.append(footer);
 }
 // El bloqueo por cambio de sesión cierra un editor abierto, pero NO toca
 // IndexedDB ni elimina ningún borrador previamente guardado.
 function lock(){
  if(editor){editor.remove();editor=null;}
  active=null;
 }

 // 0.113: lote centralizado, reusa los mismos GET/ETag/version/POST
 // y el protocolo de intento incierto de syncDraft; nunca escribe directo.
 function pendingGlobal(){return [...drafts.values()].filter(d=>
   d&&d.key===key(d.ref)&&refValid(d.ref)&&
   (d.status==='PENDIENTE_LOCAL'||d.status==='ENVIO_INCIERTO'))
  .map(d=>({ref:{...d.ref},status:d.status}));}
 async function syncGlobal(onProgress){
  requireSession();
  if(syncing||editor)throw Error('Cierra la edición QC antes de sincronizar.');
  const queue=pendingGlobal();
  let verified=0;const errors=[],blocked=[];
  for(let i=0;i<queue.length;i++){
    requireSession();
    if(!navigator.onLine)break;
    const item=queue[i];
    const label=el('span'),button=el('button'),status=el('span');
    const wrapper=el('div');const parent=el('div');parent.append(wrapper);wrapper.append(button);
    onProgress?.('Inspección '+(i+1)+'/'+queue.length+' · '+item.ref.partida);
    try{
      await syncDraft(item.ref,label,button,status,true);
      if(!drafts.has(key(item.ref)))verified++;
      else{
        blocked.push(item.ref.id);
        errors.push(item.ref.partida+': '+(status.textContent||'Pendiente de revisión'));
      }
    }catch(e){
      blocked.push(item.ref.id);
      errors.push(item.ref.partida+': '+(e?.message||'Error de sincronización'));
    }
  }
  return {total:queue.length,verified,blocked,errors,remaining:pendingGlobal().length};
 }

 window.QCOfflineDraftEditor=Object.freeze({init,decorate,renderSaved,lock,pendingGlobal,syncGlobal});
})();
