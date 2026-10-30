// ViguerAPP / APP R v3 — carga diferida del complemento de tratamientos.
(function(){
'use strict';
const abrirOriginal=window.showFitoModule;
if(typeof abrirOriginal!=='function')return;
const urlModulo=new URL('./fito-series-v3.js?v=20261030-1',document.currentScript.src).href;
let estado='pendiente';
let carga=null;
window.showFitoModule=function(){
  const contexto=this;
  const argumentos=arguments;
  if(estado==='listo')return abrirOriginal.apply(contexto,argumentos);
  if(!carga){
    estado='cargando';
    carga=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=urlModulo;
      script.onload=()=>{
        if(typeof window.elegirModoSerieFitoV3!=='function'){
          estado='pendiente';
          carga=null;
          script.remove();
          reject(new Error('El complemento de tratamientos no se inicializó.'));
          return;
        }
        estado='listo';
        resolve();
      };
      script.onerror=()=>{
        estado='pendiente';
        carga=null;
        script.remove();
        reject(new Error('No se pudo descargar el complemento de tratamientos.'));
      };
      document.head.appendChild(script);
    });
  }
  return carga.then(()=>abrirOriginal.apply(contexto,argumentos)).catch(error=>{
    console.error('[La Sala] No se pudo abrir Plaguicidas:',error);
    if(typeof window.showToast==='function'){
      window.showToast('No se pudo cargar Plaguicidas. Comprueba la conexión y vuelve a intentarlo.');
    }
  });
};
})();
