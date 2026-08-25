"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, ChevronsUpDown, LogOut, Search, ShieldCheck } from "lucide-react";

import { AppSidebar, ModelsNavMenu } from "@/components/app-nav";
import { Logo } from "@/components/brand/logo";
import { SplashScreen } from "@/components/brand/splash-screen";
import { CommandPalette } from "@/components/command-palette";
import { OfflineStatusIndicator } from "@/components/offline/offline-status-indicator";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth/auth-context";
import { useRequireOrganization } from "@/lib/auth/route-guards";
import { ROLE_LABELS } from "@/lib/roles";

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function AppLayout({ children }: { children: ReactNode }) {
  useRequireOrganization();
  const {
    status,
    user,
    organizations,
    organizationsLoading,
    currentOrganization,
    setCurrentOrganizationId,
    logout,
  } = useAuth();

  // Palette de commandes (Cmd/Ctrl K — PRODUCT.md §7.2) : un seul endroit qui
  // possède l'état d'ouverture, partagé par le raccourci clavier global et le
  // bouton visible de l'en-tête.
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Tant que la session, la liste d'organisations ou l'organisation courante ne
  // sont pas connues, on affiche un état de patience — jamais un shell vide qui
  // laisserait croire que "aucune organisation" est un résultat définitif.
  if (status !== "authenticated" || organizationsLoading || !currentOrganization) {
    return <SplashScreen />;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[92rem] items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-1">
            <ModelsNavMenu />
            <Link href="/" aria-label="Registre — tableau de bord" className="shrink-0">
              <Logo size="sm" />
            </Link>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="max-w-[200px] justify-between gap-2 sm:max-w-xs">
                <span className="truncate">{currentOrganization.name}</span>
                <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-64">
              <DropdownMenuLabel>Vos organisations</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {organizations.map((org) => (
                <DropdownMenuItem
                  key={org.id}
                  onSelect={() => setCurrentOrganizationId(org.id)}
                  className="justify-between"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {org.id === currentOrganization.id ? (
                      <Check className="size-3.5 shrink-0 text-primary" />
                    ) : (
                      <span className="size-3.5 shrink-0" />
                    )}
                    <span className="truncate">{org.name}</span>
                  </span>
                  <Badge variant="secondary" className="shrink-0 text-[0.65rem]">
                    {ROLE_LABELS[org.my_role]}
                  </Badge>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="hidden text-muted-foreground sm:flex"
              onClick={() => setPaletteOpen(true)}
            >
              <Search className="size-3.5" />
              Rechercher
              <kbd className="ml-1 rounded border border-border bg-muted px-1 font-mono text-[0.65rem]">Ctrl K</kbd>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="sm:hidden"
              aria-label="Palette de commandes"
              onClick={() => setPaletteOpen(true)}
            >
              <Search className="size-4" />
            </Button>
            <OfflineStatusIndicator />
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full" aria-label="Menu du compte">
                  <Avatar size="sm">
                    <AvatarFallback>{user ? initials(user.full_name) : "?"}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">{user?.full_name}</span>
                    <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
                  </div>
                </DropdownMenuLabel>
                {user?.is_platform_admin ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/editor">
                        <ShieldCheck className="size-4" />
                        Espace éditeur
                      </Link>
                    </DropdownMenuItem>
                  </>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => void logout()}>
                  <LogOut className="size-4" />
                  Se déconnecter
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[92rem] flex-1">
        <AppSidebar />
        <main className="w-full min-w-0 flex-1 px-4 py-8 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
