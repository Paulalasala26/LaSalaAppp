'use strict';
// Captura QC estrictamente local, cargada por el service worker específico de
// Backoffice TEST. No autentica usuarios online ni consulta/edita Control.
(function(){
  const STORE='lasala-firebase-auth-v1';
  const byId=id=>document.getElementById(id);
  const node=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);return n};
  const snapshot=window.QCOfflineSnapshot,queue=window.QCPhotoQueue;
  let visible=[],selected=null,owner=null,capturing=false;
  function status(message,error){
    const s=byId('qc-offline-state');
    s.textContent=message;s.className='status'+(error?' warn':'');
  }
  function savedOwner(){
    let auth;
    try{auth=JSON.parse(localStorage.getItem(STORE)||'null')}catch(_){}
    if(typeof auth?.user!=='string'||!auth.user.trim()||!auth.refreshToken)
      throw new Error('LOGIN_REQUIRED');
    return auth.user;
  }
  async function pendingCount(){
    const pending=await queue.list(owner);
    byId('qc-offline-pending').textContent='Fotografías pendientes en este dispositivo: '+pending.length;
  }
  async function encodePhoto(file){
    if(!file||!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type))
      throw new Error('PHOTO_FORMAT');
    if(typeof createImageBitmap==='function'){
      let bitmap=null;
      try{
        bitmap=await createImageBitmap(file,{resizeWidth:1280,resizeQuality:'medium'});
        const scale=Math.min(1,1280/Math.max(bitmap.width,bitmap.height));
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(bitmap.width*scale));
        canvas.height=Math.max(1,Math.round(bitmap.height*scale));
        canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
        const str=canvas.toDataURL('image/jpeg',0.75);
        canvas.width=0;canvas.height=0;
        if(str.length>200&&str.length<=3500000)return str;
        throw new Error('PHOTO_SIZE');
      }catch(e){
        if(e.message==='PHOTO_SIZE')throw e;
      }finally{if(bitmap)bitmap.close()}
    }
    if(file.size>2450000)throw new Error('PHOTO_SIZE');
    const result=await new Promise((ok,bad)=>{
      const reader=new FileReader();
      reader.onload=()=>ok(reader.result);
      reader.onerror=()=>bad(new Error('PHOTO_READ'));
      reader.readAsDataURL(file);
    });
    if(typeof result!=='string'||result.length>3500000)
      throw new Error('PHOTO_SIZE');
    return result;
  }
  function render(){
    const term=byId('qc-offline-search').value.trim().toUpperCase();
    const subset=visible.filter(r=>!term||r.partida.toUpperCase().includes(term));
    const list=byId('qc-offline-items');
    list.replaceChildren();
    for(const rec of subset.slice(0,40)){
      const row=node('div');row.className='item';
      const left=node('div'),name=node('strong',rec.partida);
      const detail=node('span',(rec.tipo==='carga'?'Carga':'Túnel')+
        ' · '+(rec.numBandejas||'—')+' bandejas'+
        (rec.invernadero?' · INV '+rec.invernadero:'')+
        (rec.calleDesde!=null?' · Calle '+rec.calleDesde:'')+
        ' · ID '+rec.id);
      left.append(name,detail);
      const camera=node('button','📷 Foto');
      camera.type='button';
      camera.disabled=capturing;
      camera.addEventListener('click',()=>{
        if(capturing)return;
        selected=rec;
        const input=byId('qc-offline-image');
        input.value='';input.click();
      });
      row.append(left,camera);list.append(row);
    }
    byId('qc-offline-count').textContent=
      'Controles: '+subset.length+(subset.length>40?' · mostrando los primeros 40':'');
  }
  async function captured(){
    const input=byId('qc-offline-image'),rec=selected,file=input.files?.[0];
    selected=null;
    if(!rec||!file||capturing)return;
    capturing=true;render();
    try{
      if(savedOwner()!==owner)throw new Error('LOGIN_REQUIRED');
      if(navigator.storage?.persist){try{await navigator.storage.persist()}catch(_){}}
      const imageData=await encodePhoto(file);
      const photoId=crypto.randomUUID();
      await queue.add({
        owner,id:rec.id,tipo:rec.tipo,dia:rec.dia,partida:rec.partida,
        photoId,capturedAt:new Date().toISOString(),imageData
      });
      await pendingCount();
      status('Fotografía guardada en este dispositivo. Se enviará a SharePoint cuando vuelvas a abrir QC con conexión.');
    }catch(e){
      const reason={
        OFFLINE_QUEUE_FULL:'Cola llena: conecta Internet y envía las pendientes.',
        OFFLINE_STORAGE_FAILED:'No se ha podido guardar localmente.',
        OFFLINE_STORAGE_UNAVAILABLE:'El almacenamiento local no está disponible.',
        LOGIN_REQUIRED:'Ha cambiado la cuenta. Fotografía no guardada.',
        PHOTO_SIZE:'Imagen demasiado grande.'
      };
      status(reason[e.message]||'No se ha podido guardar la fotografía. No se ha enviado.',true);
    }finally{
      input.value='';capturing=false;render();
    }
  }
  async function boot(){
    byId('qc-offline-image').addEventListener('change',captured);
    byId('qc-offline-search').addEventListener('input',render);
    if(!queue||!snapshot){
      status('La captura offline no está instalada completamente. Conéctate y vuelve a abrir QC.',true);
      return;
    }
    try{
      owner=savedOwner();
      await pendingCount();
      const data=await snapshot.load(owner);
      if(data.estado!=='LISTA'){
        status(data.estado==='CADUCADA'?
          'La consulta local ha caducado (24 h). Conéctate y consulta QC antes de hacer nuevas fotos.':
          'No hay una consulta QC preparada. Conéctate y consulta los controles una vez.',true);
        return;
      }
      visible=data.records;
      byId('qc-offline-capture').hidden=false;
      status('Consulta QC disponible sin conexión · '+visible.length+
        ' controles · solo captura de fotografías. Datos consultados anteriormente.');
      render();
    }catch(e){
      status(e.message==='LOGIN_REQUIRED'?
        'No hay sesión identificada. Conéctate e inicia sesión como ADMIN.':
        'No se han podido leer los datos locales. Conéctate y abre QC.',true);
    }
  }
  boot();
})();
