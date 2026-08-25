"use client";

import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

/** Indicateur de chargement de la marque — remplace l'icône `Loader2` brute de
 * lucide dans les points de chargement les plus visibles (soumission d'un
 * formulaire d'authentification, actions majeures). Dégradé `primary → gold`
 * identique à celui de `SplashScreen`, pour que le même repère visuel se
 * retrouve partout où l'application dit "patientez". `prefers-reduced-motion` :
 * anneau statique à 75%, jamais de rotation infinie. */
export function Spinner({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  const gradientId = "spinner-ring";

  return (
    <motion.svg
      viewBox="0 0 24 24"
      className={cn("size-4", className)}
      animate={reduceMotion ? undefined : { rotate: 360 }}
      transition={reduceMotion ? undefined : { duration: 0.8, repeat: Infinity, ease: "linear" }}
      role="status"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.95" />
        </linearGradient>
      </defs>
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={reduceMotion ? "23.5 8" : "34 30"}
      />
    </motion.svg>
  );
}
