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

/** (editor)/* : réservé aux utilisateurs `is_platform_admin` (cahier des
 * charges §4.3, §13) — un indicateur de plateforme totalement indépendant des
 * organisations et de `OrgRole` : un éditeur peut n'appartenir à aucune
 * organisation, et un ADMIN d'organisation n'est pas éditeur pour autant.
 * Contrairement à `useRequireOrganization`, ne dépend d'aucune liste
 * d'organisations : `status === "authenticated"` suffit pour lire `user`. */
export function useRequirePlatformAdmin(): void {
  const router = useRouter();
  const { status, user } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status === "authenticated" && !user?.is_platform_admin) {
      router.replace("/");
    }
  }, [status, user, router]);
}
