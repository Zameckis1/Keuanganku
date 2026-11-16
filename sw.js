/* KEUANGANKU - service worker. File: sw.js
   Menyimpan file tampilan supaya aplikasi terbuka cepat. Data transaksi tidak disimpan di sini. */
const CACHE = 'keuanganku-v1';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'chart.umd.min.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

/* Tampilkan salinan tersimpan dulu, lalu perbarui diam-diam dari internet.
   Permintaan ke Apps Script (POST, beda alamat) tidak disentuh sama sekali. */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const tersimpan = await cache.match(req, { ignoreSearch: true });
    const baru = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => tersimpan);
    return tersimpan || baru;
  }));
});
