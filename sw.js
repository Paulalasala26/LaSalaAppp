// Service worker mínimo — solo existe para poder recibir notificaciones push
// reales (aparecen en la pantalla de bloqueo aunque la app no esté abierta),
// igual que hace cualquier red social. No cachea nada ni cambia cómo
// funciona la app: LaSala_App.html sigue siendo la única fuente de verdad.
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  const title = data.title || 'App La Sala';
  // Rutas relativas a la carpeta donde vive este sw.js (no absolutas desde la
  // raíz del dominio) — la app vive en un subdirectorio de GitHub Pages
  // (github.io/LaSalaAppp/), así que "/icon-192.png" apuntaba a la raíz del
  // dominio (404) en vez de a la propia carpeta de la app.
  const options = {
    body: data.body || '',
    icon: 'icon-192.png?v=ls-20261029',
    badge: 'icon-192.png?v=ls-20261029',
    tag: 'lasala-aviso'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('.');
    })
  );
});


// QC operarios TEST: copia estática para abrir SOLO la consulta de partidas
// previamente leídas. No almacenar API, Firebase, datos QC ni credenciales en CacheStorage.
// Se integra en el SW existente para NO interferir en las suscripciones PUSH.
const QC_SHELL_CACHE='viguerapp-qc-operarios-shell-test-v24';
const QC_SHELL_PREFIX='viguerapp-qc-operarios-shell-test-';
const QC_BASE=new URL('./',self.location.href).pathname;
const QC_FILES=['qc-offline.html','assets/qc-offline-operarios-store.js',
  'assets/qc-offline-operarios-drafts.js','assets/qc-offline-operarios-photos.js',
  'assets/qc-offline-operarios-screen.js',
  'assets/qc-sync-global.js','assets/qc-sync-global.css'].map(p=>QC_BASE+p);
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(QC_SHELL_CACHE).then(cache=>cache.addAll(QC_FILES)));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(
    keys.filter(k=>k.startsWith(QC_SHELL_PREFIX)&&k!==QC_SHELL_CACHE)
      .map(k=>caches.delete(k))
  )));
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  if(req.mode==='navigate'&&(url.pathname===QC_BASE||url.pathname===QC_BASE+'index.html')){
    event.respondWith((async()=>{
      try{return await fetch(req)}
      catch(_){return await caches.match(QC_FILES[0])||Response.error()}
    })());
    return;
  }
  if(QC_FILES.includes(url.pathname)){
    event.respondWith((async()=>{
      const cached=await caches.match(url.pathname);
      if(cached)return cached;
      try{return await fetch(req)}catch(_){return Response.error()}
    })());
  }
});
