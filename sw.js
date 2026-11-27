const CACHE_NAME = "agrofleet-qr-v31";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/app.js",
  "./js/config.js",
  "./js/api.js",
  "./js/auth.js",
  "./js/qr-fleet.js",
  "./js/diesel.js",
  "./js/maintenance.js",
  "./js/history.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of ASSETS) {
        try {
          const req = new Request(asset, { cache: "no-store" });
          const res = await fetch(req);
          if (res && res.ok) {
            await cache.put(asset, res);
          }
        } catch (err) {
          console.warn("[SW] No se pudo pre-cachear:", asset);
        }
      }
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Nunca cachear peticiones de datos a Supabase ni métodos distintos a GET
  if (req.method !== "GET" || req.url.includes("supabase.co")) {
    event.respondWith(fetch(req));
    return;
  }

  const isSameOrigin = new URL(req.url).origin === self.location.origin;

  // Para archivos propios (HTML, JS, CSS): forzar consulta fresca a GitHub (no-store) y actualizar caché
  if (isSameOrigin) {
    event.respondWith(
      fetch(req, { cache: "no-store" })
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return response;
        })
        .catch(() => caches.match(req, { ignoreSearch: true })),
    );
    return;
  }

  // Para recursos externos (Tailwind CDN, fuentes, librerías QR): red primero con respaldo en caché
  event.respondWith(
    fetch(req)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return response;
      })
      .catch(() => caches.match(req)),
  );
});
