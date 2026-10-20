'use strict';
// ViguerAPP TEST: fotos QC de operarios guardadas solo en este dispositivo.
// No llama a SharePoint, Firebase, ni a ninguna API; nunca sincroniza sola.
(function(){
 const DB='viguerapp-qc-operarios-photos-test-v1',STORE='photos';
 const LIMIT=30,MAX_BYTES=2450000,RE_ID=/^[A-Za-z0-9_-]{1,180}$/,RE_PART=/^[A-Za-z0-9._-]{1,100}$/;
 const TYPES=['image/jpeg','image/png','image/webp','image/heic','image/heif'];
 let owner='',role='',items=[];
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
  x.status==='PENDIENTE_LOCAL'&&x.blob instanceof Blob&&
  x.blob.size>100&&x.blob.size<=MAX_BYTES;
 function listFor(ref){
  return items.filter(x=>x.ref.id===ref.id&&x.ref.tipo===ref.tipo&&x.ref.dia===ref.dia&&
    x.ref.partida===ref.partida);
 }
 function summary(){
  const node=document.getElementById('photo-pending');
  if(!node)return;
  node.hidden=items.length===0;
  node.textContent=items.length+' foto(s) QC guardada(s) en este dispositivo, sin enviar.';
 }
 async function preview(photo){
  const r=await operation('readonly',s=>s.get(photo.photoId));
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
  function close(){URL.revokeObjectURL(url);layer.remove();}
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
 function decorate(parent,ref){
  if(!refValid(ref))return;
  const row=text('div');row.style.cssText='display:flex;align-items:center;flex-wrap:wrap;gap:7px;margin-top:7px';
  const button=text('button','Foto');
  button.type='button';
  button.style.cssText='padding:8px 10px;background:#e6effa;color:#1558a0;border:1px solid #a8c4e8;border-radius:7px;font-weight:700';
  const indicator=text('span');indicator.style.cssText='font-size:12px;font-weight:700;color:#8c5400';
  const view=text('button','Ver última');view.type='button';
  view.style.cssText='padding:6px 8px;color:#1558a0;background:white;border:1px solid #aac1d7;border-radius:7px;font-size:12px;font-weight:700';
  const picker=text('input');picker.type='file';picker.accept='image/*';
  picker.setAttribute('capture','environment');picker.hidden=true;
  function repaint(){
   const photos=listFor(ref);indicator.textContent=photos.length?photos.length+' pendiente(s) · local':'';
   view.hidden=!photos.length;
  }
  button.addEventListener('click',()=>{picker.value='';picker.click();});
  picker.addEventListener('change',async()=>{
   const file=picker.files?.[0];if(!file)return;
   if(!owner||!refValid(ref)){indicator.textContent='Sesión no válida.';return;}
   button.disabled=true;indicator.textContent='Guardando foto en dispositivo…';
   try{
    if(items.length>=LIMIT)throw Error('Límite de 30 fotografías pendientes en este usuario.');
    if(typeof crypto?.randomUUID!=='function')throw Error('El dispositivo no admite identificadores seguros.');
    const blob=await compressed(file);
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
  row.append(button,indicator,view,picker);parent.append(row);repaint();
 }
 window.QCOfflinePhotos=Object.freeze({init,decorate,count:()=>items.length});
})();
