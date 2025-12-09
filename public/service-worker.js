const CACHE_NAME = "quadras-cache-v1";
const URLS_TO_CACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png"
];

// Instalação (cache inicial)
self.addEventListener("install", (event) => {
  console.log("Service Worker: Instalando...");

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Service Worker: Cache adicionado");
      return cache.addAll(URLS_TO_CACHE);
    })
  );
});

// Ativação (limpar versões antigas)
self.addEventListener("activate", (event) => {
  console.log("Service Worker: Ativado");
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("Service Worker: Cache antigo removido:", key);
            return caches.delete(key);
          }
        })
      )
    )
  );
});

// Interceptar requisições
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Se estiver no cache, retorna
      if (response) return response;

      // Caso contrário, busca na internet
      return fetch(event.request);
    })
  );
});
