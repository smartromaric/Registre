"use client";

/**
 * Mouvements de stock par jour (§10.3, ligne « Article de stock ») — deux
 * barres adjacentes par jour (entrées/sorties) sur **un seul axe** : même
 * échelle pour les deux séries, un point de comparaison honnête. Un double axe
 * inventerait une corrélation que les données ne portent pas.
 *
 * Des barres et non une courbe, malgré l'axe temporel : le service ne renvoie
 * que les jours *ayant eu* un mouvement (`GROUP BY day` côté backend), donc la
 * série est trouée. Une courbe relierait deux jours distants par un segment et
 * ferait lire une activité continue qui n'a pas eu lieu.
 *
 * Reprend le vocabulaire de tonalité de `stock-format.ts:MOVEMENT_TYPE_TONE_CLASSES`
 * (succès pour une entrée, neutre pour une sortie — une sortie n'est pas une
 * anomalie). La légende reste en HTML plutôt que dessinée par Chart.js : un mot
 * lisible par un lecteur d'écran, jamais une pastille de couleur seule.
 */

import { useMemo } from "react";
import type { ChartData, ChartOptions } from "chart.js";

import {
  ChartCanvas,
  ChartCanvasPlaceholder,
  type ChartSrTable,
} from "@/components/dashboard/chart-canvas";
import type { DayMovements } from "@/lib/api/types";
import { tooltipStyle, useChartTheme, type ChartTheme } from "@/lib/chart-theme";
import { formatDate } from "@/lib/format";

const MAX_DAYS_SHOWN = 30;
const CHART_HEIGHT = 260;

const shortDayFormat = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" });

export function MovementsChart({ data }: { data: DayMovements[] }) {
  const theme = useChartTheme();
  const shown = useMemo(() => data.slice(-MAX_DAYS_SHOWN), [data]);

  const table = useMemo<ChartSrTable>(
    () => ({
      columns: ["Jour", "Entrées", "Sorties"],
      rows: shown.map((day) => ({
        key: day.day,
        cells: [formatDate(day.day), String(day.entries_quantity), String(day.exits_quantity)],
      })),
    }),
    [shown],
  );

  const chart = useMemo(() => (theme ? buildChart(shown, theme) : null), [shown, theme]);

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucun mouvement sur cette période.</p>;
  }

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
      {theme && chart ? (
        <ChartCanvas
          label="Mouvements de stock par jour"
          height={CHART_HEIGHT}
          data={chart.data}
          options={chart.options}
          table={table}
          paletteKey={theme.paletteKey}
        />
      ) : (
        <ChartCanvasPlaceholder label="Mouvements de stock par jour" height={CHART_HEIGHT} table={table} />
      )}
      {data.length > shown.length ? (
        <p className="text-xs text-muted-foreground">
          {shown.length} derniers jours affichés sur {data.length}.
        </p>
      ) : null}
    </div>
  );
}

function buildChart(shown: DayMovements[], theme: ChartTheme) {
  const chartData: ChartData<"bar"> = {
    labels: shown.map((day) => shortDayFormat.format(new Date(day.day))),
    datasets: [
      {
        label: "Entrées",
        data: shown.map((day) => day.entries_quantity),
        backgroundColor: theme.color("success"),
        hoverBackgroundColor: theme.fade("success", 0.78),
        borderRadius: 4,
        maxBarThickness: 18,
      },
      {
        label: "Sorties",
        data: shown.map((day) => day.exits_quantity),
        backgroundColor: theme.color("neutral"),
        hoverBackgroundColor: theme.fade("neutral", 0.78),
        borderRadius: 4,
        maxBarThickness: 18,
      },
    ],
  };

  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: theme.animated ? { duration: 420, easing: "easeOutQuart" } : false,
    // Survoler un jour donne les deux séries d'un coup : c'est la comparaison
    // entrées/sorties qui intéresse, pas une barre isolée.
    interaction: { mode: "index", intersect: false },
    layout: { padding: { top: 4 } },
    // Groupe resserré : sur une période à peu de jours, la largeur par défaut
    // éloignerait tellement l'entrée de la sortie du même jour qu'on ne les
    // lirait plus comme une paire.
    datasets: { bar: { categoryPercentage: 0.6, barPercentage: 0.9 } },
    scales: {
      x: {
        grid: { display: false },
        border: { color: theme.grid },
        ticks: {
          color: theme.tick,
          font: { family: theme.fontFamily, size: 11 },
          maxRotation: 0,
          autoSkipPadding: 12,
        },
      },
      y: {
        beginAtZero: true,
        grid: { color: theme.grid },
        border: { display: false },
        ticks: {
          color: theme.tick,
          font: { family: theme.fontFamily, size: 11 },
          precision: 0,
        },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipStyle(theme),
        callbacks: {
          title: (items) => (items[0] ? formatDate(shown[items[0].dataIndex].day) : ""),
          label: (item) => `${item.dataset.label} : ${item.formattedValue}`,
        },
      },
    },
  };

  return { data: chartData, options };
}
