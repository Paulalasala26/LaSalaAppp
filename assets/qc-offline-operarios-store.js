'use strict';
// ViguerAPP TEST · Snapshot mínimo del frontend para consulta sin conexión.
// Solo lectura: jamás guarda checks, mediciones, clientes, fotos ni tokens.
(function(root){
  const DB='viguerapp-qc-operarios-test-v1',STORE='quincenas',TTL=24*60*60*1000,MAX=1500;
  const ID=/^[A-Za-z0-9_-]{1,180}$/,PART=/^[A-Za-z0-9._-]{1,100}$/;
  function allowed(role,tipo){
    return (role==='ADMIN'||role==='TECNICO'||(role==='CARGADOR'&&tipo==='carga'))
      && (tipo==='tunel'||tipo==='carga');
  }
  function ownerOK(v){return typeof v==='string'&&v.length>0&&v.length<=100}
  function norm(rec,tipo,q){
    if(!rec||typeof rec!=='object'||rec.tipo!==tipo||
      !ID.test(rec.id)||!PART.test(rec.partida)||
      !Number.isInteger(rec.dia)||Math.floor((rec.dia-15)/14)!==q)return null;
    const text=v=>v===null||v===undefined?'':String(v).slice(0,45);
    return {id:rec.id,tipo,dia:rec.dia,partida:rec.partida,
      bandejas:text(rec.numBandejas),
      inv:text(rec.invernadero||rec.invId),
      calle:Number.isSafeInteger(rec.calleDesde)?rec.calleDesde:null};
  }
  function dbOpen(){
    if(!root.indexedDB)return Promise.reject(Error('OFFLINE_NOT_SUPPORTED'));
    return new Promise((resolve,reject)=>{
      let r;
      try{r=root.indexedDB.open(DB,1)}catch(_){reject(Error('OFFLINE_NOT_SUPPORTED'));return}
      r.onupgradeneeded=()=>{
        if(!r.result.objectStoreNames.contains(STORE))
          r.result.createObjectStore(STORE,{keyPath:'key'});
      };
      r.onsuccess=()=>resolve(r.result);
      r.onerror=()=>reject(Error('OFFLINE_NOT_SUPPORTED'));
      r.onblocked=()=>reject(Error('OFFLINE_NOT_SUPPORTED'));
    });
  }
  async function transaction(mode,fn){
    const db=await dbOpen();
    return new Promise((resolve,reject)=>{
      let tx,out;
      try{tx=db.transaction(STORE,mode);
        const request=fn(tx.objectStore(STORE));
        if(request)request.onsuccess=()=>{out=request.result};
      }catch(_){db.close();reject(Error('OFFLINE_STORE_FAILED'));return}
      tx.oncomplete=()=>{db.close();resolve(out)};
      tx.onabort=()=>{db.close();reject(Error('OFFLINE_STORE_FAILED'))};
    });
  }
  async function save(owner,role,tipo,q,source){
    if(!ownerOK(owner)||!allowed(role,tipo)||!Number.isInteger(q)||q<0||q>300||
       !Array.isArray(source)||source.length>MAX)throw Error('INVALID_OFFLINE_SNAPSHOT');
    const records=source.map(x=>norm(x,tipo,q)).filter(Boolean);
    // Registrar lo realmente disponible. No inventar ni completar datos.
    await transaction('readwrite',s=>s.put({
      key:[owner,role,tipo,q].join('|'),owner,role,tipo,q,at:Date.now(),records
    }));
    return records.length;
  }
  async function list(owner,role){
    if(!ownerOK(owner)||!['ADMIN','TECNICO','CARGADOR'].includes(role))
      throw Error('LOGIN_REQUIRED');
    const all=await transaction('readonly',s=>s.getAll());
    const now=Date.now();
    return (Array.isArray(all)?all:[])
      .filter(x=>x&&x.owner===owner&&x.role===role&&allowed(role,x.tipo)&&
        Number.isFinite(x.at)&&x.at<=now+300000&&now-x.at<=TTL&&
        Array.isArray(x.records)&&x.records.length<=MAX)
      .map(x=>({tipo:x.tipo,q:x.q,at:x.at,
        records:x.records.filter(r=>norm(r,x.tipo,x.q))}))
      .sort((a,b)=>a.q-b.q||a.tipo.localeCompare(b.tipo));
  }
  root.QCOfflineOperarios=Object.freeze({save,list});
})(window);
