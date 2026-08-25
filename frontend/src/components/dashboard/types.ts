import type { DashboardPeriod } from "@/lib/api/types";

/**
 * Périmètre courant du tableau de bord (cahier des charges §10.2, §10.4) —
 * partagé entre la page d'accueil, le bandeau de filtres et les dialogues
 * d'enregistrement/chargement d'un tableau de bord nommé. `modelId: null` =
 * périmètre "Tout" (§10.1).
 */
export interface DashboardScopeState {
  modelId: string | null;
  depotId: string | null;
  site: string;
  period: DashboardPeriod;
}

export const DEFAULT_DASHBOARD_SCOPE: DashboardScopeState = {
  modelId: null,
  depotId: null,
  site: "",
  period: "30d",
};

export const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  "7d": "7 jours",
  "30d": "30 jours",
  "90d": "90 jours",
  current_year: "Année en cours",
};
