"use client";

/**
 * Graphique à barres horizontales du tableau de bord (cahier des charges
 * §10.2) — un vrai graphique Chart.js, là où la première version empilait des
 * `div` Tailwind à largeur `NN%`.
 *
 * Ce qui est conservé de cette première version, parce que c'est de
 * l'information et pas de la décoration : le libellé à gauche, la valeur
 * exacte à droite de chaque barre (`BarDatum.display` pour un montant), et le
 * message honnête quand il n'y a rien à tracer. L'étiquette de valeur reste
 * dessinée sur chaque barre plutôt que reléguée à l'infobulle — un chiffre
 * qu'il faut survoler pour lire est un chiffre perdu au clavier et à
 * l'impression.
 *
 * Aucune barre n'est cliquable : voir `PRODUCT.md` §10.9 — un indicateur sans
 * route de liste qui corresponde *exactement* à ce qu'il affiche reste
 * volontairement inerte, plutôt que d'ouvrir une liste voisine mais fausse.
 */

import { useMemo, type ReactNode } from "react";
import type { ChartData, ChartOptions, ChartType, Plugin } from "chart.js";

import {
  ChartCanvas,
  ChartCanvasPlaceholder,
  ChartCaptionProvider,
  type ChartSrTable,
} from "@/components/dashboard/chart-canvas";
import { tooltipStyle, useChartTheme, type ChartTheme, type ChartTone } from "@/lib/chart-theme";

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** Texte affiché à droite de la barre — par défaut `value` formaté en fr-FR.
   * Utile pour un montant (`useCurrencyFormat`, voir `lib/use-currency-format.ts`)
   * plutôt qu'un entier brut. */
  display?: string;
}

interface ValueLabelsOptions {
  texts: string[];
  color: string;
  font: string;
}

declare module "chart.js" {
  // La liste de paramètres de type doit être répétée à l'identique pour que la
  // fusion de déclarations opère — TypeScript refuse la fusion sinon, même si
  // `TType` n'a aucun rôle dans ce que l'on ajoute.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface PluginOptionsByType<TType extends ChartType> {
    valueLabels?: ValueLabelsOptions;
  }
}

const VALUE_LABEL_SIZE = 12;
const VALUE_LABEL_GAP = 8;
const TICK_SIZE = 12;
const MAX_TICK_CHARS = 22;
const ROW_HEIGHT = 30;

/**
 * Étiquette de valeur au bout de chaque barre. Les textes viennent des options
 * (et non d'une fermeture) pour qu'un changement de période les rafraîchisse :
 * react-chartjs-2 ne réapplique les `plugins` qu'à la construction du
 * graphique, alors qu'il réassigne les options à chaque mise à jour.
 */
const valueLabelsPlugin: Plugin<"bar", ValueLabelsOptions> = {
  id: "valueLabels",
  afterDatasetsDraw(chart, _args, options) {
    if (!options?.texts) return;
    const { ctx } = chart;
    ctx.save();
    ctx.font = options.font;
    ctx.fillStyle = options.color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (const [index, element] of chart.getDatasetMeta(0).data.entries()) {
      const text = options.texts[index];
      if (text === undefined) continue;
      ctx.fillText(text, element.x + VALUE_LABEL_GAP, element.y);
    }
    ctx.restore();
  },
};

const numberFormat = new Intl.NumberFormat("fr-FR");

function displayOf(datum: BarDatum): string {
  return datum.display ?? numberFormat.format(datum.value);
}

export function BarRows({
  data,
  tone = "primary",
  emptyMessage = "Aucune donnée sur cette période.",
}: {
  data: BarDatum[];
  /** Tonalité des barres — un jeton de thème, jamais une classe de couleur. */
  tone?: ChartTone;
  emptyMessage?: string;
}) {
  const theme = useChartTheme();

  const table = useMemo<ChartSrTable>(
    () => ({
      columns: ["Libellé", "Valeur"],
      rows: data.map((datum) => ({ key: datum.key, cells: [datum.label, displayOf(datum)] })),
    }),
    [data],
  );

  // `data` vide n'atteint jamais le canevas (message honnête plus bas), mais le
  // mémo tourne avant ce retour : sans ce garde, la mesure de gouttière ferait
  // un `Math.max()` sans argument.
  const chart = useMemo(
    () => (theme && data.length > 0 ? buildChart(data, tone, theme) : null),
    [data, tone, theme],
  );

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  const height = Math.max(96, data.length * ROW_HEIGHT + 16);

  if (!theme || !chart) {
    return <ChartCanvasPlaceholder label="Graphique à barres" height={height} table={table} />;
  }

  return (
    <ChartCanvas
      label="Graphique à barres"
      height={height}
      data={chart.data}
      options={chart.options}
      plugins={[valueLabelsPlugin as Plugin<"bar">]}
      table={table}
      paletteKey={theme.paletteKey}
    />
  );
}

function buildChart(data: BarDatum[], tone: ChartTone, theme: ChartTheme) {
  const texts = data.map(displayOf);
  const valueFont = `600 ${VALUE_LABEL_SIZE}px ${theme.fontFamily}`;
  // Marge réservée à droite : l'étiquette de valeur est mesurée pour de vrai,
  // sinon la plus longue (un montant) sortirait du canevas et serait rognée.
  const gutter = Math.ceil(Math.max(...texts.map((text) => theme.measureText(text, valueFont)))) + VALUE_LABEL_GAP + 4;

  const chartData: ChartData<"bar"> = {
    labels: data.map((datum) => datum.label),
    datasets: [
      {
        data: data.map((datum) => datum.value),
        backgroundColor: theme.color(tone),
        hoverBackgroundColor: theme.fade(tone, 0.78),
        borderRadius: 4,
        maxBarThickness: 18,
      },
    ],
  };

  const options: ChartOptions<"bar"> = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    animation: theme.animated ? { duration: 420, easing: "easeOutQuart" } : false,
    layout: { padding: { right: gutter, top: 2, bottom: 2 } },
    scales: {
      // Aucun axe des valeurs : chaque barre porte déjà son chiffre exact — une
      // graduation en plus ne dirait rien de neuf et alourdirait la carte.
      x: { display: false, beginAtZero: true },
      y: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: theme.tick,
          font: { family: theme.fontFamily, size: TICK_SIZE },
          autoSkip: false,
          callback: (_value, index) => truncate(data[index]?.label ?? ""),
        },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipStyle(theme),
        displayColors: false,
        callbacks: {
          // Le libellé complet, même quand la graduation a dû être tronquée.
          title: (items) => data[items[0]?.dataIndex ?? 0]?.label ?? "",
          label: (item) => texts[item.dataIndex] ?? "",
        },
      },
      valueLabels: { texts, color: theme.value, font: valueFont },
    },
  };

  return { data: chartData, options };
}

function truncate(label: string): string {
  return label.length > MAX_TICK_CHARS ? `${label.slice(0, MAX_TICK_CHARS - 1)}…` : label;
}

/** Encadré carte pour un graphique du tableau de bord — un titre, du contenu. */
export function ChartSection({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 ring-1 ring-foreground/5">
      <h3 className="text-sm font-medium text-foreground">{caption}</h3>
      <ChartCaptionProvider caption={caption}>{children}</ChartCaptionProvider>
    </div>
  );
}
