"use client";

/** Périmètre focalisé sur un modèle "Actif suivi" (cahier des charges §10.2,
 * §10.3) : nombre de fiches, répartition par statut, échéances, coût des
 * événements — puis les graphiques (échéances par mois, coût par mois). */

import { BarRows, ChartSection } from "@/components/dashboard/bar-rows";
import type { DrilldownKind } from "@/components/dashboard/drilldown-dialog";
import { StatTile } from "@/components/dashboard/stat-tile";
import type { AssetIndicators } from "@/lib/api/types";
import { formatAmount } from "@/lib/format";

export interface AssetDashboardViewProps {
  data: AssetIndicators;
  modelNamePlural: string;
  currencyCode?: string;
  periodLabel: string;
  onOpenDrilldown: (kind: DrilldownKind) => void;
}

export function AssetDashboardView({
  data,
  modelNamePlural,
  currencyCode,
  periodLabel,
  onOpenDrilldown,
}: AssetDashboardViewProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={modelNamePlural}
          value={new Intl.NumberFormat("fr-FR").format(data.fiche_count)}
          caption={
            data.status_breakdown.length > 0
              ? `${data.status_breakdown.length} statut${data.status_breakdown.length > 1 ? "s" : ""} suivi${data.status_breakdown.length > 1 ? "s" : ""}`
              : undefined
          }
        />
        <StatTile
          label="Échéances en retard"
          value={data.overdue_deadlines_count}
          tone={data.overdue_deadlines_count > 0 ? "overdue" : "ok"}
          caption={data.overdue_deadlines_count > 0 ? "Critique — à traiter" : "Aucune en retard"}
          onClick={() => onOpenDrilldown("overdue")}
        />
        <StatTile
          label="Sous 30 jours"
          value={data.upcoming_deadlines_count}
          tone={data.upcoming_deadlines_count > 0 ? "urgent" : "ok"}
          caption={data.upcoming_deadlines_count > 0 ? "À programmer" : "Rien à venir"}
          onClick={() => onOpenDrilldown("upcoming")}
        />
        {data.event_cost_total != null ? (
          <StatTile label={`Coût des événements · ${periodLabel}`} value={formatAmount(data.event_cost_total, currencyCode)} />
        ) : null}
      </div>

      {data.status_breakdown.length > 0 ? (
        <ChartSection caption="Répartition par statut">
          <BarRows
            data={data.status_breakdown.map((s) => ({ key: s.status, label: s.status, value: s.count }))}
            barClassName="bg-primary"
          />
        </ChartSection>
      ) : null}

      <ChartSection caption="Échéances à venir, par mois">
        <BarRows
          data={data.upcoming_deadlines_by_month.map((m) => ({ key: m.month, label: formatMonth(m.month), value: m.count }))}
          barClassName="bg-warning"
          emptyMessage="Aucune échéance à venir sur cette période."
        />
      </ChartSection>

      {data.event_cost_by_month != null ? (
        <ChartSection caption="Coût des interventions, par mois">
          <BarRows
            data={data.event_cost_by_month.map((m) => ({
              key: m.month,
              label: formatMonth(m.month),
              value: m.amount,
              display: formatAmount(m.amount, currencyCode),
            }))}
            barClassName="bg-primary"
            emptyMessage="Aucun événement chiffré sur cette période."
          />
        </ChartSection>
      ) : null}
    </div>
  );
}

/** "2026-06" -> "Juin 2026". */
function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  const date = new Date(Number(year), Number(m) - 1, 1);
  const label = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}
