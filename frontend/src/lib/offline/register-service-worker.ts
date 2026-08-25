/** Enregistre `public/sw.js` (voir ce fichier pour ce qu'il fait — et surtout
 * ce qu'il ne fait pas). Échec silencieux : sans service worker l'application
 * reste utilisable en ligne, seul le mode hors-ligne recule. */
export function registerServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // Pas de remontée utilisateur ici : un navigateur qui refuse
      // l'enregistrement (mode privé strict, etc.) ne doit pas bloquer l'usage
      // en ligne normal de l'application.
    });
  });
}
