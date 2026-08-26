"use client";

import { useSyncExternalStore } from "react";

/**
 * `prefers-reduced-motion` — playbook §6, « n'est pas une option ».
 *
 * `useSyncExternalStore` plutôt que `useState` + `useEffect` : le réglage peut
 * changer *pendant* la visite (l'utilisateur bascule l'option système), et un
 * effet qui pose l'état au montage ne le verrait jamais. C'est aussi la forme qui
 * évite la règle `react-hooks/set-state-in-effect`.
 *
 * Instantané serveur : `false`. Le rendu statique suppose donc le mouvement
 * autorisé, et le client corrige immédiatement après l'hydratation — l'inverse
 * (supposer le mouvement réduit) livrerait la version dégradée aux moteurs
 * d'indexation.
 */
const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
