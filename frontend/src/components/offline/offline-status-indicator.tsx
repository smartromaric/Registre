"use client";

/**
 * Pastille d'état réseau/file d'attente, toujours visible dans l'en-tête
 * applicatif (cahier des charges §11.3 : « L'interface affiche en permanence
 * l'état »). Le compteur suit `registre:offline-queue-changed` (voir
 * `lib/offline/db.ts`) avec un sondage léger en filet de sécurité — IndexedDB
 * n'a pas de mécanisme natif d'abonnement aux changements.
 *
 * Formulation « Hors-ligne — N opération(s) en attente » reprise mot pour mot
 * du cahier des charges (§11.3, §7.6 — cherchez « opérations en attente »).
 */

import { useEffect, useState } from "react";

import { countPendingOperations, OFFLINE_QUEUE_CHANGED_EVENT } from "@/lib/offline/db";

const POLL_INTERVAL_MS = 5_000;

export function OfflineStatusIndicator() {
  const [online, setOnline] = useState(() => typeof navigator !== "undefined" && navigator.onLine);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    function refreshCount() {
      void countPendingOperations().then(setPending);
    }
    refreshCount();

    function onOnline() {
      setOnline(true);
    }
    function onOffline() {
      setOnline(false);
    }

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(OFFLINE_QUEUE_CHANGED_EVENT, refreshCount);
    const interval = setInterval(refreshCount, POLL_INTERVAL_MS);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(OFFLINE_QUEUE_CHANGED_EVENT, refreshCount);
      clearInterval(interval);
    };
  }, []);

  if (online && pending === 0) {
    return (
      <span className="hidden items-center gap-1.5 px-1 text-xs text-muted-foreground sm:flex">
        <span className="size-1.5 rounded-full bg-muted-foreground/50" aria-hidden="true" />
        En ligne
      </span>
    );
  }

  if (online) {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden="true" />
        Synchronisation… {pending} en attente
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/15 px-2.5 py-1 text-xs font-medium text-gold-foreground">
      <span className="size-1.5 rounded-full bg-gold" aria-hidden="true" />
      {pending > 0 ? `Hors-ligne — ${pending} opération${pending > 1 ? "s" : ""} en attente` : "Hors-ligne"}
    </span>
  );
}
