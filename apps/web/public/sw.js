/**
 * Service worker.
 *
 * Hace una cosa y la hace bien: que la web abra sin conexión y que los recursos
 * estáticos no se vuelvan a descargar. Lo que **no** hace es cachear datos de la
 * competición, y esa es la decisión importante de este archivo.
 *
 * Una clasificación guardada es una clasificación que miente. Esta liga deriva
 * la tabla de los resultados y la recalcula entera; servir una copia de hace dos
 * horas mostraría posiciones que ya no son ciertas, sin avisar. Peor todavía con
 * un partido en directo: el marcador guardado sería el de antes.
 *
 * Así que:
 *
 *   Estáticos (CSS, JS, fuentes, imágenes)  →  caché primero
 *   Páginas (HTML)                          →  red primero, caché si no hay red
 *   `/api/`                                 →  nunca se toca
 *
 * Cuando se sirve una página desde la caché es porque no hay conexión, y eso el
 * navegador ya lo indica. Lo que no puede pasar es servirla teniendo red.
 */

const VERSION = 'liga-v1';
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;

/** Lo mínimo para que la aplicación abra sin conexión. */
const PRECACHE = ['/', '/offline', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      // `addAll` falla entero si un solo recurso falla; se piden uno a uno para
      // que un 404 en algo accesorio no deje la instalación a medias.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** ¿Es un recurso estático, de los que pueden servirse de caché sin pensar? */
function isStatic(url) {
  return (
    url.pathname.startsWith('/_astro/') ||
    url.pathname.startsWith('/assets/') ||
    /\.(css|js|woff2?|png|jpe?g|webp|svg|ico)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Solo este origen. Kick, YouTube y las fuentes se piden como siempre.
  if (url.origin !== self.location.origin) return;

  /*
    Datos de la competición: nunca. Que el navegador vaya a la red y falle si no
    hay, en vez de recibir una tabla de hace dos horas creyendo que es la de
    ahora.
  */
  if (url.pathname.startsWith('/api/')) return;

  if (isStatic(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached !== undefined) return cached;
          const offline = await caches.match('/offline');
          return (
            offline ??
            new Response('Sin conexión.', {
              status: 503,
              headers: { 'content-type': 'text/plain; charset=utf-8' },
            })
          );
        }),
    );
  }
});
