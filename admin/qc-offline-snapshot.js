'use strict';
// Datos mínimos de registros QC previamente autorizados a ADMIN en TEST.
// Independiente de la cola histórica. Caduca en 24 horas. Sin datos de clientes.
(function(root){
  const DB='viguerapp-qc-offline-registros-test-v1',STORE='consultas';
  const MAX=5000,TTL=24*3600*1000;
  const RE_ID=/^[A-Za-z0-9_-]{1,180}$/;
  const RE_PARTIDA=/^[A-Za-z0-9._-]{1,100}$/;
  function validOwner(v){return typeof v==='string'&&v.length>0&&v.length<=100}
  function open(){
    if(!root.indexedDB)throw new Error('OFFLINE_STORAGE_UNAVAILABLE');
    return new Promise((resolve,reject)=>{
      const r=root.indexedDB.open(DB,1);
      r.onupgradeneeded=()=>{
        if(!r.result.objectStoreNames.contains(STORE))
          r.result.createObjectStore(STORE,{keyPath:'owner'});
      };
      r.onsuccess=()=>resolve(r.result);
      r.onerror=()=>reject(new Error('OFFLINE_STORAGE_UNAVAILABLE'));
      r.onblocked=()=>reject(new Error('OFFLINE_STORAGE_UNAVAILABLE'));
    });
  }
  async function op(mode,action){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,mode);
      let result;
      tx.oncomplete=()=>{db.close();resolve(result)};
      tx.onabort=()=>{db.close();reject(new Error('OFFLINE_STORAGE_FAILED'))};
      const req=action(tx.objectStore(STORE));
      if(req)req.onsuccess=()=>{result=req.result};
    });
  }
  function concise(r){
    if(!r||!RE_ID.test(r.id)||!['carga','tunel'].includes(r.tipo)||
       !Number.isInteger(r.dia)||r.dia<15||r.dia>4000||
       !RE_PARTIDA.test(r.partida))return null;
    const qty=r.numBandejas;
    return {
      id:r.id,tipo:r.tipo,dia:r.dia,partida:r.partida,
      numBandejas:(typeof qty==='number'||typeof qty==='string')?
        String(qty).slice(0,30):'',
      invernadero:typeof (r.invernadero||r.invId)==='string'?
        String(r.invernadero||r.invId).slice(0,50):'',
      calleDesde:Number.isSafeInteger(r.calleDesde)?r.calleDesde:null
    };
  }
  async function save(owner,records){
    if(!validOwner(owner)||!Array.isArray(records)||records.length>MAX)
      throw new Error('OFFLINE_SNAPSHOT_INVALID');
    const items=records.map(concise);
    // No almacenar parcialidades: si algo falla, mantener último snapshot.
    if(items.some(x=>!x))throw new Error('OFFLINE_SNAPSHOT_INVALID');
    const data={owner,at:Date.now(),records:items};
    await op('readwrite',s=>s.put(data));
    return items.length;
  }
  async function load(owner){
    if(!validOwner(owner))throw new Error('LOGIN_REQUIRED');
    const snapshot=await op('readonly',s=>s.get(owner));
    if(!snapshot)return {estado:'SIN_CONSULTA',records:[]};
    if(!Number.isFinite(snapshot.at)||snapshot.at>Date.now()+300000||
       Date.now()-snapshot.at>TTL)return {estado:'CADUCADA',records:[]};
    if(!Array.isArray(snapshot.records)||snapshot.records.length>MAX||
       snapshot.records.some(r=>!concise(r)))
      throw new Error('OFFLINE_SNAPSHOT_INVALID');
    return {estado:'LISTA',records:snapshot.records,at:snapshot.at};
  }
  root.QCOfflineSnapshot=Object.freeze({save,load});
})(window);
