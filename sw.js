// Keeps the app itself (page, icons, AI engine code) available offline.
// The model files are saved separately by the AI engine in its own storage.
const VERSION = 'local-ai-v2';
const SHELL = ['./', './index.html', './manifest.json', './apple-touch-icon.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // Add files one by one so a single missing file doesn't break offline support.
    await Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Only remove this app's old caches. Never touch the model caches ("webllm/...").
    await Promise.all(keys.filter((k) => k.startsWith('local-ai-') && k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function putInCache(request, response) {
  if (response && response.ok) {
    const cache = await caches.open(VERSION);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // The app's own files: try the network for updates, fall back to the saved copy.
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      try {
        return await putInCache(req, await fetch(req));
      } catch {
        const hit = await caches.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === 'navigate') return (await caches.match('./index.html')) || Response.error();
        return Response.error();
      }
    })());
    return;
  }

  // The AI engine code from the CDN is version-pinned, so a saved copy never goes stale.
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      return putInCache(req, await fetch(req));
    })());
  }
  // Everything else (model downloads) passes straight through; the engine caches those itself.
});
