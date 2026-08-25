"use client";

import { motion, useReducedMotion } from "framer-motion";

import { Logo } from "./logo";

/** Écran de patience affiché pendant la reconstruction de session (voir
 * AuthProvider). Respecte prefers-reduced-motion : pas de pulsation pour les
 * personnes qui l'ont désactivée, juste le repère statique. */
export function SplashScreen() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col items-center gap-4"
      >
        <motion.div
          animate={reduceMotion ? undefined : { opacity: [1, 0.55, 1] }}
          transition={reduceMotion ? undefined : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <Logo size="md" />
        </motion.div>
        <span className="sr-only">Chargement de Registre…</span>
      </motion.div>
    </div>
  );
}
