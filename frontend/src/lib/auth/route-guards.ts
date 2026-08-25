"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "./auth-context";

/**
 * Petits gardes de route factorisés plutôt que dupliqués sur chaque page : chacun
 * lit `useAuth()` et redirige via `router.replace` (jamais `push`, pour ne pas
 * empiler une page d'auth dans l'historique). Tant que le statut est "loading",
 * personne ne redirige — on attend une réponse honnête avant de décider.
 */

/** Pages publiques (login/signup) : fait sortir un utilisateur déjà connecté. */
export function useRedirectIfAuthenticated(): void {
  const router = useRouter();
  const { status, organizations, organizationsLoading } = useAuth();

  useEffect(() => {
    if (status !== "authenticated" || organizationsLoading) return;
    router.replace(organizations.length > 0 ? "/" : "/onboarding");
  }, [status, organizations, organizationsLoading, router]);
}

/** /onboarding : réservé aux comptes authentifiés qui n'ont pas encore d'organisation. */
export function useRequireOnboarding(): void {
  const router = useRouter();
  const { status, organizations, organizationsLoading } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status === "authenticated" && !organizationsLoading && organizations.length > 0) {
      router.replace("/");
    }
  }, [status, organizations, organizationsLoading, router]);
}

/** (app)/* : réservé aux comptes authentifiés avec au moins une organisation. */
export function useRequireOrganization(): void {
  const router = useRouter();
  const { status, organizations, organizationsLoading } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status === "authenticated" && !organizationsLoading && organizations.length === 0) {
      router.replace("/onboarding");
    }
  }, [status, organizations, organizationsLoading, router]);
}
