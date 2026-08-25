/** Enregistre `public/sw.js` (voir ce fichier pour ce qu'il fait — et surtout
 * ce qu'il ne fait pas). Échec silencieux : sans service worker l'application
 * reste utilisable en ligne, seul le mode hors-ligne recule.
 *
 * Uniquement en production. `sw.js` sert les bundles `/_next/static/*` en
 * cache-first en supposant qu'"ils ne changent jamais de contenu sous le même
 * nom de fichier" — vrai pour un build de production (noms versionnés par
 * hash de contenu), FAUX en développement (`next dev`/Turbopack), où le
 * chemin d'un chunk reste stable d'un redémarrage à l'autre même quand son
 * contenu change. Un service worker enregistré une fois en dev continue de
 * servir du JS périmé indéfiniment après chaque modification de code, quel
 * que soit le nombre de redémarrages du serveur — bug réel rencontré le jour
 * même de la construction de cette fonctionnalité (voir PRODUCT.md §10.14). */
export function registerServiceWorker(): void {
  if (process.env.NODE_ENV !== "production") {
    unregisterStaleServiceWorker();
    return;
  }
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // Pas de remontée utilisateur ici : un navigateur qui refuse
      // l'enregistrement (mode privé strict, etc.) ne doit pas bloquer l'usage
      // en ligne normal de l'application.
    });
  });
}

/** Auto-guérison pour quiconque a démarré le serveur de dev avant ce
 * correctif (voir plus haut) : sans ceci, le service worker déjà installé
 * dans le navigateur continuerait de servir du JS périmé indéfiniment, un
 * correctif de code seul ne le désinstalle pas rétroactivement. */
function unregisterStaleServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) void registration.unregister();
  });
  if (typeof caches !== "undefined") {
    void caches.keys().then((keys) => {
      for (const key of keys) {
        if (key.startsWith("registre-shell-")) void caches.delete(key);
      }
    });
  }
}
