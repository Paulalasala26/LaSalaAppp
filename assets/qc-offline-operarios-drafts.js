'use strict';
// ViguerAPP TEST. Borradores QC únicamente locales. NO llama a APIs ni escribe Firebase.
(function(){
 const DB='viguerapp-qc-local-drafts-test-v1',STORE='items',LIMIT=300;
 const CATS=[
  ['color','Color',[['verde','Verde'],['amarillo','Amarillo'],['verdeClaro','Verde claro'],['ok','OK'],['noEvaluada','No evaluada']]],
  ['tamano','Tamaño',[['grande','Grande'],['pequeno','Pequeño'],['ok','OK'],['noEvaluada','No evaluada']]],
  ['sanidad','Sanidad',[['ok','OK'],['enferma','Enferma'],['noEvaluada','No evaluada']]],
  ['flores','Flores',[['si','Sí'],['no','No'],['noEvaluada','No evaluada']]],
  ['raices','Raíces',[['pocaRaiz','Poca raíz'],['raizVariedad','Raíz en variedad'],['ok','OK'],['noEvaluada','No evaluada']]]
 ];
 let owner='',role='',drafts=new Map(),editor=null,active=null,startValue='';
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
  if(!quantity(total))throw Error('Indica un número entero positivo de bandejas inspeccionadas.');
  for(const [category,name,opts] of CATS){
   const values=v.mediciones[category],entries=Object.entries(values);
   if(!entries.length)throw Error(name+': falta clasificar las bandejas.');
   for(const [option,n] of entries)if(!opts.some(x=>x[0]===option)||!quantity(n)||n>total)
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
  const result={bandejasInspeccionadas:Number(form.elements.namedItem('total').value),mediciones:{}};
  for(const [cat,,opts] of CATS){
   result.mediciones[cat]={};
   for(const [opt] of opts){
    const raw=form.elements.namedItem(cat+'_'+opt).value.trim();
    if(raw!=='')result.mediciones[cat][opt]=Number(raw);
   }
  }
  return result;
 }
 function close(){
  if(!editor)return;
  if(active&&JSON.stringify(input(editor.querySelector('form')))!==startValue&&
   !confirm('¿Descartar los cambios del borrador no guardado?'))return;
  editor.remove();editor=null;active=null;
 }
 async function open(ref,button,label){
  if(editor||!refValid(ref))return;
  active=ref;
  const draft=drafts.get(key(ref));
  editor=el('section');
  editor.style.cssText='position:fixed;inset:0;overflow:auto;z-index:100100;background:#f0f4f8;color:#17324e;padding:18px 14px 45px';
  editor.setAttribute('role','dialog');editor.setAttribute('aria-label','Borrador local de cantidades');
  const frame=el('div');frame.style.cssText='max-width:650px;margin:auto';
  const title=el('h2','Borrador local · '+(ref.tipo==='tunel'?'Túnel':'Carga')+' · '+ref.partida);
  title.style.cssText='font-size:20px;color:#1558a0';
  const hint=el('p','No se enviará al servidor. Solo disponible en este dispositivo.');
  const form=el('form');form.noValidate=true;
  const total=el('label','Bandejas inspeccionadas *');
  total.style.cssText='display:block;font-weight:700;margin:15px 0';
  const totalInput=el('input');totalInput.type='number';totalInput.name='total';
  totalInput.min='1';totalInput.max='10000000';totalInput.step='1';totalInput.inputMode='numeric';
  totalInput.value=draft?.bandejasInspeccionadas||'';
  totalInput.style.cssText='display:block;width:100%;padding:10px;border:1px solid #aac1d7;border-radius:8px';
  total.append(totalInput);form.append(total);
  for(const [cat,name,opts] of CATS){
   const field=el('fieldset'),legend=el('legend',name);
   field.style.cssText='border:1px solid #cad9e7;border-radius:8px;padding:10px;margin:10px 0;background:white';
   legend.style.fontWeight='700';field.append(legend);
   const grid=el('div');grid.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:10px';
   for(const [opt,desc] of opts){
    const labelField=el('label',desc);labelField.style.cssText='font-size:13px;display:block';
    const n=el('input');n.type='number';n.step='1';n.min='1';n.max='10000000';n.inputMode='numeric';
    n.name=cat+'_'+opt;n.value=draft?.mediciones?.[cat]?.[opt]||'';
    n.style.cssText='display:block;width:100%;min-width:0;padding:10px;border:1px solid #aac1d7;border-radius:6px;margin-top:4px';
    labelField.append(n);grid.append(labelField);
   }field.append(grid);form.append(field);
  }
  // Como en QC online, Enter avanza por cantidades; nunca confirma por accidente.
  form.addEventListener('keydown',event=>{
   if(event.key!=='Enter'||event.target?.tagName!=='INPUT'||event.target.type!=='number')return;
   event.preventDefault();
   const inputs=Array.from(form.querySelectorAll('input[type="number"]:not(:disabled)'));
   const next=inputs[inputs.indexOf(event.target)+1];
   if(next)next.focus();else event.target.blur();
  });
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
    const data=validate(input(form));
    const isNew=!drafts.has(key(ref));
    if(isNew&&drafts.size>=LIMIT)throw Error('Hay demasiados borradores. Conéctate para revisarlos.');
    const stored={key:key(ref),owner,role,ref:{id:ref.id,tipo:ref.tipo,dia:ref.dia,partida:ref.partida},
      ...data,at:Date.now(),status:'PENDIENTE_LOCAL'};
    await operation('readwrite',s=>s.put(stored));
    drafts.set(key(ref),stored);
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
   x.status==='PENDIENTE_LOCAL'&&refValid(x.ref))
   .map(x=>[x.key,x]));
  return drafts.size;
 }
 // Primera fase de sincronización: comprobación REMOTA de SOLO LECTURA.
 // No hace POST de inspecciones y no borra ningún borrador local.
 async function checkServer(ref){
  if(!navigator.onLine)throw Error('Sin conexión. El borrador sigue guardado localmente.');
  if(!refValid(ref)||!drafts.has(key(ref)))throw Error('No hay un borrador autorizado para comprobar.');
  let auth,session;
  try{
   auth=JSON.parse(localStorage.getItem('lasala-firebase-auth-v1')||'null');
   session=JSON.parse(localStorage.getItem('lasala-sesion-v1')||'null');
  }catch(_){throw Error('No hay una sesión válida. Inicia sesión de nuevo.');}
  const sessionRole=localStorage.getItem('viguerapp-qc-offline-role-test-v1');
  if(!auth?.refreshToken||auth.user!==owner||session?.user!==owner||sessionRole!==role)
   throw Error('La sesión ha cambiado. Conéctate y vuelve a iniciar sesión.');
  let token;
  try{
   const refresh=await fetch('https://securetoken.googleapis.com/v1/token?key=AIzaSyDdDdMg6M1jVIssvGYKsdRA-mRug31Yt_g',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'refresh_token',refresh_token:auth.refreshToken}).toString(),
    cache:'no-store'
   });
   if(!refresh.ok)throw Error('LOGIN_REQUIRED');
   const data=await refresh.json();
   if(!data.id_token||!data.refresh_token)throw Error('LOGIN_REQUIRED');
   token=data.id_token;
   // Mismo esquema de sesión utilizado por el frontend QC online.
   localStorage.setItem('lasala-firebase-auth-v1',
    JSON.stringify({user:owner,refreshToken:data.refresh_token}));
  }catch(_){throw Error('No se ha podido validar la sesión. El borrador sigue local.');}
  try{
   const q=new URLSearchParams({id:ref.id,tipo:ref.tipo,dia:String(ref.dia)});
   const response=await fetch('/api/admin-qc-mediciones?'+q.toString(),{
    method:'GET',headers:{Authorization:'Bearer '+token},cache:'no-store'
   });
   if(response.status===401||response.status===403)
    throw Error('Acceso rechazado. Comprueba el usuario y sus permisos.');
   if(response.status===409)throw Error('La inspección ha cambiado o ya no existe en origen.');
   if(!response.ok)throw Error('No se pudo consultar el servidor (HTTP '+response.status+').');
   const result=await response.json();
   if(result.ok!==true||result.sourcePartida!==ref.partida||
     !Object.prototype.hasOwnProperty.call(result,'record'))
    throw Error('La respuesta del servidor no coincide con la inspección.');
   if(result.record!==null){
    if(!Number.isInteger(result.record.version)||result.record.version<1)
     throw Error('La medición remota no tiene una versión válida.');
    return 'CONFLICT';
   }
   return 'EMPTY';
  }catch(e){
   if(e instanceof TypeError)throw Error('Sin conexión con el servidor. Se conserva el borrador.');
   throw e;
  }
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
    status.textContent=state==='EMPTY'?
     'No hay cantidades en servidor. El borrador sigue local; NO se ha enviado.':
     'La inspección YA tiene cantidades en servidor. Revisión necesaria: no sobrescribir. El borrador sigue local.';
   }catch(e){status.textContent=(e?.message||'Consulta fallida')+' No se ha enviado el borrador.';}
   finally{btn.disabled=false;}
  });
  const wrapper=el('div');wrapper.style.cssText='display:flex;flex-direction:column;align-items:flex-start;gap:4px';
  wrapper.dataset.qcCheck='1';wrapper.append(btn,status);
  return wrapper;
 }
 function decorate(item,ref){
  if(!refValid(ref))return;
  const saved=drafts.has(key(ref));
  const footer=el('div');footer.style.cssText='display:flex;flex-direction:column;align-items:flex-start;gap:5px;margin-top:8px';
  const label=el('span',saved?'Borrador guardado en dispositivo · pendiente de sincronizar':'');
  label.style.cssText='font-size:12px;font-weight:700;color:#8c5400';
  const button=el('button',saved?'Editar borrador':'Anotar cantidades');
  button.type='button';button.style.cssText='background:#1558a0;border:0;border-radius:7px;color:white;padding:8px 10px;font-weight:700';
  button.addEventListener('click',()=>{void open(ref,button,label)});
  footer.append(label,button);
  if(saved)footer.append(makeCheckButton(ref));
  item.append(footer);
 }
 window.QCOfflineDraftEditor=Object.freeze({init,decorate});
})();
