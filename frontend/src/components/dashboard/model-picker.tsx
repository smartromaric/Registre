"use client";

import type { ReactNode } from "react";

import { ModelIcon } from "@/components/fiches/model-icon";
import type { ModelDefinitionOut } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/**
 * Bandeau de sélection du modèle focalisé (cahier des charges §10.2) : "Tout"
 * puis un onglet par modèle actif — exactement la maquette du cahier des
 * charges (dash-head / .pick). Change `model_id`, qui recalcule entièrement
 * ce qui est affiché en dessous (§10.2 : "ce n'est pas un simple filtre de
 * liste, les indicateurs eux-mêmes changent").
 */
export function ModelPicker({
  models,
  selectedModelId,
  onSelect,
}: {
  models: ModelDefinitionOut[];
  selectedModelId: string | null;
  onSelect: (modelId: string | null) => void;
}) {
  return (
    <div role="tablist" aria-label="Modèle du tableau de bord" className="flex flex-wrap gap-2">
      <Pill active={selectedModelId === null} onClick={() => onSelect(null)}>
        Tout
      </Pill>
      {models.map((model) => (
        <Pill key={model.id} active={selectedModelId === model.id} onClick={() => onSelect(model.id)}>
          <ModelIcon icon={model.icon} color={model.color} size="sm" className="size-4 [&_svg]:size-3" />
          {model.name_plural}
        </Pill>
      ))}
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
