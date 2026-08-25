"use client";

import { useEffect } from "react";

import { registerServiceWorker } from "@/lib/offline/register-service-worker";

/** Ne rend rien — un seul effet de bord au montage. Monté une fois dans
 * `app/providers.tsx`, voir ce fichier pour l'emplacement exact. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    registerServiceWorker();
  }, []);
  return null;
}
