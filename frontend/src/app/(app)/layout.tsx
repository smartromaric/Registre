"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Check, ChevronsUpDown, LogOut } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { SplashScreen } from "@/components/brand/splash-screen";
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

  // Tant que la session, la liste d'organisations ou l'organisation courante ne
  // sont pas connues, on affiche un état de patience — jamais un shell vide qui
  // laisserait croire que "aucune organisation" est un résultat définitif.
  if (status !== "authenticated" || organizationsLoading || !currentOrganization) {
    return <SplashScreen />;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="Registre — tableau de bord" className="shrink-0">
            <Logo size="sm" />
          </Link>

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

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
