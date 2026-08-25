"use client";

/** Périmètre focalisé sur un modèle "Article de stock" (cahier des charges
 * §10.2, §10.3) : quantité disponible, articles sous seuil, valeur du stock,
 * entrées/sorties, lots proches de la péremption — puis les graphiques (stock
 * par variante, par dépôt, mouvements par jour). */

import { BarRows, ChartSection } from "@/components/dashboard/bar-rows";
import type { DrilldownKind } from "@/components/dashboard/drilldown-dialog";
import { MovementsChart } from "@/components/dashboard/movements-chart";
import { StatTile } from "@/components/dashboard/stat-tile";
import type { StockIndicators } from "@/lib/api/types";
import { formatAmount } from "@/lib/format";

export interface StockDashboardViewProps {
  data: StockIndicators;
  currencyCode?: string;
  periodLabel: string;
  onOpenDrilldown: (kind: DrilldownKind) => void;
}

const MAX_BAR_ROWS = 12;

export function StockDashboardView({ data, currencyCode, periodLabel, onOpenDrilldown }: StockDashboardViewProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Quantité totale disponible"
          value={new Intl.NumberFormat("fr-FR").format(data.total_quantity)}
        />
        <StatTile
          label="Articles sous seuil"
          value={data.understock_articles_count}
          tone={data.understock_articles_count > 0 ? "overdue" : "ok"}
          caption={data.understock_articles_count > 0 ? "Critique — à réapprovisionner" : "Au-dessus des seuils"}
          onClick={() => onOpenDrilldown("understock")}
        />
        <StatTile
          label="Lots proches de la péremption"
          value={data.expiring_lots_count}
          tone={data.expiring_lots_count > 0 ? "urgent" : "ok"}
          caption={data.expiring_lots_count > 0 ? "À surveiller" : "Aucun lot proche"}
          onClick={() => onOpenDrilldown("expiring")}
        />
        {data.stock_value != null ? (
          <StatTile label="Valeur du stock" value={formatAmount(data.stock_value, currencyCode)} />
        ) : null}
        <StatTile
          label={`Entrées · ${periodLabel}`}
          value={new Intl.NumberFormat("fr-FR").format(data.entries_quantity_period)}
        />
        <StatTile
          label={`Sorties · ${periodLabel}`}
          value={new Intl.NumberFormat("fr-FR").format(data.exits_quantity_period)}
        />
      </div>

      <ChartSection caption="Stock disponible par variante">
        <BarRows
          data={topRows(data.stock_by_variant.map((v) => ({ key: v.variant_id, label: v.label, value: v.quantity })))}
          barClassName="bg-primary"
          emptyMessage="Aucune variante suivie."
        />
      </ChartSection>

      <ChartSection caption="Stock disponible par dépôt">
        <BarRows
          data={topRows(data.stock_by_depot.map((d) => ({ key: d.depot_id, label: d.depot_name, value: d.quantity })))}
          barClassName="bg-primary"
          emptyMessage="Aucun dépôt rattaché."
        />
      </ChartSection>

      <ChartSection caption="Mouvements par jour">
        <MovementsChart data={data.movements_by_day} />
      </ChartSection>
    </div>
  );
}

function topRows<T extends { value: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.value - a.value).slice(0, MAX_BAR_ROWS);
}
