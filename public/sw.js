// 町内会メッセンジャー Service Worker — Push通知受信

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
