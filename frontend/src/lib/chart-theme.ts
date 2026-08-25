"use client";

/**
 * Pont entre les jetons de thème de `globals.css` et Chart.js — la seule source
 * de couleur des graphiques du tableau de bord (playbook §3 : « un jeton pour le
 * thème, jamais de couleur en dur »). Aucune valeur de couleur n'est écrite ici :
 * tout est relu sur le document, et relu à nouveau à chaque bascule clair/sombre.
 *
 * Deux contraintes dictent la forme de ce module :
 *
 * - Les jetons sont écrits en `oklch()`. Le canevas HTML sait les peindre, mais
 *   l'analyseur de couleurs interne de Chart.js (celui qui dérive les teintes de
 *   survol et les aplats semi-transparents) ne connaît que `rgb`/`hsl`/hex et
 *   rend du noir sur un `oklch()`. On fait donc résoudre chaque jeton par le
 *   navigateur lui-même — un pixel peint avec la valeur telle quelle, puis relu.
 * - Les jetons ne sont lisibles que côté navigateur : `useChartTheme` renvoie
 *   `null` tant que le document n'a pas été lu, ce qui donne aussi aux appelants
 *   le signal « ne pas monter le canevas » côté serveur.
 */

import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { useTheme } from "next-themes";

/** Vocabulaire de tonalité des graphiques — un jeton, jamais une couleur. */
export type ChartTone = "primary" | "gold" | "success" | "warning" | "destructive" | "neutral";

const TONE_TOKENS: Record<ChartTone, string> = {
  primary: "--primary",
  gold: "--gold",
  success: "--success",
  warning: "--warning",
  destructive: "--destructive",
  neutral: "--muted-foreground",
};

/** Habillage : grille, graduations, valeurs, infobulle. */
const CHROME_TOKENS = {
  grid: "--border",
  tick: "--muted-foreground",
  value: "--foreground",
  surface: "--card",
  tooltipBackground: "--popover",
  tooltipForeground: "--popover-foreground",
  tooltipBorder: "--border",
} as const;

type ChromeKey = keyof typeof CHROME_TOKENS;

interface Channels {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface TokenSnapshot {
  /** Concaténation des valeurs brutes lues — permet d'ignorer une relecture qui
   * n'a rien changé plutôt que de refabriquer un thème à chaque mutation du
   * document. */
  signature: string;
  tones: Record<ChartTone, Channels>;
  chrome: Record<ChromeKey, Channels>;
  fontFamily: string;
}

let probe: CanvasRenderingContext2D | null | undefined;

function probeContext(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (probe === undefined) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    probe = canvas.getContext("2d", { willReadFrequently: true });
  }
  return probe;
}

const UNPARSEABLE = "#ff00ff";

function toChannels(ctx: CanvasRenderingContext2D, raw: string): Channels | null {
  const value = raw.trim();
  if (!value) return null;
  // `fillStyle` garde silencieusement sa valeur précédente quand il ne sait pas
  // analyser celle qu'on lui donne : sans cette sentinelle, un jeton illisible
  // emprunterait la couleur du jeton lu juste avant.
  ctx.fillStyle = UNPARSEABLE;
  ctx.fillStyle = value;
  if (ctx.fillStyle === UNPARSEABLE) return null;
  try {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  } catch {
    // `getImageData` peut lever chez un navigateur qui bride la lecture de
    // canevas (protections anti-empreinte). On renvoie `null` : l'appelant
    // retombe alors sur le substitut accessible (tableau lisible + espace
    // réservé) au lieu de faire remonter l'exception jusqu'à une page blanche.
    return null;
  }
}

function readSnapshot(): TokenSnapshot | null {
  const ctx = probeContext();
  if (!ctx) return null;

  const styles = getComputedStyle(document.documentElement);
  const raw: string[] = [];
  const read = (token: string): Channels | null => {
    const value = styles.getPropertyValue(token);
    raw.push(value);
    return toChannels(ctx, value);
  };

  const tones = {} as Record<ChartTone, Channels>;
  for (const [tone, token] of Object.entries(TONE_TOKENS) as [ChartTone, string][]) {
    const channels = read(token);
    if (!channels) return null;
    tones[tone] = channels;
  }

  const chrome = {} as Record<ChromeKey, Channels>;
  for (const [key, token] of Object.entries(CHROME_TOKENS) as [ChromeKey, string][]) {
    const channels = read(token);
    if (!channels) return null;
    chrome[key] = channels;
  }

  // `--font-sans` est posé par `next/font` (layout.tsx) ; la police effective du
  // corps de texte reste le repli sûr si la variable n'est pas encore appliquée.
  const fontFamily = styles.getPropertyValue("--font-sans").trim() || getComputedStyle(document.body).fontFamily;
  raw.push(fontFamily);

  return { signature: raw.join("|"), tones, chrome, fontFamily };
}

