"use client";

/** Périmètre "Tout" (cahier des charges §10.1) : les quatre indicateurs
 * d'attention dans l'ordre imposé par le cahier des charges, puis seulement
 * ensuite les compteurs de synthèse. */

import { StatTile } from "@/components/dashboard/stat-tile";
import type { DrilldownKind } from "@/components/dashboard/drilldown-dialog";
import type { AttentionCounters, SummaryCounters } from "@/lib/api/types";
import { formatAmount } from "@/lib/format";

export interface GlobalDashboardViewProps {
  attention: AttentionCounters;
  summary: SummaryCounters;
  currencyCode?: string;
  onOpenDrilldown: (kind: DrilldownKind) => void;
}

export function GlobalDashboardView({ attention, summary, currencyCode, onOpenDrilldown }: GlobalDashboardViewProps) {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Ce qui demande votre attention</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Échéances en retard"
            value={attention.overdue_deadlines_count}
            tone={attention.overdue_deadlines_count > 0 ? "overdue" : "ok"}
            caption={attention.overdue_deadlines_count > 0 ? "Critique — à traiter" : "Aucune en retard"}
            onClick={() => onOpenDrilldown("overdue")}
          />
          <StatTile
            label="Échéances sous 30 jours"
            value={attention.upcoming_deadlines_count}
            tone={attention.upcoming_deadlines_count > 0 ? "urgent" : "ok"}
            caption={attention.upcoming_deadlines_count > 0 ? "À programmer" : "Rien à venir"}
            onClick={() => onOpenDrilldown("upcoming")}
          />
          <StatTile
            label="Articles sous seuil"
            value={attention.understock_articles_count}
            tone={attention.understock_articles_count > 0 ? "overdue" : "ok"}
            caption={attention.understock_articles_count > 0 ? "Critique — à réapprovisionner" : "Au-dessus des seuils"}
            onClick={() => onOpenDrilldown("understock")}
          />
          <StatTile
            label="Lots proches de la péremption"
            value={attention.expiring_lots_count}
            tone={attention.expiring_lots_count > 0 ? "urgent" : "ok"}
            caption={attention.expiring_lots_count > 0 ? "À surveiller" : "Aucun lot proche"}
            onClick={() => onOpenDrilldown("expiring")}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Synthèse</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Fiches enregistrées"
            value={new Intl.NumberFormat("fr-FR").format(summary.total_records)}
            caption="Tous modèles confondus"
          />
          {summary.total_stock_value != null ? (
            <StatTile
              label="Valeur du stock"
              value={formatAmount(summary.total_stock_value, currencyCode)}
              caption="Tous articles confondus"
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}
