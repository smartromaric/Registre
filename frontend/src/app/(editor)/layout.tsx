"use client";

/**
 * Coquille de l'espace éditeur (cahier des charges §13) : une surface
 * plateforme séparée de l'application organisationnelle (`app/(app)/`), sans
 * sélecteur d'organisation — un éditeur n'a par défaut accès à aucune donnée
 * métier d'organisation (§4.3) et peut n'appartenir à aucune organisation.
 * Gardée par `useRequirePlatformAdmin` (`User.is_platform_admin`), un
 * indicateur de plateforme totalement indépendant de `OrgRole`.
 */

import { type ReactNode } from "react";
import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { SplashScreen } from "@/components/brand/splash-screen";
import { EditorNavMenu, EditorSidebar } from "@/components/editor/editor-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { useRequirePlatformAdmin } from "@/lib/auth/route-guards";

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function EditorLayout({ children }: { children: ReactNode }) {
  useRequirePlatformAdmin();
  const { status, user, logout } = useAuth();

  // Tant que la session n'est pas résolue, patience honnête plutôt qu'une
  // coquille vide — même discipline que `app/(app)/layout.tsx`. Une fois
  // authentifié mais non éditeur, `useRequirePlatformAdmin` a déjà lancé la
  // redirection vers "/" ; on continue d'afficher la patience jusqu'à ce
  // qu'elle aboutisse plutôt que de laisser apparaître la coquille éditeur.
  if (status !== "authenticated" || !user?.is_platform_admin) {
    return <SplashScreen />;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[92rem] items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <EditorNavMenu />
            <Link href="/editor" aria-label="Espace éditeur — vue d'ensemble" className="flex shrink-0 items-center gap-2">
              <Logo size="sm" withWordmark={false} />
              <span className="hidden items-center gap-1.5 rounded-full bg-gold/15 px-2.5 py-1 text-xs font-medium text-gold-foreground sm:inline-flex">
                <ShieldCheck className="size-3.5" />
                Espace éditeur
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/">Retour à l&apos;application</Link>
            </Button>
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full" aria-label="Menu du compte">
                  <Avatar size="sm">
                    <AvatarFallback>{initials(user.full_name)}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">{user.full_name}</span>
                    <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                  </div>
                </DropdownMenuLabel>
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
        <EditorSidebar />
        <main className="w-full min-w-0 flex-1 px-4 py-8 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