function css({ r, g, b, a }: Channels, opacity = a): string {
  return `rgba(${r}, ${g}, ${b}, ${Number(opacity.toFixed(3))})`;
}

export interface ChartTheme {
  /** Change exactement quand la palette change — sert de `key` au canevas, pour
   * que Chart.js reparte d'un rendu neuf plutôt que de garder une couleur du
   * thème précédent quelque part dans son état interne. */
  paletteKey: string;
  /** Couleur pleine d'une tonalité. */
  color: (tone: ChartTone) => string;
  /** Même tonalité, atténuée — aplat de survol, aire sous une courbe. */
  fade: (tone: ChartTone, opacity: number) => string;
  grid: string;
  tick: string;
  value: string;
  surface: string;
  tooltipBackground: string;
  tooltipForeground: string;
  tooltipBorder: string;
  fontFamily: string;
  /** `false` quand le système demande moins de mouvement (§ accessibilité) —
   * à passer tel quel à l'option `animation` de Chart.js. */
  animated: boolean;
  /** Largeur réelle d'un texte pour une police donnée (raccourci CSS `font`),
   * pour réserver la marge d'une étiquette de valeur plutôt que de la laisser
   * déborder du canevas. */
  measureText: (text: string, font: string) => number;
}

/**
 * Thème de graphique courant, recalculé à chaque changement de thème.
 *
 * L'observateur de mutations n'est pas une ceinture de sécurité en trop :
 * `resolvedTheme` change *avant* que next-themes n'ait posé la classe sur
 * `<html>` (l'effet du fournisseur, parent, s'exécute après celui de ce
 * composant, enfant). Relire les jetons sur le seul changement de
 * `resolvedTheme` renverrait donc encore la palette de l'ancien thème.
 */
export function useChartTheme(): ChartTheme | null {
  const { resolvedTheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const [snapshot, setSnapshot] = useState<TokenSnapshot | null>(null);

  useEffect(() => {
    const reread = () =>
      setSnapshot((previous) => {
        const next = readSnapshot();
        if (next && previous && next.signature === previous.signature) return previous;
        return next;
      });

    reread();
    const observer = new MutationObserver(reread);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    return () => observer.disconnect();
  }, [resolvedTheme]);

  return useMemo(() => {
    if (!snapshot) return null;
    const { tones, chrome, fontFamily } = snapshot;
    return {
      paletteKey: snapshot.signature,
      color: (tone) => css(tones[tone]),
      fade: (tone, opacity) => css(tones[tone], opacity),
      grid: css(chrome.grid),
      tick: css(chrome.tick),
      value: css(chrome.value),
      surface: css(chrome.surface),
      tooltipBackground: css(chrome.tooltipBackground),
      tooltipForeground: css(chrome.tooltipForeground),
      tooltipBorder: css(chrome.tooltipBorder),
      fontFamily,
      animated: !reduceMotion,
      measureText: (text, font) => {
        const ctx = probeContext();
        if (!ctx) return text.length * 7;
        ctx.font = font;
        return ctx.measureText(text).width;
      },
    } satisfies ChartTheme;
  }, [snapshot, reduceMotion]);
}

/** Infobulle commune à tous les graphiques du tableau de bord. */
export function tooltipStyle(theme: ChartTheme) {
  return {
    backgroundColor: theme.tooltipBackground,
    titleColor: theme.tooltipForeground,
    bodyColor: theme.tooltipForeground,
    borderColor: theme.tooltipBorder,
    borderWidth: 1,
    cornerRadius: 8,
    padding: 10,
    titleFont: { family: theme.fontFamily, size: 12, weight: 600 },
    bodyFont: { family: theme.fontFamily, size: 12 },
  };
}
