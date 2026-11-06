/**
 * Service Worker - 离线缓存支持
 */

const CACHE_NAME = 'study-helper-v2';
const urlsToCache = [
  './',
  './index.html',
  './css/style.css',
  './js/storage.js',
  './js/app.js',
  './data/english.json',
  './data/chinese.json',
  './manifest.json'
];

// 安装 - 缓存资源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('缓存已打开');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// 激活 - 清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// 请求拦截 - 离线优先，然后网络更新
self.addEventListener('fetch', event => {
  // 只处理GET请求
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // 如果有缓存，返回缓存
        if (cachedResponse) {
          // 后台更新缓存
          fetch(event.request).then(response => {
            if (response && response.status === 200) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, responseClone);
              });
            }
          }).catch(() => {});
          return cachedResponse;
        }

        // 没有缓存，尝试网络
        return fetch(event.request).then(response => {
          // 检查是否是有效的响应
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // 缓存新的响应
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });

          return response;
        }).catch(() => {
          // 网络也失败了，返回离线页面
          return caches.match('./index.html');
        });
      })
  );
});
