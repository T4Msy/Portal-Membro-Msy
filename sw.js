/* MSY Portal — Service Worker v5
   Cache leve para midia/manifest | HTML/JS/CSS ficam com a rede
   Supabase/CDNs ficam network-only para proteger dados autenticados. */

const CACHE_VERSION  = 'msy-v56-opera-navigation-fix';
const ASSETS_CACHE   = `${CACHE_VERSION}-assets`;

/* Arquivos seguros para cache. Paginas, JS e CSS ficam fora do SW para evitar
   navegacao presa em cache antigo e ERR_FAILED ao trocar de aba. */
const PRECACHE_ASSETS = [
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable.png',
  '/icons/apple-touch-icon.png',
  '/manifest.json',
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
    caches.open(ASSETS_CACHE).then((cache) => precacheIndividually(cache, PRECACHE_ASSETS))
  );
});

/* ── Activate: limpar caches antigos ─────────────────────────── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('msy-') && k !== ASSETS_CACHE)
          .map((k) => caches.delete(k))
      )
    )
      .then(() => self.registration.navigationPreload?.enable?.())
      .then(() => self.clients.claim())
  );
});

/* ── Fetch: estratégia por tipo de recurso ─────────────────── */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  /* Navegacoes ficam totalmente fora do SW. Opera mobile rejeita reconstruir
     Requests de navegacao com init extra dentro de respondWith. */
  if (request.mode === 'navigate' || request.destination === 'document') return;

  /* Ignorar não-GET e requisições para serviços externos (rede pura) */
  if (request.method !== 'GET') return;
  if (NETWORK_ONLY.some((h) => url.hostname.includes(h))) return;
  if (url.protocol === 'chrome-extension:') return;

  /* HTML, JS e CSS devem ir direto para a rede/HTTP cache.
     Isso impede Service Worker antigo de quebrar troca de paginas. */
  if (isNetworkCriticalAsset(url.pathname, request)) {
    return;
  }

  /* Midia/manifest seguros para cache-first */
  if (isCacheableStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, ASSETS_CACHE, true));
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
function isNetworkCriticalAsset(pathname, request) {
  return request.headers.get('Accept')?.includes('text/html')
    || /\.(html?|css|js|mjs)$/i.test(pathname);
}

function isCacheableStaticAsset(pathname) {
  return /\.(svg|png|jpg|jpeg|webp|ico|woff2?|ttf|eot|json)$/i.test(pathname);
}

async function precacheIndividually(cache, urls) {
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const response = await fetch(url, { cache: 'reload' });
      if (!response.ok) throw new Error(`${url} -> ${response.status}`);
      await cache.put(url, response);
    })
  );
  const failed = results.filter((result) => result.status === 'rejected');
  if (failed.length) {
    console.warn(`[MSY SW] Precache parcial: ${failed.length} arquivo(s) falharam.`, failed);
  }
}

async function cacheFirst(request, cacheName, refreshInBackground = false) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) {
    if (refreshInBackground) {
      fetchFresh(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
      }).catch((err) => {
        console.warn('[MSY SW] Falha ao atualizar asset em background:', err);
      });
    }
    return cached;
  }
  try {
    const response = await fetchFresh(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    console.warn('[MSY SW] Asset indisponivel offline:', err);
    return new Response('Offline', { status: 503 });
  }
}

function fetchFresh(request) {
  return fetch(request.url, {
    cache: 'reload',
    credentials: request.credentials,
    redirect: 'follow',
  });
}
