import type { ArticleVariantOut, MovementType } from "@/lib/api/types";

/**
 * Petits utilitaires d'affichage partagés par les écrans du module Stock
 * (cahier des charges §7) — un seul endroit pour les libellés français des
 * types de mouvement et le calcul du seuil effectif d'une variante, pour ne
 * jamais afficher deux libellés différents pour la même notion selon l'écran.
 */

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  entry: "Entrée",
  exit: "Sortie",
  transfer_out: "Transfert (sortant)",
  transfer_in: "Transfert (entrant)",
  adjustment: "Ajustement",
};

/** Classes Tailwind (jetons de thème) par type de mouvement — même vocabulaire
 * de tonalité que `DUE_DATE_TONE_CLASSES` (lib/due-date-status.ts). */
export const MOVEMENT_TYPE_TONE_CLASSES: Record<MovementType, string> = {
  entry: "bg-success/10 text-success dark:bg-success/20",
  exit: "bg-muted text-foreground",
  transfer_out: "bg-accent text-accent-foreground",
  transfer_in: "bg-accent text-accent-foreground",
  adjustment: "bg-warning/15 text-warning-foreground dark:bg-warning/20",
};

/** Libellé d'affichage d'une variante : son libellé personnalisé, sinon la
 * jointure de ses attributs (déjà calculée côté backend), sinon "Standard"
 * pour la variante par défaut d'un article non décliné. */
export function variantLabel(variant: Pick<ArticleVariantOut, "label" | "attributes">): string {
  if (variant.label) return variant.label;
  if (variant.attributes && Object.keys(variant.attributes).length > 0) {
    return Object.values(variant.attributes).join(" / ");
  }
  return "Standard";
}

/** Seuil effectif d'une variante pour un dépôt donné : la surcharge par dépôt
 * si elle existe, sinon le seuil global de la variante (`null` = aucun seuil
 * réglé, la ligne n'est jamais signalée en rupture). */
export function effectiveThreshold(
  defaultThreshold: number | null,
  depotId: string,
  overrides: { depot_id: string; threshold: number }[],
): number | null {
  const override = overrides.find((o) => o.depot_id === depotId);
  return override ? override.threshold : defaultThreshold;
}

export function isBelowThreshold(quantity: number, threshold: number | null): boolean {
  return threshold != null && quantity < threshold;
}

export function formatQuantityDelta(delta: number): string {
  const formatted = new Intl.NumberFormat("fr-FR", { signDisplay: "always" }).format(delta);
  return formatted;
}
