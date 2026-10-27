'use strict';
// ViguerAPP TEST: fotos QC de operarios guardadas solo en este dispositivo.
// Captura local sin red; envío a SharePoint TEST únicamente manual, confirmado y verificado.
(function(){
 const DB='viguerapp-qc-operarios-photos-test-v1',STORE='photos';
 const LIMIT=30,MAX_BYTES=2450000,RE_ID=/^[A-Za-z0-9_-]{1,180}$/,RE_PART=/^[A-Za-z0-9._-]{1,100}$/;
 const TYPES=['image/jpeg','image/png','image/webp','image/heic','image/heif'];
 let owner='',role='',items=[],sending=false,previewClose=null;
 function requireSession(){
  if(window.QCPhotoMainSession){
   const current=window.QCPhotoMainSession();
   if(!current||current.user!==owner||current.role!==role)
    throw Error('La sesión ha cambiado. Fotografía conservada en este dispositivo.');
  }
  if(window.QCOfflineSessionGuard&&!window.QCOfflineSessionGuard.active())
   throw Error('La sesión ha cambiado. Foto conservada; vuelve a iniciar sesión.');
 }
 const text=(tag,v)=>{const e=document.createElement(tag);if(v!==undefined)e.textContent=String(v);return e;};
 function refValid(r){
  return r&&RE_ID.test(r.id)&&RE_PART.test(r.partida)&&
   (r.tipo==='tunel'||r.tipo==='carga')&&Number.isInteger(r.dia)&&r.dia>=15&&r.dia<=4000&&
   (role==='ADMIN'||role==='TECNICO'||role==='CARGADOR'&&r.tipo==='carga');
 }
 function db(){
  if(!window.indexedDB)return Promise.reject(Error('Almacenamiento sin conexión no disponible.'));
  return new Promise((resolve,reject)=>{
   const r=window.indexedDB.open(DB,1);
   r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))
    r.result.createObjectStore(STORE,{keyPath:'photoId'});};
   r.onsuccess=()=>resolve(r.result);
   r.onerror=()=>reject(Error('No se pueden abrir las fotografías guardadas.'));
   r.onblocked=()=>reject(Error('Cierra otras pestañas de ViguerAPP e inténtalo de nuevo.'));
  });
 }
 async function operation(mode,act){
  const connection=await db();
  return new Promise((resolve,reject)=>{
   let tx,output;
   try{
    tx=connection.transaction(STORE,mode);
    const request=act(tx.objectStore(STORE));
    if(request)request.onsuccess=()=>{output=request.result;};
   }catch(e){connection.close();reject(e);return;}
   tx.oncomplete=()=>{connection.close();resolve(output);};
   tx.onabort=()=>{connection.close();reject(Error('No se ha guardado la fotografía.'));};
  });
 }
 const owned=x=>x&&x.owner===owner&&x.role===role&&refValid(x.ref)&&
  typeof x.photoId==='string'&&typeof x.capturedAt==='string'&&
  (x.status==='PENDIENTE_LOCAL'||x.status==='ENVIO_INCIERTO')&&x.blob instanceof Blob&&
  x.blob.size>100&&x.blob.size<=MAX_BYTES;
 function listFor(ref){
  return items.filter(x=>x.ref.id===ref.id&&x.ref.tipo===ref.tipo&&x.ref.dia===ref.dia&&
    x.ref.partida===ref.partida);
 }
 function summary(){
  const node=document.getElementById('photo-pending');
  if(!node)return;
  node.hidden=items.length===0;
  const revisar=items.filter(x=>x.status==='ENVIO_INCIERTO').length;
  node.textContent=items.length+' foto(s) QC pendientes en este dispositivo.'+
   (revisar?' '+revisar+' envío(s) por revisar.':'');
 }
 function lock(){
  if(previewClose){const close=previewClose;previewClose=null;close();}
 }
 async function preview(photo){
  requireSession();
  const r=await operation('readonly',s=>s.get(photo.photoId));
  requireSession();
  if(!owned(r))throw Error('No se ha podido recuperar esta fotografía.');
  const layer=text('section');
  layer.style.cssText='position:fixed;inset:0;z-index:100120;background:#122337f2;padding:15px;display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center';
  const img=text('img');img.alt='Fotografía QC local de la partida '+r.ref.partida;
  img.style.cssText='max-width:100%;max-height:75vh;object-fit:contain;border-radius:8px';
  const url=URL.createObjectURL(r.blob);img.src=url;
  const info=text('div',r.ref.partida+' · '+new Date(r.capturedAt).toLocaleString('es-ES'));
  info.style.cssText='color:white;text-align:center';
  const back=text('button','Cerrar');back.type='button';
  back.style.cssText='padding:12px 24px;background:#fff;color:#1558a0;border:0;border-radius:8px;font-weight:700';
  function close(){previewClose=null;URL.revokeObjectURL(url);layer.remove();}
  lock(); // Cerrar vistas anteriores sin dejar enlaces Blob abiertos.
  previewClose=close;
  back.addEventListener('click',close);
  layer.append(img,info,back);document.body.append(layer);
 }
 async function compressed(file){
  const typ=String(file.type||'').toLowerCase();
  if(!TYPES.includes(typ))throw Error('Utiliza una fotografía JPG, PNG, WEBP o HEIC.');
  if(file.size<=MAX_BYTES)return file;
  // Fotos de cámara grandes: reducirlas localmente sin enviarlas a la nube.
  let bitmap,url,img;
  try{
   if(typeof createImageBitmap==='function'){
    bitmap=await createImageBitmap(file);
   }else{
    url=URL.createObjectURL(file);img=new Image();
    await new Promise((resolve,reject)=>{
     img.onload=resolve;img.onerror=()=>reject(Error('No se puede reducir esta fotografía.'));
     img.src=url;
    });
   }
   const width=bitmap?bitmap.width:img.naturalWidth;
   const height=bitmap?bitmap.height:img.naturalHeight;
   if(!width||!height)throw Error('La imagen no tiene dimensiones válidas.');
   for(const side of [1600,1280,960,720]){
    const scale=Math.min(1,side/Math.max(width,height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    const ctx=canvas.getContext('2d');
    if(!ctx)throw Error('No se puede procesar esta fotografía.');
    ctx.drawImage(bitmap||img,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.78));
    canvas.width=0;canvas.height=0;
    if(blob&&blob.size>100&&blob.size<=MAX_BYTES)return blob;
   }
   throw Error('Fotografía demasiado grande. Utiliza una imagen de menor resolución.');
  }catch(e){throw Error(e?.message||'No se ha podido comprimir la fotografía.');}
  finally{if(bitmap&&typeof bitmap.close==='function')bitmap.close();if(url)URL.revokeObjectURL(url);}
 }
 // Usar el mismo contexto de sesión que los borradores offline QC.
 // Renovación del JWT solo con conexión y a petición del operario.
 async function userToken(){
  if(!navigator.onLine)throw Error('Sin conexión. La fotografía permanece local.');
  let auth,session;
  try{
   auth=JSON.parse(localStorage.getItem('lasala-firebase-auth-v1')||'null');
   session=JSON.parse(localStorage.getItem('lasala-sesion-v1')||'null');
  }catch(_){throw Error('No se ha podido leer la sesión. La fotografía sigue local.');}
  if(!auth?.refreshToken||auth.user!==owner||session?.user!==owner||
     (window.QCPhotoMainSession?window.QCPhotoMainSession()?.role!==role:
       localStorage.getItem('viguerapp-qc-offline-role-test-v1')!==role))
   throw Error('La sesión ha cambiado. Abre ViguerAPP con el usuario original.');
  let reply,data;
  try{
   reply=await fetch('https://securetoken.googleapis.com/v1/token?key=AIzaSyDdDdMg6M1jVIssvGYKsdRA-mRug31Yt_g',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'refresh_token',refresh_token:auth.refreshToken}).toString(),
    cache:'no-store',signal:AbortSignal.timeout(12000)
   });
   if(!reply.ok)throw Error('LOGIN_REQUIRED');
   data=await reply.json();
   if(!data.id_token||!data.refresh_token)throw Error('LOGIN_REQUIRED');
  }catch(_){throw Error('No se ha podido validar la sesión. La foto sigue local.');}
  if(auth.user!==owner||(window.QCPhotoMainSession?window.QCPhotoMainSession()?.role!==role:
     localStorage.getItem('viguerapp-qc-offline-role-test-v1')!==role))
   throw Error('El usuario ha cambiado durante la comprobación.');
  localStorage.setItem('lasala-firebase-auth-v1',
   JSON.stringify({user:owner,refreshToken:data.refresh_token}));
  return data.id_token;
 }
 async function checksum(blob){
  if(!crypto?.subtle?.digest)throw Error('El navegador no admite la verificación segura de fotografías.');
  const bytes=await blob.arrayBuffer();
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
 }
 async function asDataUrl(blob){
  return new Promise((resolve,reject)=>{
   const reader=new FileReader();
   reader.onload=()=>typeof reader.result==='string'?resolve(reader.result):
    reject(Error('No se pudo leer la fotografía.'));
   reader.onerror=()=>reject(Error('No se pudo leer la fotografía.'));
   reader.readAsDataURL(blob);
  });
 }
 // Firebase TEST es la fuente del estado definitivo; GET remoto por UUID.
 async function remoteState(photo,token,digest){
  const query=new URLSearchParams({action:'photo-status',
   id:photo.ref.id,tipo:photo.ref.tipo,dia:String(photo.ref.dia),photoId:photo.photoId});
  let response,body;
  try{
   response=await fetch('/api/qc-fotos-sharepoint?'+query.toString(),{
    method:'GET',headers:{Authorization:'Bearer '+token},cache:'no-store',
    signal:AbortSignal.timeout(18000)
   });
   body=await response.json();
  }catch(_){throw Error('No se pudo comprobar la foto en servidor. Mantener local.');}
  if(!response.ok||body?.ok!==true)
   throw Error('Consulta SharePoint no confirmada (HTTP '+response.status+'). Mantener local.');
  if(!body.exists)return false;
  if(body.photoId!==photo.photoId||body.sha256!==digest||
     body.capturedAt!==new Date(photo.capturedAt).toISOString()||body.sharepointConfirmed!==true)
   throw Error('Conflicto de identidad/imagen. Mantener foto local y no reenviar.');
  return true;
 }
 // Borrar local solo si la misma fotografía, propietario y captura siguen presentes.
 async function removeAfterConfirmed(photo){
  const connection=await db();
  return new Promise((resolve,reject)=>{
   const tx=connection.transaction(STORE,'readwrite');
   const store=tx.objectStore(STORE),r=store.get(photo.photoId);
   let removed=false;
   r.onsuccess=()=>{
    const current=r.result;
    if(!owned(current)||current.capturedAt!==photo.capturedAt||
       current.ref.id!==photo.ref.id||current.ref.partida!==photo.ref.partida||
       current.blob.size!==photo.blob.size){
      tx.abort();return;
    }
    store.delete(photo.photoId);removed=true;
   };
   tx.oncomplete=()=>{connection.close();resolve(removed);};
   tx.onabort=()=>{connection.close();reject(Error('Foto remota confirmada, pero el borrador local cambió. Se conserva.'));};
  });
 }
 // Marcar antes del POST en IndexedDB. Si el navegador se cierra a
 // mitad de envío, la foto conserva su UUID y pasa a revisión; nunca
 // desaparece ni se confunde con una fotografía todavía no enviada.
 async function markAttempt(photo){
  const connection=await db();
  return new Promise((resolve,reject)=>{
   const tx=connection.transaction(STORE,'readwrite');
   const store=tx.objectStore(STORE);
   const r=store.get(photo.photoId);
   r.onsuccess=()=>{
    const current=r.result;
    if(!owned(current)||current.capturedAt!==photo.capturedAt||
       current.ref.id!==photo.ref.id||current.ref.partida!==photo.ref.partida||
       current.blob.size!==photo.blob.size){
      tx.abort();return;
    }
    if(current.status!=='ENVIO_INCIERTO')
     store.put({...current,status:'ENVIO_INCIERTO'});
   };
   tx.oncomplete=()=>{
    connection.close();
    items=items.map(x=>x.photoId===photo.photoId?
     {...x,status:'ENVIO_INCIERTO'}:x);
    summary();resolve();
   };
   tx.onabort=()=>{
    connection.close();
    reject(Error('No se pudo proteger el envío en el dispositivo. No se ha subido la foto.'));
   };
  });
 }
 async function sendOne(photo,token){
  requireSession();
  if(!navigator.onLine)throw Error('Sin conexión. Ninguna fotografía enviada.');
  const original=await operation('readonly',st=>st.get(photo.photoId));
  if(!owned(original)||original.capturedAt!==photo.capturedAt||
     original.ref.partida!==photo.ref.partida)throw Error('La foto local ha cambiado.');
  const digest=await checksum(original.blob);
  requireSession();
  if(!(await remoteState(original,token,digest))){
   requireSession();
   // Recuperar un intento anterior exige DOS decisiones: GET remoto por UUID
   // y autorización explícita para reutilizar exactamente la misma foto.
   // El servidor usa nombre inmutable UUID+hash y comprueba los bytes:
   // si SharePoint la tenía aunque faltase índice Firebase, la recupera.
   if(original.status==='ENVIO_INCIERTO'&&!confirm(
    'No hay confirmación de esta foto en el índice. Puede existir ya en SharePoint. '+
    '¿Reintentar la MISMA fotografía y el MISMO identificador? '+
    'El servidor comprobará el archivo existente para evitar duplicados.'))
    throw Error('Envío anterior aún sin confirmar. Foto local conservada, sin reenvío.');
   // Sólo un POST por intento y siempre tras un GET remoto.
   const imageData=await asDataUrl(original.blob);
   if(!navigator.onLine)throw Error('Sin conexión. Foto conservada.');
   await markAttempt(original); // Persistencia confirmada ANTES de cualquier POST.
   requireSession();
   let response,body={};
   try{
    response=await fetch('/api/qc-fotos-sharepoint',{
     method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
     body:JSON.stringify({id:original.ref.id,tipo:original.ref.tipo,dia:original.ref.dia,
      photoId:original.photoId,capturedAt:original.capturedAt,imageData}),
     cache:'no-store',signal:AbortSignal.timeout(45000)
    });
    body=await response.json();
   }catch(_){throw Error('Envío sin confirmar. NO reintentar sin comprobar servidor. Foto local conservada.');}
   if(!response.ok||body?.ok!==true){
    const reason=body?.error==='SHAREPOINT_UPLOAD_NOT_ENABLED'?'La subida de fotos a SharePoint está desactivada en TEST.':
      body?.error==='PHOTO_INDEX_CONFLICT'||body?.error==='PHOTO_ID_CONFLICT'?
      'Conflicto de fotografía en servidor.':'Subida no confirmada (HTTP '+response.status+
       (body?.error?' · '+body.error:'')+').';
    throw Error(reason+' Fotografía conservada localmente.');
   }
   if(body.photoId!==original.photoId||body.record?.sha256!==digest)
    throw Error('La respuesta del servidor no coincide. Foto local conservada.');
  }
  // Una segunda lectura remota verifica indexación en Firebase tras SharePoint.
  requireSession();
  if(!(await remoteState(original,token,digest)))
   throw Error('SharePoint todavía no está verificado. Foto local conservada.');
  requireSession();
  if(!(await removeAfterConfirmed(original)))
   throw Error('La confirmación remota existe, pero no se pudo retirar la foto local.');
  items=items.filter(x=>x.photoId!==original.photoId);
  summary();
 }
 async function syncFor(ref,button,status,repaint){
  if(sending||!refValid(ref))return;
  const chosen=listFor(ref).slice();
  if(!chosen.length)return;
  requireSession();
  if(!navigator.onLine){status.textContent='No hay Internet. Fotos conservadas localmente.';return;}
  const revisar=chosen.some(photo=>photo.status==='ENVIO_INCIERTO');
  if(!confirm(revisar?
   '¿Revisar '+chosen.length+' fotografía(s) de '+ref.partida+'? '+
   'Se comprobará primero SharePoint. Si un envío anterior sigue sin confirmar, '+
   'se pedirá permiso aparte antes de reintentarlo con el mismo identificador.':
   '¿Enviar '+chosen.length+' foto(s) de la partida '+ref.partida+
   ' a SharePoint? La subida será REAL en la biblioteca QC. No se enviarán automáticamente.'))return;
  sending=true;button.disabled=true;
  let done=0;
  try{
   const token=await userToken();
   requireSession();
   for(const photo of chosen){
    status.textContent='Verificando y enviando foto '+(done+1)+' de '+chosen.length+'…';
    await sendOne(photo,token);
    done++;repaint();
   }
   status.textContent='✓ '+done+' fotografía(s) verificada(s) en SharePoint. Copias pendientes retiradas.';
  }catch(e){
   status.textContent=(e?.message||'Error al sincronizar')+
    ' · '+done+' confirmada(s); las demás continúan en este dispositivo.';
  }finally{sending=false;button.disabled=false;repaint();}
 }
 async function init(user,userRole){
  if(typeof user!=='string'||!user||!['ADMIN','TECNICO','CARGADOR'].includes(userRole))
   throw Error('Sesión de fotos no autorizada.');
  owner=user;role=userRole;
  const all=await operation('readonly',s=>s.getAll());
  if(!Array.isArray(all))throw Error('No se pudieron leer las fotos locales.');
  const same=all.filter(x=>x?.owner===owner&&x?.role===role);
  if(same.some(x=>!owned(x)))throw Error('Hay fotos locales que no se pueden recuperar. No se ha eliminado nada.');
  items=same;
  summary();
  return items.length;
 }
 function decorate(parent,ref,allowCapture=true){
  if(!refValid(ref))return;
  const row=text('div');row.style.cssText='display:flex;align-items:center;flex-wrap:wrap;gap:7px;margin-top:7px';
  const button=text('button','Foto');
  button.type='button';
  button.style.cssText='padding:8px 10px;background:#e6effa;color:#1558a0;border:1px solid #a8c4e8;border-radius:7px;font-weight:700';
  const indicator=text('span');indicator.style.cssText='font-size:12px;font-weight:700;color:#8c5400';
  const view=text('button','Ver última');view.type='button';
  view.style.cssText='padding:6px 8px;color:#1558a0;background:white;border:1px solid #aac1d7;border-radius:7px;font-size:12px;font-weight:700';
  const sync=text('button','Enviar fotos');
  sync.type='button';
  sync.style.cssText='padding:8px 10px;background:#1558a0;color:white;border:0;border-radius:7px;font-weight:700';
  const syncStatus=text('span');
  syncStatus.setAttribute('role','status');syncStatus.style.cssText='font-size:12px;color:#33516b;width:100%';
  const picker=text('input');picker.type='file';picker.accept='image/*';
  picker.setAttribute('capture','environment');picker.hidden=true;
  function repaint(){
   const photos=listFor(ref);
   const revisar=photos.filter(photo=>photo.status==='ENVIO_INCIERTO').length;
   indicator.textContent=photos.length?photos.length+' pendiente(s) · local'+
    (revisar?' · '+revisar+' por revisar':''):'';
   view.hidden=!photos.length;
   sync.hidden=!photos.length;
   sync.textContent=(revisar?'Revisar ':'Enviar ')+photos.length+' foto(s)';
  }
  button.addEventListener('click',()=>{try{requireSession();picker.value='';picker.click();}catch(e){indicator.textContent=e.message;}});
  picker.addEventListener('change',async()=>{
   const file=picker.files?.[0];if(!file)return;
   if(!owner||!refValid(ref)){indicator.textContent='Sesión no válida.';return;}
   button.disabled=true;indicator.textContent='Guardando foto en dispositivo…';
   try{
    if(items.length>=LIMIT)throw Error('Límite de 30 fotografías pendientes en este usuario.');
    if(typeof crypto?.randomUUID!=='function')throw Error('El dispositivo no admite identificadores seguros.');
    const blob=await compressed(file);
    requireSession();
    const photo={
     photoId:crypto.randomUUID(),owner,role,
     ref:{id:ref.id,tipo:ref.tipo,dia:ref.dia,partida:ref.partida},
     blob,capturedAt:new Date().toISOString(),status:'PENDIENTE_LOCAL'
    };
    await operation('readwrite',s=>s.add(photo));
    items.push(photo);summary();repaint();
    const status=document.getElementById('status');
    if(status)status.textContent='Foto LOCAL guardada. No se ha enviado a SharePoint.';
   }catch(e){repaint();indicator.textContent=e?.message||'No se ha podido guardar.';}
   finally{button.disabled=false;}
  });
  view.addEventListener('click',async()=>{
   const photos=listFor(ref);if(!photos.length)return;
   try{await preview(photos[photos.length-1]);}
   catch(e){indicator.textContent=e.message||'No se puede abrir la foto.';}
  });
  sync.addEventListener('click',()=>{void syncFor(ref,sync,syncStatus,repaint);});
  if(allowCapture)row.append(button);
  row.append(indicator,view,sync,syncStatus);
  if(allowCapture)row.append(picker);
  parent.append(row);repaint();
 }
 // Recuperación: fotos guardadas deben ser visibles incluso después de
 // caducar el snapshot de partidas, sin obligar a recapturarlas.
 function renderSaved(parent){
  if(!parent||!items.length)return;
  parent.replaceChildren();
  const title=text('h2','Fotografías locales pendientes');
  title.style.cssText='font-size:17px;margin:12px 0;color:#17324e';
  parent.append(title);
  const refs=new Map();
  for(const photo of items){
   const key=JSON.stringify([photo.ref.id,photo.ref.tipo,photo.ref.dia,photo.ref.partida]);
   if(!refs.has(key))refs.set(key,photo.ref);
  }
  for(const ref of refs.values()){
   const card=text('div');card.className='item';
   const area=text('div');
   area.append(text('strong',ref.partida),text('span',ref.tipo==='tunel'?'QC Túnel':'QC Carga'));
   decorate(area,ref,false);
   card.append(area);parent.append(card);
  }
  parent.hidden=false;
 }

 // Galería QC online: reutiliza EXACTAMENTE el mismo IndexedDB, UUID y
 // protocolo de envío comprobado del capturador sin conexión.
 async function galleryCapture(ref,files){
  requireSession();
  if(!refValid(ref))throw Error('Inspección no autorizada.');
  let done=0;
  for(const file of Array.from(files||[])){
   if(items.length>=LIMIT)throw Error(done?
    'Guardadas '+done+' fotos. Límite de '+LIMIT+' pendientes por usuario en este dispositivo.':
    'Límite de '+LIMIT+' fotos pendientes por usuario en este dispositivo.');
   if(typeof crypto?.randomUUID!=='function')throw Error('El dispositivo no admite identificadores seguros.');
   const blob=await compressed(file);
   requireSession();
   const photo={photoId:crypto.randomUUID(),owner,role,
    ref:{id:ref.id,tipo:ref.tipo,dia:ref.dia,partida:ref.partida},
    blob,capturedAt:new Date().toISOString(),status:'PENDIENTE_LOCAL'};
   await operation('readwrite',st=>st.add(photo));
   items.push(photo);done++;
  }
  summary();
  return done;
 }
 async function galleryLocal(ref){
  requireSession();
  if(!refValid(ref))return [];
  return listFor(ref).map(x=>({id:x.photoId,blob:x.blob,
   status:x.status,fecha:x.capturedAt,pending:true}));
 }
 async function galleryDeleteLocal(ref,id){
  requireSession();
  if(!refValid(ref))throw Error('Registro no válido.');
  const found=listFor(ref).find(x=>x.photoId===id);
  if(!found)throw Error('Fotografía no encontrada.');
  if(found.status==='ENVIO_INCIERTO')
   throw Error('Envío por verificar. No se puede eliminar la copia de seguridad.');
  await operation('readwrite',st=>st.delete(found.photoId));
  items=items.filter(x=>x.photoId!==id);summary();
  return true;
 }
 async function galleryRemote(ref){
  requireSession();if(!refValid(ref)||!navigator.onLine)return [];
  const token=await userToken();
  const q=new URLSearchParams({action:'photo-list',id:ref.id,tipo:ref.tipo,dia:String(ref.dia)});
  const r=await fetch('/api/qc-fotos-sharepoint?'+q.toString(),{
   headers:{Authorization:'Bearer '+token},cache:'no-store'});
  if(!r.ok)throw Error('No se ha podido consultar la galería SharePoint.');
  const body=await r.json();
  if(!body.ok||!Array.isArray(body.photos))throw Error('Respuesta de galería incorrecta.');
  return body.photos;
 }
 async function galleryRemoteBlob(ref,id){
  requireSession();if(!refValid(ref))throw Error('Registro no válido.');
  const token=await userToken();
  const q=new URLSearchParams({action:'photo-image',id:ref.id,tipo:ref.tipo,dia:String(ref.dia),photoId:id});
  const r=await fetch('/api/qc-fotos-sharepoint?'+q.toString(),{
    headers:{Authorization:'Bearer '+token},cache:'no-store'});
  if(!r.ok)throw Error('No se ha podido recuperar la fotografía de SharePoint.');
  return r.blob();
 }
 async function gallerySend(ref){
  requireSession();if(!refValid(ref))throw Error('Registro no válido.');
  const status={textContent:''},button={disabled:false};
  await syncFor(ref,button,status,()=>{});
  return status.textContent;
 }
 async function galleryRemoveRemote(ref,id){
  requireSession();if(!refValid(ref))throw Error('Registro no válido.');
  const token=await userToken();
  const q=new URLSearchParams({action:'photo-hide',id:ref.id,tipo:ref.tipo,dia:String(ref.dia),photoId:id});
  const r=await fetch('/api/qc-fotos-sharepoint?'+q.toString(),{
    method:'DELETE',headers:{Authorization:'Bearer '+token},cache:'no-store'});
  if(!r.ok)throw Error('No se ha podido retirar la foto de la galería SharePoint.');
  return true;
 }

 window.QCOfflinePhotos=Object.freeze({init,decorate,renderSaved,lock,
  galleryCapture,galleryLocal,galleryDeleteLocal,galleryRemote,galleryRemoteBlob,
  gallerySend,galleryRemoveRemote,count:()=>items.length});
})();
