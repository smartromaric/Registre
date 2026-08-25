import { BarRow } from "@/components/dashboard/bar-rows";
import type { DayMovements } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

/**
 * Mouvements de stock par jour (§10.3, ligne "Article de stock") — deux
 * barres adjacentes par jour (entrées/sorties) plutôt qu'un double axe : même
 * échelle pour les deux séries, un point de comparaison honnête. Réutilise le
 * vocabulaire de tonalité de `stock-format.ts:MOVEMENT_TYPE_TONE_CLASSES`
 * (succès pour une entrée, neutre pour une sortie — une sortie n'est pas une
 * anomalie).
 */
const MAX_DAYS_SHOWN = 14;

export function MovementsChart({ data }: { data: DayMovements[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun mouvement sur cette période.</p>;
  }

  const shown = data.slice(-MAX_DAYS_SHOWN);
  const max = Math.max(1, ...shown.flatMap((d) => [d.entries_quantity, d.exits_quantity]));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-success" aria-hidden />
          Entrées
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-muted-foreground" aria-hidden />
          Sorties
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {shown.map((day) => (
          <div key={day.day} className="rounded-lg border border-border/60 p-2.5">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">{formatDate(day.day)}</p>
            <div className="flex flex-col gap-1">
              <BarRow label="Entrées" value={day.entries_quantity} max={max} barClassName="bg-success" />
              <BarRow label="Sorties" value={day.exits_quantity} max={max} barClassName="bg-muted-foreground" />
            </div>
          </div>
        ))}
      </div>
      {data.length > shown.length ? (
        <p className="text-xs text-muted-foreground">
          {shown.length} derniers jours affichés sur {data.length}.
        </p>
      ) : null}
    </div>
  );
}
