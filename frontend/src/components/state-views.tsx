import type { ReactNode } from "react";
import { TriangleAlert, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * États honnêtes réutilisés sur tous les écrans métier (PRODUCT.md §7.2) :
 * jamais un tableau vide silencieux à la place d'une vraie erreur réseau/serveur,
 * jamais un écran vide sans texte ni action. Un seul endroit pour ce vocabulaire
 * visuel, pour rester cohérent d'un écran à l'autre.
 */

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-2.5 rounded-xl border border-destructive/25 bg-destructive/5 px-6 py-12 text-center ${className ?? ""}`}
    >
      <TriangleAlert className="size-6 text-destructive" />
      <p className="text-sm font-medium text-foreground">Impossible de charger les données</p>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
          Réessayer
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center ${className ?? ""}`}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-6" />
      </span>
      <h2 className="font-heading text-lg font-medium text-foreground">{title}</h2>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
