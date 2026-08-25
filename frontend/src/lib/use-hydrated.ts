"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * Vrai seulement une fois le composant hydraté côté client. Remplace le
 * classique `useState(false) + useEffect(() => setState(true), [])` — cette
 * dernière forme déclenche un `setState` synchrone dans le corps d'un effet,
 * ce que `eslint-plugin-react-hooks` (React Compiler) signale désormais comme
 * une erreur (`react-hooks/set-state-in-effect`). `useSyncExternalStore` donne
 * la même garantie (rendu serveur = `false`, premier rendu client réel =
 * `true`) sans ce piège.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
