"use client";

import { createElement } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getModelIcon, MODEL_ICON_PICKER_KEYS } from "@/lib/model-icons";
import { cn } from "@/lib/utils";

/** Sélecteur d'icône pour un modèle de fiche — petite grille d'icônes
 * lucide-react (mêmes clés que `backend/app/seeds/templates.py:icon`). */
export function IconPicker({
  value,
  onChange,
  color,
}: {
  value: string | null;
  onChange: (icon: string) => void;
  color: string | null;
}) {
  // Résolues dynamiquement (registre statique `MODEL_ICONS`) — `createElement`
  // avec une variable en minuscule plutôt que JSX avec une variable en PascalCase,
  // pour éviter le faux positif `react-hooks/static-components` du compilateur
  // React (qui traite toute variable capitalisée rendue en JSX comme un composant
  // potentiellement recréé à chaque rendu, alors qu'il s'agit d'un simple lookup).
  const selectedIcon = getModelIcon(value);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="gap-2">
          <span
            className="flex size-5 items-center justify-center rounded-md"
            style={{ color: color ?? undefined }}
          >
            {createElement(selectedIcon, { className: "size-4" })}
          </span>
          Icône
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <div className="grid grid-cols-7 gap-1">
          {MODEL_ICON_PICKER_KEYS.map((key) => {
            const icon = getModelIcon(key);
            const selected = key === value;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onChange(key)}
                aria-label={key}
                aria-pressed={selected}
                className={cn(
                  "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  selected && "bg-primary/10 text-primary",
                )}
              >
                {createElement(icon, { className: "size-4" })}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const COLOR_SWATCHES = [
  "#0E6E63",
  "#1D4ED8",
  "#7C3AED",
  "#B3261E",
  "#EA580C",
  "#B26B00",
  "#059669",
  "#0EA5E9",
  "#DB2777",
  "#4B5563",
];

/** Sélecteur de couleur — palette curatée + case couleur libre. */
export function ColorSwatchPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {COLOR_SWATCHES.map((swatch) => (
        <button
          key={swatch}
          type="button"
          aria-label={swatch}
          aria-pressed={value === swatch}
          onClick={() => onChange(swatch)}
          className="flex size-7 items-center justify-center rounded-full ring-1 ring-black/10"
          style={{ backgroundColor: swatch }}
        >
          {value === swatch ? <Check className="size-3.5 text-white" /> : null}
        </button>
      ))}
      <label className="relative flex size-7 items-center justify-center overflow-hidden rounded-full ring-1 ring-dashed ring-border">
        <input
          type="color"
          value={value ?? "#0E6E63"}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Couleur personnalisée"
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
        <span
          className="pointer-events-none size-full rounded-full"
          style={{ backgroundColor: value ?? undefined, backgroundImage: value ? undefined : "conic-gradient(red,yellow,lime,cyan,blue,magenta,red)" }}
        />
      </label>
    </div>
  );
}
