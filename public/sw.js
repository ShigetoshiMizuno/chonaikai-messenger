// 町内会メッセンジャー Service Worker
// Push通知 + オフラインキャッシュ

const CACHE_NAME = 'chonaikai-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/icon-192.png',
  '/icon-512.png',
  '/badge-72.png',
  '/icon.svg',
  '/manifest.json',
];

// ---- Install: 静的アセットをプリキャッシュ ----
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ---- Activate: 古いキャッシュを削除 ----
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ---- Fetch: キャッシュ戦略 ----
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API リクエスト → Network First (オフライン時はキャッシュ)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // GET のみキャッシュ
          if (request.method === 'GET' && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 静的アセット → Cache First (なければネットワーク)
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // ナビゲーションリクエストはindex.htmlにフォールバック
        if (request.mode === 'navigate') {
          return caches.match('/index.html') || response;
        }
        // 成功レスポンスをキャッシュ
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => {
        // オフライン + キャッシュなし → ナビゲーションならindex.htmlを返す
        if (request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// ---- Push通知受信 ----
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || '町内会メッセンジャー', {
      body: data.body || '新しいお知らせがあります',
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      data: { url: '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url || '/'));
});
