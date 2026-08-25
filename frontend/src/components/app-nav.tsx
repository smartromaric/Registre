"use client";

/**
 * Navigation entre modèles pour la coquille applicative (`app/(app)/layout.tsx`).
 * Deux présentations du même contenu :
 * - `AppSidebar` : barre latérale persistante, écrans larges (`lg:` et plus) —
 *   desktop-first pour les écrans de configuration (cahier des charges §14.5).
 * - `ModelsNavMenu` : menu déroulant équivalent dans l'en-tête, toujours visible,
 *   qui garde la navigation accessible sur mobile sans dupliquer la barre latérale.
 *
 * Les deux ne listent que ce que le backend renvoie réellement — écran vide
 * honnête plutôt qu'une liste de modèles inventés tant que rien n'est activé.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, Home, Layers, Library, Menu, Plus, Warehouse } from "lucide-react";

import { ModelIcon } from "@/components/fiches/model-icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listModelDefinitions } from "@/lib/api/model-definitions";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/utils";

function useOrganizationModels() {
  const { accessToken, currentOrganizationId } = useAuth();
  return useQuery({
    queryKey: ["model-definitions", currentOrganizationId],
    queryFn: () => listModelDefinitions(accessToken as string, currentOrganizationId as string),
    enabled: Boolean(accessToken && currentOrganizationId),
  });
}

export function AppSidebar() {
  const pathname = usePathname();
  const modelsQuery = useOrganizationModels();
  const models = modelsQuery.data ?? [];

  return (
    <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border/70 px-3 py-5 lg:flex">
      <SidebarLink href="/" icon={<Home className="size-4 shrink-0" />} label="Accueil" active={pathname === "/"} />

      <p className="mt-4 mb-1 px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Modèles</p>
      {models.length === 0 ? (
        <p className="px-2 py-1 text-xs text-muted-foreground">Aucun modèle activé.</p>
      ) : (
        models.map((model) => (
          <SidebarLink
            key={model.id}
            href={`/models/${model.id}`}
            icon={<ModelIcon icon={model.icon} color={model.color} size="sm" className="size-5 shrink-0 [&_svg]:size-3" />}
            label={model.name_plural}
            active={pathname?.startsWith(`/models/${model.id}`) ?? false}
          />
        ))
      )}

      <div className="mt-4 space-y-1 border-t border-border/70 pt-3">
        <SidebarLink href="/models" icon={<Layers className="size-4 shrink-0" />} label="Mes modèles" active={pathname === "/models"} />
        <SidebarLink
          href="/models/library"
          icon={<Library className="size-4 shrink-0" />}
          label="Bibliothèque"
          active={pathname === "/models/library"}
        />
        <SidebarLink href="/models/new" icon={<Plus className="size-4 shrink-0" />} label="Nouveau modèle" active={pathname === "/models/new"} />
        <SidebarLink href="/depots" icon={<Warehouse className="size-4 shrink-0" />} label="Dépôts" active={pathname === "/depots"} />
        <SidebarLink href="/abonnement" icon={<CreditCard className="size-4 shrink-0" />} label="Abonnement" active={pathname === "/abonnement"} />
      </div>
    </aside>
  );
}

function SidebarLink({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
        active ? "bg-primary/10 font-medium text-primary" : "text-foreground/80 hover:bg-muted",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function ModelsNavMenu() {
  const modelsQuery = useOrganizationModels();
  const models = modelsQuery.data ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Navigation" className="lg:hidden">
          <Menu className="size-4.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Modèles</DropdownMenuLabel>
        {models.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">Aucun modèle activé.</p>
        ) : (
          models.map((model) => (
            <DropdownMenuItem key={model.id} asChild>
              <Link href={`/models/${model.id}`}>
                <ModelIcon icon={model.icon} color={model.color} size="sm" className="size-5 [&_svg]:size-3" />
                {model.name_plural}
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/models">
            <Layers className="size-4" />
            Mes modèles
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/models/library">
            <Library className="size-4" />
            Bibliothèque
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/models/new">
            <Plus className="size-4" />
            Nouveau modèle
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/depots">
            <Warehouse className="size-4" />
            Dépôts
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/abonnement">
            <CreditCard className="size-4" />
            Abonnement
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
