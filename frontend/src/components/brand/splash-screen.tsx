"use client";

import { motion, useReducedMotion } from "framer-motion";

import { Logo } from "./logo";

/** Écran de patience affiché pendant la reconstruction de session (voir
 * AuthProvider). L'anneau tournant est purement décoratif (`aria-hidden`) —
 * le seul contenu annoncé aux lecteurs d'écran reste le texte `sr-only`.
 * Respecte prefers-reduced-motion : ni rotation ni pulsation pour les
 * personnes qui l'ont désactivée, juste le repère statique. */
export function SplashScreen() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col items-center gap-6"
      >
        <div className="relative flex size-20 items-center justify-center" aria-hidden>
          {reduceMotion ? null : (
            <motion.svg
              viewBox="0 0 80 80"
              className="absolute inset-0 size-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
            >
              <defs>
                <linearGradient id="splash-ring" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity="0" />
                  <stop offset="55%" stopColor="var(--primary)" stopOpacity="0.75" />
                  <stop offset="100%" stopColor="var(--gold)" stopOpacity="0.9" />
                </linearGradient>
              </defs>
              <circle
                cx="40"
                cy="40"
                r="36"
                fill="none"
                stroke="url(#splash-ring)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray="130 226"
              />
            </motion.svg>
          )}
          <motion.div
            animate={reduceMotion ? undefined : { scale: [1, 1.06, 1] }}
            transition={reduceMotion ? undefined : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          >
            <Logo size="md" withWordmark={false} />
          </motion.div>
        </div>
        <span className="sr-only">Chargement de Registre…</span>
      </motion.div>
    </div>
  );
}
