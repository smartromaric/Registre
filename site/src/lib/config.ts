/**
 * Chronologie du hero — playbook §3 « Le scroll pilote, il ne joue pas ».
 *
 * Le scroll n'est pas un défilement de blocs : c'est une **variable d'entrée**
 * dont on dérive l'état d'un objet unique (la fiche). Toutes les bornes vivent
 * ici, et nulle part ailleurs : régler la mise en scène doit rester une édition
 * de deux nombres, jamais une chasse dans le code.
 *
 * Les six phases sont contiguës et couvrent [0, 1] sans trou : à tout moment du
 * scroll, exactement une phase est en cours. C'est ce qui permet au titre de
 * n'être jamais vide.
 */
export const PHASES = {
  /** Des feuillets épars convergent et s'empilent en une seule fiche. */
  gather: [0.0, 0.18],
  /** La fiche, vide, écrit ses propres champs. */
  declare: [0.18, 0.36],
  /** L'échéance « Assurance » mûrit : J-30 → J-7 → aujourd'hui. */
  ripen: [0.36, 0.54],
  /** L'alerte se détache de la fiche et s'envole. */
  alert: [0.54, 0.7],
  /** Le réseau coupe, la saisie continue, la file se vide au retour. */
  offline: [0.7, 0.86],
  /** La fiche unique se démultiplie en la bibliothèque de modèles. */
  library: [0.86, 1.0],
} as const satisfies Record<string, readonly [number, number]>;

export type PhaseName = keyof typeof PHASES;

export const PHASE_ORDER = Object.keys(PHASES) as PhaseName[];

/** Hauteur de la zone épinglée, en multiples de la hauteur d'écran. */
export const HERO_SCROLL_VH = 620;

/** Nombre de feuillets épars au lever de rideau (phase `gather`). */
export const SCATTER_COUNT = 14;

/** Réglage du scroll lissé. Plus bas = plus « lourd », plus haut = plus nerveux. */
export const LENIS_LERP = 0.085;

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Progression *dans* une phase, ramenée à [0, 1].
 * Avant la phase : 0. Après : 1. C'est ce qui rend les états stables quand on
 * saute directement à une ancre — rien ne reste figé à son état d'initialisation.
 */
export function phaseProgress(heroProgress: number, phase: PhaseName): number {
  const [start, end] = PHASES[phase];
  return clamp01((heroProgress - start) / (end - start));
}

/** La phase en cours à une progression donnée (la dernière dont le début est passé). */
export function currentPhase(heroProgress: number): PhaseName {
  let active: PhaseName = PHASE_ORDER[0];
  for (const name of PHASE_ORDER) {
    if (heroProgress >= PHASES[name][0]) active = name;
  }
  return active;
}

/** Interpolation linéaire, bornée. */
export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * clamp01(t);
}

/**
 * Adoucissement — une progression linéaire donne une animation « mécanique ».
 * easeInOut cubique : démarrage et arrivée calmes, milieu rapide.
 */
export function easeInOut(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Sortie seule : rapide au début, arrivée en douceur. Pour ce qui « atterrit ». */
export function easeOut(t: number): number {
  return 1 - Math.pow(1 - clamp01(t), 3);
}
