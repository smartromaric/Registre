import { createElement } from "react";

import { getModelIcon } from "@/lib/model-icons";
import { cn } from "@/lib/utils";

export interface ModelIconProps {
  icon: string | null;
  color: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<ModelIconProps["size"]>, string> = {
  sm: "size-7 [&_svg]:size-3.5",
  md: "size-9 [&_svg]:size-4.5",
  lg: "size-12 [&_svg]:size-6",
};

/** Pastille icône+couleur d'un modèle de fiche — un seul endroit qui sait
 * comment afficher `ModelDefinitionOut.icon`/`color`, réutilisé par les cartes
 * de bibliothèque, "Mes modèles", la barre latérale et l'en-tête de fiche. */
export function ModelIcon({ icon, color, size = "md", className }: ModelIconProps) {
  // Résolu dynamiquement depuis un registre statique (`MODEL_ICONS`), pas défini
  // ici — `createElement` avec une variable en minuscule évite un faux positif du
  // compilateur React (`react-hooks/static-components`), qui traite toute variable
  // en PascalCase rendue en JSX comme un composant potentiellement recréé à
  // chaque rendu.
  const iconComponent = getModelIcon(icon);
  const tint = color ?? "var(--color-primary)";
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center rounded-xl", SIZE_CLASSES[size], className)}
      style={{ backgroundColor: `color-mix(in oklch, ${tint}, transparent 84%)`, color: tint }}
    >
      {createElement(iconComponent)}
    </span>
  );
}
