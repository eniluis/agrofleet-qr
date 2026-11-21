const CACHE_NAME = 'agrofleet-qr-v3';
const ASSETS = ['/agrofleet-qr/', '/agrofleet-qr/index.html', '/agrofleet-qr/manifest.json'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Nunca cachear peticiones de datos a Supabase
    if (event.request.url.includes('supabase.co')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Estrategia Network-First para archivos de la app (HTML, JS, CSS)
    event.respondWith(
        fetch(event.request)
        .then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            return response;
        })
        .catch(() => caches.match(event.request))
    );
});