import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Graphique à barres horizontales — exactement le motif du cahier des charges
 * §10.2 (libellé, piste, remplissage proportionnel, nombre). Aucune
 * bibliothèque de graphiques : de simples `div` Tailwind, comme la maquette
 * source (cahier-des-charges-registre.html, autour de la ligne 1255 — un
 * `.bar-row` = un `span` libellé, un `.bar-track` avec un `.bar-fill` en
 * largeur `NN%`, un `span` nombre).
 */
export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** Texte affiché à droite — par défaut `value` formaté en fr-FR. Utile pour
   * un montant (`formatAmount`) plutôt qu'un entier brut. */
  display?: string;
}

export function BarRow({
  label,
  value,
  max,
  display,
  barClassName = "bg-primary",
}: {
  label: string;
  value: number;
  max: number;
  display?: string;
  barClassName?: string;
}) {
  const width = value <= 0 ? 0 : Math.max(3, Math.round((value / max) * 100));
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-24 shrink-0 truncate text-muted-foreground sm:w-36" title={label}>
        {label}
      </span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        {width > 0 ? (
          <span className={cn("block h-full rounded-full", barClassName)} style={{ width: `${width}%` }} />
        ) : null}
      </span>
      <span className="w-16 shrink-0 text-right font-medium tabular-nums text-foreground">
        {display ?? new Intl.NumberFormat("fr-FR").format(value)}
      </span>
    </div>
  );
}

export function BarRows({
  data,
  barClassName,
  emptyMessage = "Aucune donnée sur cette période.",
}: {
  data: BarDatum[];
  barClassName?: string;
  emptyMessage?: string;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  return (
    <div className="flex flex-col gap-2">
      {data.map((d) => (
        <BarRow
          key={d.key}
          label={d.label}
          value={d.value}
          max={max}
          display={d.display}
          barClassName={barClassName}
        />
      ))}
    </div>
  );
}

/** Encadré carte pour un graphique du tableau de bord — un titre, du contenu. */
export function ChartSection({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 ring-1 ring-foreground/5">
      <h3 className="text-sm font-medium text-foreground">{caption}</h3>
      {children}
    </div>
  );
}
