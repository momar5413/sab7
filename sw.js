// Offline support for the web version (not used inside the Android app).
const CACHE = 'sab7-v2';
const SHELL = [
    './', './index.html', './css/style.css', './js/app.js', './js/platform.js',
    './manifest.webmanifest', './img/img1.jpg', './icons/icon-192.png',
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim()),
    );
});

// Stale-while-revalidate for same-origin GET requests.
self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
    e.respondWith(
        caches.open(CACHE).then(async (cache) => {
            const cached = await cache.match(req, { ignoreSearch: true });
            const network = fetch(req)
                .then((res) => {
                    if (res.ok) cache.put(req, res.clone());
                    return res;
                })
                .catch(() => cached);
            return cached || network;
        }),
    );
});

self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    e.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
            if (list.length) return list[0].focus();
            return self.clients.openWindow('./');
        }),
    );
});
