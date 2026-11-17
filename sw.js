// Cache the game's own files so a repeat visit (or a flaky connection) loads instantly from disk.
// Art/data: cache-first (big, rarely changes). Code/HTML: stale-while-revalidate (instant, picks up updates next load).
const CACHE = 'bubdrag-v1';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url); if (u.origin !== location.origin) return;
  const art = /\/assets\//.test(u.pathname);
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(r);
    const net = () => fetch(r).then(res => { if (res.ok) c.put(r, res.clone()); return res; });
    if (hit) { if (!art) net().catch(() => { }); return hit; }
    return net();
  }));
});
