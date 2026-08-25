"use client";

/**
 * Déclenche la relecture de la file hors-ligne (`runSyncPass`) : une fois au
 * montage si déjà en ligne, à chaque retour de réseau (`window "online"`), et
 * toutes les 30 s en filet de sécurité tant que la session est authentifiée —
 * pas un substitut aux déclencheurs événementiels, juste une garantie contre
 * un événement manqué. Monté une seule fois, voir `auth-context.tsx`.
 */

import { useEffect, useRef } from "react";

import { pruneOldCachedRecords } from "./db";
import { runSyncPass } from "./sync-engine";

const SYNC_INTERVAL_MS = 30_000;

export function useOfflineSync(
  accessToken: string | null,
  status: "loading" | "authenticated" | "unauthenticated",
  refreshAccessToken: () => Promise<string | null>,
): void {
  const runningRef = useRef(false);
  const prunedRef = useRef(false);
  const accessTokenRef = useRef(accessToken);

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    if (status !== "authenticated") return;

    if (!prunedRef.current) {
      prunedRef.current = true;
      void pruneOldCachedRecords();
    }

    async function trigger() {
      const token = accessTokenRef.current;
      if (runningRef.current || !token) return;
      runningRef.current = true;
      try {
        await runSyncPass(token, refreshAccessToken);
      } finally {
        runningRef.current = false;
      }
    }

    if (typeof navigator !== "undefined" && navigator.onLine) void trigger();

    function onOnline() {
      void trigger();
    }
    window.addEventListener("online", onOnline);
    const interval = setInterval(() => void trigger(), SYNC_INTERVAL_MS);

    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(interval);
    };
  }, [status, refreshAccessToken]);
}
