import type { AlertOut, AlertSourceType, AlertStatus, AlertTarget, OrgRole } from "./api/types";
import type { DueDateTone } from "./due-date-status";

/**
 * Vocabulaire français et tonalités des alertes (cahier des charges §8.1, §8.3).
 * Un seul endroit, comme `roles.ts` pour les abonnements : l'écran Alertes et la
 * cloche de l'en-tête doivent nommer un même état avec un même mot.
 *
 * Aucune tonalité n'est inventée ici : `describePalier` retombe sur le
 * vocabulaire de `DueDateTone` (lib/due-date-status.ts), et chaque tonalité est
 * toujours rendue **avec son mot** (PRODUCT.md §7.2).
 */

/** Cycle de vie du §8.3 : émise → acquittée | reportée → résolue. */
export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  emitted: "Émise",
  acknowledged: "Acquittée",
  postponed: "Reportée",
  resolved: "Résolue",
};

/** Mêmes jetons de thème que `SUBSCRIPTION_STATUS_TONE_CLASSES` (lib/roles.ts) —
 * jamais de couleur en dur, jamais une seconde palette d'état. */
export const ALERT_STATUS_TONE_CLASSES: Record<AlertStatus, string> = {
  emitted: "bg-warning/15 text-warning-foreground dark:bg-warning/20",
  acknowledged: "bg-accent text-accent-foreground",
  postponed: "bg-gold/15 text-gold-foreground dark:bg-gold/20",
  resolved: "bg-success/10 text-success dark:bg-success/20",
};

/** Libellés du tableau des sources, §8.1. Le `default` n'est pas mort : le
 * backend sérialise `source_type` en `str` libre, une source ajoutée plus tard
 * arriverait ici sans que le typage ne l'ait signalé. */
export function alertSourceLabel(sourceType: AlertSourceType): string {
  switch (sourceType) {
    case "deadline":
      return "Échéance de document";
    case "stock_threshold":
      return "Seuil de stock";
    case "lot_expiry":
      return "Péremption de lot";
    default:
      return "Alerte";
  }
}

export interface PalierDescription {
  tone: DueDateTone;
  label: string;
}

/**
 * Traduit le palier brut (`"j-30"`, `"overdue-2"`, `"week-2026-35"`) en un mot
 * et une tonalité. On décrit le **palier franchi**, pas un délai recalculé :
 * une alerte émise à J-60 reste une alerte de palier J-60 le jour où on la lit,
 * et afficher « dans 60 jours » des semaines plus tard serait faux.
 */
export function describePalier(palier: string): PalierDescription {
  if (palier.startsWith("overdue")) {
    return { tone: "overdue", label: "En retard" };
  }
  if (palier === "j-0") {
    return { tone: "urgent", label: "Jour J" };
  }
  if (palier.startsWith("j-")) {
    const days = Number.parseInt(palier.slice(2), 10);
    if (Number.isFinite(days)) {
      return { tone: days <= 7 ? "urgent" : "upcoming", label: `J-${days}` };
    }
  }
  // Palier hebdomadaire d'un seuil de stock : la clé porte la semaine ISO, pas
  // un délai — le fait utile à afficher est que le stock est sous le seuil.
  if (palier.startsWith("week-")) {
    return { tone: "urgent", label: "Sous le seuil" };
  }
  return { tone: "ok", label: "À traiter" };
}

/**
 * Reproduit `AlertService._check_can_touch` (backend) : le destinataire d'une
 * alerte personnelle peut toujours l'acquitter ou la reporter quel que soit son
 * rôle ; toute autre alerte exige `CONFIGURE_ALERTS`, c'est-à-dire ADMIN ou
 * MANAGER. Sans ce miroir, l'écran proposerait un bouton qui finit en 403.
 */
export function canActOnAlert(alert: AlertOut, userId: string | null, role: OrgRole | null): boolean {
  if (userId !== null && alert.recipient_user_id === userId) return true;
  return role === "admin" || role === "manager";
}

/**
 * Où mène une alerte, ou `null` quand elle ne mène nulle part.
 *
 * Un seul endroit décide de cette traduction — l'écran Alertes et la cloche de
 * l'en-tête doivent envoyer au même endroit, sans quoi cliquer sur la même
 * alerte à deux endroits donnerait deux résultats.
 *
 * - Fiche : `/r/{id}` résout le modèle tout seul (voir cette route), ce qui
 *   évite d'exposer `model_definition_id` dans la cible.
 * - Stock : `/depots` est le SEUL écran de stock existant côté frontend — il n'y
 *   a ni page article, ni vue des niveaux par dépôt (le backend, lui, les a).
 *   On n'ajoute donc AUCUN paramètre de filtre : la page l'ignorerait, et un
 *   lien qui prétend filtrer sans filtrer est un mensonge de plus. Le détail
 *   (article, dépôt) est porté par `label`, qui lui est exact.
 * - Rien de navigable (source supprimée) : `null`, et l'appelant n'affiche pas
 *   de lien. Jamais de lien fabriqué qui finirait en 404.
 */
export function alertTargetHref(target: AlertTarget | null | undefined): string | null {
  if (!target) return null;
  if (target.record_id) return `/r/${target.record_id}`;
  if (target.depot_id) return "/depots";
  return null;
}
