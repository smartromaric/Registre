"use client";

/**
 * Coque commune des graphiques du tableau de bord : le canevas Chart.js, sa
 * hauteur réservée, et surtout son jumeau accessible.
 *
 * Un canevas est un rectangle de pixels — un lecteur d'écran n'y voit rien. Le
 * `<table class="sr-only">` rendu ici n'est donc pas une politesse : c'est le
 * seul chemin de lecture des valeurs sans la vue, et il porte exactement les
 * mêmes chiffres que les barres (jamais un résumé approximatif). Le canevas
 * lui-même est masqué aux technologies d'assistance pour ne pas annoncer deux
 * fois la même chose.
 *
 * Chart.js a besoin de `window` : le composant de rendu est chargé
 * dynamiquement, sans rendu serveur, et l'enregistrement des contrôleurs se
 * fait dans le même import — chart.js ne part donc jamais dans le paquet
 * serveur.
 */

import { createContext, useContext, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { ChartData, ChartOptions, Plugin } from "chart.js";

const LazyBarChart = dynamic(
  async () => {
    const [{ Bar }, chartjs] = await Promise.all([import("react-chartjs-2"), import("chart.js")]);
    chartjs.Chart.register(
      chartjs.BarController,
      chartjs.BarElement,
      chartjs.CategoryScale,
      chartjs.LinearScale,
      chartjs.Tooltip,
    );
    return Bar;
  },
  { ssr: false },
);

/** Titre de la `ChartSection` englobante — évite de redonner à la main au
 * graphique un libellé déjà écrit juste au-dessus de lui. */
const ChartCaptionContext = createContext<string | null>(null);

export function ChartCaptionProvider({ caption, children }: { caption: string; children: ReactNode }) {
  return <ChartCaptionContext.Provider value={caption}>{children}</ChartCaptionContext.Provider>;
}

export interface ChartSrTable {
  columns: string[];
  rows: { key: string; cells: string[] }[];
}

export interface ChartCanvasProps {
  /** Libellé de repli, si le graphique n'est pas rendu dans une `ChartSection`. */
  label: string;
  /** Hauteur du canevas en pixels, graduations comprises — une hauteur qui
   * exclurait la bande d'axe ferait apparaître une barre de défilement interne
   * à la carte. */
  height: number;
  data: ChartData<"bar">;
  options: ChartOptions<"bar">;
  plugins?: Plugin<"bar">[];
  table: ChartSrTable;
  /** `ChartTheme.paletteKey` — remonte le canevas quand le thème bascule. */
  paletteKey: string;
}

export function ChartCanvas({ label, height, data, options, plugins, table, paletteKey }: ChartCanvasProps) {
  const caption = useContext(ChartCaptionContext) ?? label;
  return (
    <div className="flex w-full min-w-0 flex-col">
      <div aria-hidden className="relative w-full" style={{ height }}>
        <LazyBarChart key={paletteKey} data={data} options={options} plugins={plugins} />
      </div>
      <ChartSrTable caption={caption} table={table} />
    </div>
  );
}

/** Même hauteur réservée que le canevas, pour que l'arrivée du graphique ne
 * décale pas la page — et le tableau, déjà lisible, dès ce premier rendu. */
export function ChartCanvasPlaceholder({
  label,
  height,
  table,
}: {
  label: string;
  height: number;
  table: ChartSrTable;
}) {
  const caption = useContext(ChartCaptionContext) ?? label;
  return (
    <div className="flex w-full min-w-0 flex-col">
      <div aria-hidden style={{ height }} />
      <ChartSrTable caption={caption} table={table} />
    </div>
  );
}

function ChartSrTable({ caption, table }: { caption: string; table: ChartSrTable }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {table.columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row) => (
          <tr key={row.key}>
            {row.cells.map((cell, index) =>
              index === 0 ? (
                <th key={index} scope="row">
                  {cell}
                </th>
              ) : (
                <td key={index}>{cell}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
