import { DEFAULT_REMINDER_OFFSETS_DAYS } from "./api/types";

/**
 * Calcule l'état d'un champ Échéance à partir de sa date de fin et de ses paliers
 * de rappel (cahier des charges §5.4, §8.1). Utilisé à la fois par la colonne de
 * tableau (`data-table` compacte) et par la vue détail — une seule règle, pour ne
 * jamais afficher deux couleurs différentes pour la même échéance selon l'écran.
 *
 * Un mot accompagne toujours la couleur (PRODUCT.md §7.2) : chaque tonalité porte
 * un libellé, jamais seulement une pastille.
 */
export type DueDateTone = "overdue" | "urgent" | "upcoming" | "ok";

export interface DueDateStatus {
  tone: DueDateTone;
  label: string;
  diffDays: number;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function computeDueDateStatus(
  dueDateIso: string,
  offsetsDays?: number[] | null,
): DueDateStatus {
  const offsets = offsetsDays && hasOffsets(offsetsDays) ? offsetsDays : DEFAULT_REMINDER_OFFSETS_DAYS;
  const positiveOffsets = offsets.filter((o) => o > 0).sort((a, b) => a - b);
  const urgentThreshold = positiveOffsets[0] ?? 7;
  const upcomingThreshold = positiveOffsets[positiveOffsets.length - 1] ?? 60;

  const today = startOfDay(new Date());
  const due = startOfDay(new Date(dueDateIso));
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);

  if (diffDays < 0) {
    return { tone: "overdue", label: `En retard de ${Math.abs(diffDays)} j`, diffDays };
  }
  if (diffDays === 0) {
    return { tone: "urgent", label: "Échéance aujourd'hui", diffDays };
  }
  if (diffDays <= urgentThreshold) {
    return { tone: "urgent", label: `Dans ${diffDays} j`, diffDays };
  }
  if (diffDays <= upcomingThreshold) {
    return { tone: "upcoming", label: `Dans ${diffDays} j`, diffDays };
  }
  return { tone: "ok", label: `Dans ${diffDays} j`, diffDays };
}

function hasOffsets(offsets: number[]): boolean {
  return Array.isArray(offsets) && offsets.length > 0;
}

/** Classes Tailwind (jetons de thème, jamais de couleur en dur) pour chaque tonalité. */
export const DUE_DATE_TONE_CLASSES: Record<DueDateTone, string> = {
  overdue: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  urgent: "bg-warning/15 text-warning-foreground dark:bg-warning/20",
  upcoming: "bg-accent text-accent-foreground",
  ok: "bg-muted text-muted-foreground",
};
