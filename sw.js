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
    icon: 'icon-192.png',
    badge: 'icon-192.png',
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
