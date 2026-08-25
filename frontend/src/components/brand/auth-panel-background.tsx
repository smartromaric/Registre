"use client";

import { motion, useReducedMotion } from "framer-motion";

/** Fond décoratif du panneau de marque (écrans d'authentification, ≥lg) :
 * un maillage de lueurs `primary`/`gold` qui dérive lentement, sur une trame
 * de points fine. Purement `aria-hidden` — jamais de contenu porté par cette
 * couche. `prefers-reduced-motion` : lueurs figées à leur position médiane,
 * pas d'animation de dérive. */
export function AuthPanelBackground() {
  const reduceMotion = useReducedMotion();

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <motion.div
        className="absolute -top-1/4 -left-1/4 size-[70%] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, color-mix(in oklch, var(--primary), transparent 25%), transparent 70%)" }}
        animate={reduceMotion ? undefined : { x: [0, 40, 0], y: [0, 30, 0] }}
        transition={reduceMotion ? undefined : { duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-1/4 -bottom-1/4 size-[65%] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, color-mix(in oklch, var(--gold), transparent 35%), transparent 70%)" }}
        animate={reduceMotion ? undefined : { x: [0, -30, 0], y: [0, -40, 0] }}
        transition={reduceMotion ? undefined : { duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-veil via-transparent to-transparent" />
    </div>
  );
}
