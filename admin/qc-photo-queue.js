'use strict';
// Cola persistente de fotografías QC en Backoffice TEST, aislada de la cola
// offline histórica de ViguerAPP y de las fotografías almacenadas en Firebase.
// No borra automáticamente las fotos pendientes ni las mezcla entre cuentas.
(function(root){
  const NAME='viguerapp-qc-fotos-pendientes-test-v1';
  const STORE='fotos';
  const LIMIT=30;
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const REF=/^[A-Za-z0-9_-]{1,180}$/;
  function validOwner(owner){
    return typeof owner==='string'&&owner.length>0&&owner.length<=100;
  }
  function validPhoto(item){
    return item&&typeof item==='object'&&validOwner(item.owner)&&
      UUID.test(item.photoId)&&REF.test(item.id)&&
      ['tunel','carga'].includes(item.tipo)&&
      Number.isInteger(item.dia)&&item.dia>=15&&item.dia<=4000&&
      typeof item.partida==='string'&&item.partida.length<=100&&
      typeof item.capturedAt==='string'&&Number.isFinite(Date.parse(item.capturedAt))&&
      typeof item.imageData==='string'&&
      /^data:image\/(?:jpeg|png|webp|heic|heif);base64,/.test(item.imageData)&&
      item.imageData.length>=200&&item.imageData.length<=3700000;
  }
  function open(){
    if(!root.indexedDB)return Promise.reject(new Error('OFFLINE_STORAGE_UNAVAILABLE'));
    return new Promise((resolve,reject)=>{
      let settled=false;
      const fail=()=>{if(!settled){settled=true;reject(new Error('OFFLINE_STORAGE_UNAVAILABLE'));}};
      let request;
      try{request=root.indexedDB.open(NAME,1);}
      catch(_){fail();return;}
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains(STORE))
          db.createObjectStore(STORE,{keyPath:'photoId'});
      };
      request.onsuccess=()=>{
        if(settled){request.result.close();return;}
        settled=true;resolve(request.result);
      };
      request.onerror=fail;
      request.onblocked=fail;
    });
  }
  async function transact(mode,action){
    const db=await open();
    return new Promise((resolve,reject)=>{
      let tx;
      try{tx=db.transaction(STORE,mode);}
      catch(_){db.close();reject(new Error('OFFLINE_STORAGE_UNAVAILABLE'));return;}
      let output;
      tx.oncomplete=()=>{db.close();resolve(output);};
      tx.onabort=()=>{db.close();reject(new Error('OFFLINE_STORAGE_FAILED'));};
      tx.onerror=()=>{}; // el error provoca abort; no eliminar ninguna foto.
      try{
        const request=action(tx.objectStore(STORE));
        if(request)request.onsuccess=()=>{output=request.result;};
      }catch(_){
        try{tx.abort();}catch(e){}
      }
    });
  }
  async function list(owner){
    if(!validOwner(owner))throw new Error('INVALID_QUEUE_OWNER');
    const rows=await transact('readonly',store=>store.getAll());
    if(!Array.isArray(rows))throw new Error('OFFLINE_STORAGE_FAILED');
    const own=rows.filter(item=>item?.owner===owner);
    if(own.some(item=>!validPhoto(item)))throw new Error('OFFLINE_QUEUE_CORRUPT');
    return own.sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt)||
      a.photoId.localeCompare(b.photoId));
  }
  async function add(item){
    if(!validPhoto(item))throw new Error('INVALID_OFFLINE_PHOTO');
    if((await list(item.owner)).length>=LIMIT)throw new Error('OFFLINE_QUEUE_FULL');
    // add nunca sustituye una fotografía pendiente del mismo UUID.
    await transact('readwrite',store=>store.add(item));
    return item.photoId;
  }
  async function removeConfirmed(owner,photoId){
    if(!validOwner(owner)||!UUID.test(photoId))
      throw new Error('INVALID_OFFLINE_REFERENCE');
    // Comprobar owner y borrar en la MISMA transacción.
    const db=await open();
    return new Promise((resolve,reject)=>{
      let tx,removed=false;
      try{tx=db.transaction(STORE,'readwrite');}
      catch(_){db.close();reject(new Error('OFFLINE_STORAGE_UNAVAILABLE'));return;}
      const store=tx.objectStore(STORE);
      const request=store.get(photoId);
      request.onsuccess=()=>{
        const existing=request.result;
        if(existing&&existing.owner===owner){
          store.delete(photoId);removed=true;
        }else if(existing){
          tx.abort();
        }
      };
      tx.oncomplete=()=>{db.close();resolve(removed);};
      tx.onabort=()=>{db.close();reject(new Error('OFFLINE_QUEUE_OWNER_MISMATCH'));};
      tx.onerror=()=>{};
    });
  }
  root.QCPhotoQueue=Object.freeze({list,add,removeConfirmed,limit:LIMIT});
})(window);
