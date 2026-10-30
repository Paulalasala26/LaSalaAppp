// Editor QC de línea: cargar la mejora solo al solicitar Editar.
(function(root){
'use strict';
const names=['mostrarEditarControlCheck','mostrarEditarControlCargaCheck'];
const base=Object.create(null);
const proxies=Object.create(null);
for(const name of names)base[name]=root[name];
const src=new URL('./qc-editar-linea-v3.js?v=109',document.currentScript.src).href;
let listo=false;
let carga=null;
function asegurarEditor(){
  if(listo)return Promise.resolve();
  if(carga)return carga;
  carga=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=src;
    script.onload=()=>{
      if(names.some(name=>root[name]===proxies[name])){
        carga=null;
        script.remove();
        reject(new Error('El editor QC no instaló sus funciones.'));
        return;
      }
      listo=true;
      resolve();
    };
    script.onerror=()=>{
      carga=null;
      script.remove();
      reject(new Error('No se pudo cargar el editor QC.'));
    };
    document.head.appendChild(script);
  });
  return carga;
}
for(const name of names){
  proxies[name]=function(){
    const contexto=this;
    const args=arguments;
    if(listo)return root[name].apply(contexto,args);
    return asegurarEditor().then(()=>root[name].apply(contexto,args)).catch(error=>{
      console.warn('[La Sala] Se usará el editor QC integrado:',error);
      if(typeof base[name]==='function')return base[name].apply(contexto,args);
      if(typeof root.showToast==='function')root.showToast('No se pudo abrir la edición de esta línea.');
    });
  };
  root[name]=proxies[name];
}
})(window);
