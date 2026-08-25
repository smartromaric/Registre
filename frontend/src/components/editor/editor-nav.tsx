"use client";

/**
 * Navigation de l'espace éditeur (`app/(editor)/layout.tsx`) — même découpage
 * responsive que `components/app-nav.tsx` (barre latérale desktop + menu
 * déroulant mobile) mais un jeu de liens totalement différent : pas de
 * modèles, pas de sélecteur d'organisation, seulement les quatre écrans de
 * pilotage de plateforme du cahier des charges §13.
 */

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, LayoutGrid, Menu, Receipt, Tags } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const EDITOR_LINKS: { href: string; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { href: "/editor", label: "Vue d'ensemble", icon: LayoutGrid },
  { href: "/editor/organizations", label: "Organisations", icon: Building2 },
  { href: "/editor/payments", label: "Règlements", icon: Receipt },
  { href: "/editor/catalog", label: "Catalogue", icon: Tags },
];

function isActiveLink(pathname: string | null, href: string): boolean {
  if (href === "/editor") return pathname === "/editor";
  return pathname?.startsWith(href) ?? false;
}

export function EditorSidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border/70 px-3 py-5 lg:flex">
      <p className="mb-1 px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Espace éditeur</p>
      {EDITOR_LINKS.map((link) => (
        <SidebarLink key={link.href} href={link.href} icon={link.icon} label={link.label} active={isActiveLink(pathname, link.href)} />
      ))}
    </aside>
  );
}

function SidebarLink({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
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
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function EditorNavMenu() {
  const pathname = usePathname();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Navigation" className="lg:hidden">
          <Menu className="size-4.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Espace éditeur</DropdownMenuLabel>
        {EDITOR_LINKS.map((link) => (
          <DropdownMenuItem key={link.href} asChild>
            <Link href={link.href} className={cn(isActiveLink(pathname, link.href) && "text-primary")}>
              <link.icon className="size-4" />
              {link.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
