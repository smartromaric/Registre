"use client";

/**
 * Palette de commandes (Cmd/Ctrl K — PRODUCT.md §7.2) : navigation rapide entre
 * modèles et actions courantes, au clavier. Pas de recherche plein texte dans les
 * fiches elles-mêmes — ça viendra avec la recherche globale du lot 3 backend
 * (cahier des charges §9), pas construite ici pour ne pas simuler un résultat
 * que le backend ne peut pas encore produire.
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Home, Layers, Library, Plus } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { ModelIcon } from "@/components/fiches/model-icon";
import { listModelDefinitions } from "@/lib/api/model-definitions";
import { useAuth } from "@/lib/auth/auth-context";

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Contrôlée depuis `app/(app)/layout.tsx`, qui possède l'état d'ouverture et
 * l'écouteur clavier global Cmd/Ctrl+K — un seul endroit pour ce raccourci,
 * partagé par le bouton visible de l'en-tête et le raccourci clavier. */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const { accessToken, currentOrganizationId } = useAuth();

  const modelsQuery = useQuery({
    queryKey: ["model-definitions", currentOrganizationId],
    queryFn: () => listModelDefinitions(accessToken as string, currentOrganizationId as string),
    enabled: Boolean(accessToken && currentOrganizationId) && open,
  });

  const go = useCallback(
    (path: string) => {
      onOpenChange(false);
      router.push(path);
    },
    [router, onOpenChange],
  );

  const models = modelsQuery.data ?? [];

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Palette de commandes" description="Navigation rapide">
      <CommandInput placeholder="Aller à un modèle, créer une fiche…" />
      <CommandList>
        <CommandEmpty>Aucun résultat.</CommandEmpty>

        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => go("/")}>
            <Home className="size-4" />
            Accueil
          </CommandItem>
          <CommandItem onSelect={() => go("/models")}>
            <Layers className="size-4" />
            Mes modèles
          </CommandItem>
          <CommandItem onSelect={() => go("/models/library")}>
            <Library className="size-4" />
            Bibliothèque de modèles
          </CommandItem>
          <CommandItem onSelect={() => go("/models/new")}>
            <Plus className="size-4" />
            Créer un modèle
          </CommandItem>
        </CommandGroup>

        {models.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Modèles">
              {models.map((model) => (
                <CommandItem key={model.id} onSelect={() => go(`/models/${model.id}`)}>
                  <ModelIcon icon={model.icon} color={model.color} size="sm" className="size-5 [&_svg]:size-3" />
                  {model.name_plural}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Nouvelle fiche">
              {models.map((model) => (
                <CommandItem key={model.id} onSelect={() => go(`/models/${model.id}/records/new`)}>
                  <Plus className="size-4" />
                  {model.name_singular}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
