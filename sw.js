/* MSY Portal — Service Worker v3
   Cache-first para assets estaticos | Network-first para paginas
   Supabase/CDNs ficam network-only para proteger dados autenticados. */

const CACHE_VERSION  = 'msy-v3';
const ASSETS_CACHE   = `${CACHE_VERSION}-assets`;
const PAGES_CACHE    = `${CACHE_VERSION}-pages`;

/* Assets que vão para cache no install */
const PRECACHE_ASSETS = [
  '/css/style.css',
  '/css/modules3.css',
  '/css/premium.css',
  '/js/config.js',
  '/js/core/theme.js',
  '/js/core/cache.js',
  '/js/core/realtime.js',
  '/js/core/confirm.js',
  '/js/core/a11y.js',
  '/js/app.js',
  '/js/badges_unificado.js',
  '/js/modules.js',
  '/js/modules2.js',
  '/js/modules3.js',
  '/js/push.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable.png',
  '/icons/apple-touch-icon.png',
  '/manifest.json',
  '/offline.html',
  '/dashboard.html',
  '/login.html',
];

/* Padrões que sempre vão para a rede (Supabase, CDN) */
const NETWORK_ONLY = [
  'supabase.co',
  'supabase.io',
  'fonts.googleapis.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'resend.com',
  'mercadopago.com',
];

/* ── Install: pre-cache assets ─────────────────────────────── */
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(ASSETS_CACHE).then((cache) =>
      cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[MSY SW] Precache parcial:', err);
      })
    )
  );
});

/* ── Activate: limpar caches antigos ─────────────────────────── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('msy-') && k !== ASSETS_CACHE && k !== PAGES_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch: estratégia por tipo de recurso ─────────────────── */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  /* Ignorar não-GET e requisições para serviços externos (rede pura) */
  if (request.method !== 'GET') return;
  if (NETWORK_ONLY.some((h) => url.hostname.includes(h))) return;
  if (url.protocol === 'chrome-extension:') return;

  /* Assets estáticos (CSS, JS, SVG, fonts, imagens) → cache-first */
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, ASSETS_CACHE, true));
    return;
  }

  /* Páginas HTML → network-first com fallback de cache */
  if (request.headers.get('Accept')?.includes('text/html') || url.pathname.endsWith('.html')) {
    event.respondWith(networkFirstWithCache(request, PAGES_CACHE));
    return;
  }
});

/* ── Push notification ─────────────────────────────────────── */
self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try { payload = event.data.json(); }
    catch { payload = { body: event.data.text() }; }
  }
  const title = payload.title || 'MSY Portal';
  const options = {
    body:    payload.body || '',
    icon:    payload.icon || '/icons/icon-192.png',
    badge:   '/icons/icon-192.png',
    data:    { url: payload.url || '/dashboard.html' },
    tag:     payload.tag || 'msy-push',
    vibrate: [100, 50, 100],
    actions: [{ action: 'open', title: 'Abrir Portal' }],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

/* ── Notification click ─────────────────────────────────────── */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = event.notification.data?.url || '/dashboard.html';
  const abs = new URL(raw, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if (c.url === abs && 'focus' in c) return c.focus();
      }
      for (const c of clients) {
        if (c.url.startsWith(self.location.origin) && 'focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(abs);
    })
  );
});

/* ── Helpers ─────────────────────────────────────────────────── */
function isStaticAsset(pathname) {
  return /\.(css|js|svg|png|jpg|jpeg|webp|ico|woff2?|ttf|eot)$/.test(pathname);
}

async function cacheFirst(request, cacheName, refreshInBackground = false) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    if (refreshInBackground) {
      fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
      }).catch((err) => {
        console.warn('[MSY SW] Falha ao atualizar asset em background:', err);
      });
    }
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    console.warn('[MSY SW] Asset indisponivel offline:', err);
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirstWithCache(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    console.warn('[MSY SW] Pagina indisponivel na rede:', err);
    const cached = await cache.match(request);
    if (cached) return cached;
    const fallback = await cache.match('/offline.html') || await cache.match('/dashboard.html');
    return fallback || new Response('<h1>Offline</h1><p>Conecte à internet para usar o MSY Portal.</p>', {
      headers: { 'Content-Type': 'text/html' },
      status: 503,
    });
  }
}
