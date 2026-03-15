// ── StartupLog Service Worker ──
// 每次发版时同步更新 CACHE_VERSION（与 index.html 里的 VER 保持一致）
// 版本号变化 → 浏览器自动检测 → 后台下载新版 → 下次打开生效

const CACHE_VERSION = '20260314-047';
const CACHE_NAME = `startuplog-${CACHE_VERSION}`;

// 需要缓存的核心资源（离线也能打开）
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon192.png',
  './icon512.png',
];

// ── 安装：缓存核心资源 ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CORE_ASSETS);
    }).then(() => {
      // 新版本立即接管，不等旧 tab 关闭
      return self.skipWaiting();
    })
  );
});

// ── 激活：清理旧版本缓存 ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith('startuplog-') && key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] 删除旧缓存:', key);
            return caches.delete(key);
          })
      )
    ).then(() => {
      console.log('[SW] 新版本已激活:', CACHE_VERSION);
      // 立即接管所有已打开的页面
      return self.clients.claim();
    })
  );
});

// ── 请求拦截：网络优先策略 ──
// 核心逻辑：先尝试网络（获取最新），网络失败再用缓存（离线可用）
self.addEventListener('fetch', event => {
  const req = event.request;

  // 只处理同源请求，跨域 API（Supabase 等）直接放行
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // HTML / CSS / JS / 图片走「网络优先 + 缓存回退」
  event.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then(networkResponse => {
        // 请求成功 → 更新缓存
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return networkResponse;
      })
      .catch(() => {
        // 网络失败 → 从缓存取
        return caches.match(req).then(cached => {
          if (cached) return cached;
          // 连缓存也没有，返回离线页（降级到首页）
          return caches.match('./index.html');
        });
      })
  );
});

// ── 接收主页面发来的「跳过等待」消息 ──
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
