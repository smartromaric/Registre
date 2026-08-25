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

import { useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  CreditCard,
  GitMerge,
  Home,
  Layers,
  Library,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Users,
  Warehouse,
} from "lucide-react";

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

const SIDEBAR_COLLAPSED_KEY = "registre.sidebarCollapsed";
const EXPANDED_WIDTH = 240;
const COLLAPSED_WIDTH = 60;

// `useSyncExternalStore`, pas `useState` + `useEffect` : la seconde forme
// déclenche un `setState` synchrone dans le corps d'un effet, ce que
// `eslint-plugin-react-hooks` signale comme une erreur — même piège et même
// remède que `lib/use-hydrated.ts`. Rendu serveur = dépliée (`false`), premier
// rendu client = la vraie valeur stockée, sans mésappariement d'hydratation.
const sidebarListeners = new Set<() => void>();

function subscribeSidebar(callback: () => void) {
  sidebarListeners.add(callback);
  return () => sidebarListeners.delete(callback);
}

function getSidebarSnapshot(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function getSidebarServerSnapshot(): boolean {
  return false;
}

function setSidebarCollapsed(value: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, value ? "1" : "0");
  } catch {
    // Stockage indisponible : confort perdu, pas une donnée qui doit survivre.
  }
  sidebarListeners.forEach((callback) => callback());
}

/** Repliée/dépliée est un pur confort d'écran, jamais réinitialisé par une
 * navigation — persistée en local. */
function useSidebarCollapsed() {
  const collapsed = useSyncExternalStore(subscribeSidebar, getSidebarSnapshot, getSidebarServerSnapshot);
  return { collapsed, toggle: () => setSidebarCollapsed(!collapsed) };
}

export function AppSidebar() {
  const pathname = usePathname();
  const modelsQuery = useOrganizationModels();
  const models = modelsQuery.data ?? [];
  const { currentOrganization } = useAuth();
  const isAdmin = currentOrganization?.my_role === "admin";
  const { collapsed, toggle } = useSidebarCollapsed();

  return (
    <motion.aside
      animate={{ width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 flex-col gap-1 overflow-x-hidden overflow-y-auto border-r border-border/70 px-3 py-5 lg:flex"
    >
      <SidebarLink href="/" icon={<Home className="size-4 shrink-0" />} label="Accueil" active={pathname === "/"} collapsed={collapsed} />

      {collapsed ? (
        <div className="mt-4 mb-1 h-px bg-border/70" />
      ) : (
        <p className="mt-4 mb-1 px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Modèles</p>
      )}
      {models.length === 0 ? (
        collapsed ? null : <p className="px-2 py-1 text-xs text-muted-foreground">Aucun modèle activé.</p>
      ) : (
        models.map((model) => (
          <SidebarLink
            key={model.id}
            href={`/models/${model.id}`}
            icon={<ModelIcon icon={model.icon} color={model.color} size="sm" className="size-5 shrink-0 [&_svg]:size-3" />}
            label={model.name_plural}
            active={pathname?.startsWith(`/models/${model.id}`) ?? false}
            collapsed={collapsed}
          />
        ))
      )}

      <div className="mt-4 space-y-1 border-t border-border/70 pt-3">
        <SidebarLink href="/models" icon={<Layers className="size-4 shrink-0" />} label="Mes modèles" active={pathname === "/models"} collapsed={collapsed} />
        <SidebarLink
          href="/models/library"
          icon={<Library className="size-4 shrink-0" />}
          label="Bibliothèque"
          active={pathname === "/models/library"}
          collapsed={collapsed}
        />
        {isAdmin ? (
          <SidebarLink href="/models/new" icon={<Plus className="size-4 shrink-0" />} label="Nouveau modèle" active={pathname === "/models/new"} collapsed={collapsed} />
        ) : null}
        <SidebarLink href="/depots" icon={<Warehouse className="size-4 shrink-0" />} label="Dépôts" active={pathname === "/depots"} collapsed={collapsed} />
        {isAdmin ? (
          <SidebarLink
            href="/organisation/membres"
            icon={<Users className="size-4 shrink-0" />}
            label="Membres"
            active={pathname === "/organisation/membres"}
            collapsed={collapsed}
          />
        ) : null}
        {isAdmin ? (
          <SidebarLink
            href="/organisation/conflits"
            icon={<GitMerge className="size-4 shrink-0" />}
            label="Conflits de synchronisation"
            active={pathname === "/organisation/conflits"}
            collapsed={collapsed}
          />
        ) : null}
        <SidebarLink href="/abonnement" icon={<CreditCard className="size-4 shrink-0" />} label="Abonnement" active={pathname === "/abonnement"} collapsed={collapsed} />
      </div>

      <div className="mt-auto border-t border-border/70 pt-3">
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? "Déplier la navigation" : "Réduire la navigation"}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? <PanelLeftOpen className="size-4 shrink-0" /> : <PanelLeftClose className="size-4 shrink-0" />}
          {collapsed ? null : <span className="truncate">Réduire</span>}
        </button>
      </div>
    </motion.aside>
  );
}

function SidebarLink({
  href,
  icon,
  label,
  active,
  collapsed,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
        collapsed && "justify-center px-0",
        active ? "bg-primary/10 font-medium text-primary" : "text-foreground/80 hover:bg-muted",
      )}
    >
      {icon}
      {collapsed ? null : <span className="truncate">{label}</span>}
    </Link>
  );
}

export function ModelsNavMenu() {
  const modelsQuery = useOrganizationModels();
  const models = modelsQuery.data ?? [];
  const { currentOrganization } = useAuth();
  const isAdmin = currentOrganization?.my_role === "admin";

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
        {isAdmin ? (
          <DropdownMenuItem asChild>
            <Link href="/models/new">
              <Plus className="size-4" />
              Nouveau modèle
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href="/depots">
            <Warehouse className="size-4" />
            Dépôts
          </Link>
        </DropdownMenuItem>
        {isAdmin ? (
          <DropdownMenuItem asChild>
            <Link href="/organisation/membres">
              <Users className="size-4" />
              Membres
            </Link>
          </DropdownMenuItem>
        ) : null}
        {isAdmin ? (
          <DropdownMenuItem asChild>
            <Link href="/organisation/conflits">
              <GitMerge className="size-4" />
              Conflits de synchronisation
            </Link>
          </DropdownMenuItem>
        ) : null}
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
