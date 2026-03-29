/* MSY Portal — Service Worker (Web Push) */
/* eslint-disable no-restricted-globals */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }
  const title = payload.title || 'MSY Portal';
  const options = {
    body:  payload.body || '',
    icon:  payload.icon || '/favicon.ico',
    badge: payload.badge || '/favicon.ico',
    data:  { url: payload.url || '/dashboard.html' },
    tag:   payload.tag || 'msy-push',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : '/dashboard.html';
  const abs = new URL(raw, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === abs && 'focus' in client) return client.focus();
      }
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(abs);
    }),
  );
});
