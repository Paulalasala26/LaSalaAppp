'use strict';
// Exclusivo de /admin/ de ViguerAPP TEST. Sin cambios en sw.js (push).
// Solo sirve una pantalla genérica de captura QC cuando control.html no carga.
// No cachea API, datos de Control, respuestas Firebase, fotos ni credenciales.
const CACHE='viguerapp-qc-offline-shell-test-v1';
const PREFIX='viguerapp-qc-offline-shell-test-';
const PATH=new URL('./',self.location.href).pathname;
const SHELL=['qc-sin-conexion.html','qc-sin-conexion.js',
  'qc-offline-snapshot.js','qc-photo-queue.js'].map(x=>PATH+x);
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await cache.addAll(SHELL);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(url.origin!==self.location.origin||request.method!=='GET')return;
  if(request.mode==='navigate'&&url.pathname===PATH+'control.html'){
    event.respondWith((async()=>{
      try{return await fetch(request)}
      catch(_){
        const fallback=await caches.match(PATH+'qc-sin-conexion.html');
        return fallback||Response.error();
      }
    })());
    return;
  }
  if(SHELL.includes(url.pathname)){
    event.respondWith((async()=>{
      try{
        const fresh=await fetch(request);
        if(fresh.ok){
          const cache=await caches.open(CACHE);
          await cache.put(url.pathname,fresh.clone());
        }
        return fresh;
      }catch(_){
        return await caches.match(url.pathname)||Response.error();
      }
    })());
  }
});
