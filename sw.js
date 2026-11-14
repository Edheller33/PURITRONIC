/* PURITRONIC - Service Worker (offline first, v8)
   Importante: este archivo SOLO guarda los archivos de la app (HTML, íconos) para que abra sin internet.
   Los datos del negocio (ventas, cortes, clientes) viven en localStorage e IndexedDB del navegador, no aquí. */
const CACHE = 'puritronic-v8';
const CORE = ['./', './index.html'];                       /* sin esto la app no abre offline */
const EXTRA = ['./manifest.webmanifest', './icon-192.png', './icon-512.png']; /* si falta alguno, NO se rompe la instalación */
const NAV_TIMEOUT = 4000;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(CORE.map(u => c.add(new Request(u, { cache: 'reload' }))));
    await Promise.allSettled(EXTRA.map(u => c.add(new Request(u, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const guardable = r => r && r.ok && r.type === 'basic';

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  /* Navegación: red primero (máx. 4 s para no colgar la caja con señal mala); si falla, la app guardada.
     Solo se guarda una respuesta buena: un 404/500 nunca reemplaza al index.html guardado. */
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), NAV_TIMEOUT);
        const r = await fetch(req, { signal: ctl.signal });
        clearTimeout(t);
        if (guardable(r)) {
          const copy = r.clone();
          e.waitUntil(caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {}));
          return r;
        }
        const hit = await caches.match('./index.html');
        return hit || r;
      } catch (_) {
        return (await caches.match('./index.html')) || (await caches.match('./')) ||
          new Response('Sin conexión y la app aún no se guardó. Ábrela una vez con internet.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  /* Resto: caché primero y se actualiza en segundo plano (solo respuestas buenas) */
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    const net = fetch(req).then(r => {
      if (guardable(r)) {
        const copy = r.clone();
        e.waitUntil(caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}));
      }
      return r;
    }).catch(() => null);
    if (hit) return hit;
    return (await net) || Response.error();
  })());
});
