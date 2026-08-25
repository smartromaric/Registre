"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { DUE_DATE_TONE_CLASSES, type DueDateTone } from "@/lib/due-date-status";
import { cn } from "@/lib/utils";

/**
 * Tuile d'indicateur du tableau de bord (cahier des charges §10.1, §10.5) —
 * les deux règles de conception non négociables du §10.5 vivent ici et nulle
 * part ailleurs :
 * - **cliquable** dès qu'un `onClick` est fourni : toute la tuile devient un
 *   bouton qui ouvre la liste filtrée derrière le chiffre — "un chiffre qui
 *   ne mène nulle part n'a pas sa place".
 * - **l'état se lit sans la couleur** : `tone` n'ajoute jamais qu'une
 *   pastille à côté d'un mot (`caption`), jamais à sa place. Même vocabulaire
 *   de tonalité que `DUE_DATE_TONE_CLASSES` (lib/due-date-status.ts) — le
 *   tableau de bord ne réinvente pas une palette d'état séparée du reste de
 *   l'application. Le liseré de couleur ajouté par la refonte (2026-08-25)
 *   reste redondant avec le mot, jamais son seul porteur.
 */
export interface StatTileProps {
  label: string;
  value: ReactNode;
  /** Texte d'appoint sous la valeur. Simple texte gris si `tone` est absent
   * (tuile informative, ex. "3 immobilisés"), pastille colorée + mot sinon
   * (tuile d'anomalie, ex. "Critique — à traiter"). */
  caption?: string;
  tone?: DueDateTone;
  onClick?: () => void;
  className?: string;
  /** Rang dans une grille de tuiles — décale l'entrée pour un effet de vague
   * plutôt qu'un bloc qui apparaît d'un coup. Facultatif, sans effet sur
   * l'API existante des appelants qui ne le passent pas. */
  index?: number;
}

const TONE_ACCENT: Record<DueDateTone, string> = {
  overdue: "before:bg-destructive",
  urgent: "before:bg-warning",
  upcoming: "before:bg-gold",
  ok: "before:bg-transparent",
};

export function StatTile({ label, value, caption, tone, onClick, className, index = 0 }: StatTileProps) {
  const reduceMotion = useReducedMotion();
  const entrance = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.32, delay: Math.min(index, 8) * 0.045, ease: "easeOut" as const },
      };
  const shared = cn(
    "group/tile relative flex flex-col gap-1.5 overflow-hidden rounded-xl border border-border bg-card p-4 text-left ring-1 ring-foreground/5",
    "before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-['']",
    tone ? TONE_ACCENT[tone] : "before:bg-transparent",
    onClick &&
      "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    className,
  );
  const hoverProps = onClick
    ? {
        whileHover: reduceMotion
          ? undefined
          : {
              y: -3,
              boxShadow: "0 12px 28px -12px color-mix(in oklch, var(--primary), transparent 65%)",
              transition: { type: "spring" as const, stiffness: 400, damping: 28 },
            },
        whileTap: reduceMotion ? undefined : { y: 0, scale: 0.99 },
      }
    : {};

  const content = (
    <>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="font-heading text-2xl font-semibold tabular-nums text-foreground">{value}</span>
      {caption ? (
        tone ? (
          <span
            className={cn(
              "inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
              DUE_DATE_TONE_CLASSES[tone],
            )}
          >
            <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />
            {caption}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{caption}</span>
        )
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <motion.button type="button" onClick={onClick} className={shared} {...entrance} {...hoverProps}>
        {content}
      </motion.button>
    );
  }
  return (
    <motion.div className={shared} {...entrance}>
      {content}
    </motion.div>
  );
}
