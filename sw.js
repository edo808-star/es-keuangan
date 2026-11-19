/* ES Keuangan — service worker
 * Menyimpan (cache) SEMUA file aplikasi saat instal, lalu melayaninya dari cache
 * sehingga aplikasi bisa dibuka tanpa internet sama sekali.
 * Setiap kali ada file yang diubah, NAIKKAN nomor VERSI di bawah agar HP mengunduh versi baru.
 */
const VERSI = 'v1.1.0';
const CACHE = 'es-keuangan-' + VERSI;

const FILE_APP = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/db.js',
  './js/app.js',
  './lib/chart.umd.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // cache: 'reload' memastikan file diambil segar dari server, bukan dari cache HTTP browser
      cache.addAll(FILE_APP.map((u) => new Request(u, { cache: 'reload' })))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('es-keuangan-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigasi halaman: selalu layani index.html dari cache (offline-first)
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html', { ignoreSearch: true }).then((res) => res || fetch(req))
    );
    return;
  }

  // File lain: cache dulu, jika tidak ada ambil dari jaringan lalu simpan
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const salin = res.clone();
          caches.open(CACHE).then((c) => c.put(req, salin));
        }
        return res;
      });
    })
  );
});
