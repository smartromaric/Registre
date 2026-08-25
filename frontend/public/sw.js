// Service worker de Registre (cahier des charges §11.3, PRODUCT.md §10.11) —
// portée délibérément étroite : rendre une page déjà visitée consultable
// hors-ligne, rien de plus. Écrit à la main (pas de next-pwa/workbox : aucune
// dépendance de ce genre dans le projet, et leur compatibilité avec Turbopack
// n'est pas garantie).
//
// Ne touche JAMAIS au backend FastAPI ni aux routes /api/* (proxy d'auth
// Next.js, cookies httpOnly) : le jeton d'accès vit uniquement en mémoire côté
// JS (src/lib/session.ts, choix délibéré contre le XSS) et un service worker
// n'a aucun moyen de le poser sur une requête — toute l'authentification et
// les flux de données restent hors de ses mains, gérés par lib/offline/*.

const CACHE_VERSION = "v1";
const CACHE_NAME = `registre-shell-${CACHE_VERSION}`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("registre-shell-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("registre-sw: hors-ligne et rien en cache pour cette page");
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Bundles statiques Next (JS/CSS versionnés par hash) : cache-first, ils ne
  // changent jamais de contenu sous le même nom de fichier.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Pages HTML déjà visitées : réseau d'abord (toujours la version la plus
  // fraîche en ligne), repli sur le cache seulement si le réseau est injoignable.
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  }
});
