"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import * as authApi from "@/lib/api/auth";
import * as orgApi from "@/lib/api/organizations";
import { ApiError } from "@/lib/api/errors";
import type { OrganizationCreate, OrganizationWithRole, UserOut } from "@/lib/api/types";
import { useOfflineSync } from "@/lib/offline/use-offline-sync";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: AuthStatus;
  user: UserOut | null;
  /** Access token en mémoire uniquement — jamais persisté (voir src/lib/session.ts). */
  accessToken: string | null;
  organizations: OrganizationWithRole[];
  organizationsLoading: boolean;
  organizationsError: ApiError | null;
  currentOrganizationId: string | null;
  currentOrganization: OrganizationWithRole | null;
  setCurrentOrganizationId: (id: string) => void;
  signup: (payload: { email: string; password: string; full_name: string }) => Promise<{ isNewUser: boolean }>;
  login: (payload: { email: string; password: string }) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<{ isNewUser: boolean }>;
  /** Réinitialise le mot de passe puis connecte immédiatement — même mécanisme
   * de stockage des jetons que `login` (voir plus bas), pas un second circuit. */
  resetPassword: (payload: { token: string; password: string }) => Promise<void>;
  /** Accepte une invitation puis connecte immédiatement — même mécanisme que
   * `login`/`resetPassword`. */
  acceptInvitation: (payload: { token: string; password: string; full_name?: string }) => Promise<void>;
  logout: () => Promise<void>;
  completeOnboarding: (payload: OrganizationCreate) => Promise<OrganizationWithRole>;
  /** Rejoue le cookie httpOnly de refresh pour obtenir un nouveau jeton d'accès
   * — utilisé par le moteur de synchro hors-ligne (`lib/offline/sync-engine.ts`)
   * quand une opération en file échoue avec un 401 (jeton expiré pendant que
   * l'app était fermée/hors-ligne). `null` = session vraiment terminée. */
  refreshAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const CURRENT_ORG_STORAGE_KEY = "registre.currentOrganizationId";

function readStoredOrganizationId(): string | null {
  try {
    return window.localStorage.getItem(CURRENT_ORG_STORAGE_KEY);
  } catch {
    // Stockage indisponible (navigation privée, quota, etc.) : préférence perdue,
    // sans conséquence — ce n'est qu'un confort, pas une donnée qui doit survivre.
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<UserOut | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  // Choix explicite de l'utilisateur (sélecteur d'organisation) uniquement — la
  // valeur effective (ci-dessous) retombe sur la préférence stockée puis la
  // première organisation, en état dérivé plutôt que synchronisé par un effet.
  const [explicitOrganizationId, setExplicitOrganizationId] = useState<string | null>(null);
  const bootstrapped = useRef(false);
  const queryClient = useQueryClient();

  // Reconstruit la session au chargement à partir du cookie httpOnly de refresh.
  // Un échec ici est l'état normal d'un visiteur non connecté, pas une erreur à afficher.
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    let cancelled = false;

    (async () => {
      // Filet de sécurité : `refreshSession` ne devrait plus jamais lever
      // (voir son propre commentaire), mais si un cas imprévu lui échappait,
      // ce `try` évite que `status` ne reste bloqué sur "loading" pour de bon —
      // c'est exactement le bug réel corrigé le 2026-08-25 (rechargement de
      // page qui ne débloquait jamais l'écran de patience).
      try {
        const refreshed = await authApi.refreshSession();
        if (cancelled) return;
        if (!refreshed) {
          setStatus("unauthenticated");
          return;
        }
        const me = await authApi.fetchCurrentUser(refreshed.access_token);
        if (cancelled) return;
        setAccessToken(refreshed.access_token);
        setUser(me);
        setStatus("authenticated");
      } catch {
        if (!cancelled) setStatus("unauthenticated");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const organizationsQuery = useQuery({
    queryKey: ["organizations", accessToken],
    queryFn: () => orgApi.listOrganizations(accessToken as string),
    enabled: status === "authenticated" && Boolean(accessToken),
  });

  const organizations = useMemo(
    () => organizationsQuery.data ?? [],
    [organizationsQuery.data],
  );

  // Organisation courante effective : le choix explicite s'il reste valide,
  // sinon la préférence stockée, sinon la première — un utilisateur peut
  // appartenir à plusieurs organisations (§4.4). Dérivé, pas synchronisé par un
  // effet : rien à désynchroniser, rien à recaler après coup.
  const currentOrganizationId = useMemo(() => {
    if (explicitOrganizationId && organizations.some((org) => org.id === explicitOrganizationId)) {
      return explicitOrganizationId;
    }
    if (organizations.length === 0) return null;
    const stored = readStoredOrganizationId();
    const match = organizations.find((org) => org.id === stored);
    return (match ?? organizations[0]).id;
  }, [explicitOrganizationId, organizations]);

  const setCurrentOrganizationId = useCallback((id: string) => {
    setExplicitOrganizationId(id);
    try {
      window.localStorage.setItem(CURRENT_ORG_STORAGE_KEY, id);
    } catch {
      // Idem : simple confort, pas de garantie de persistance nécessaire.
    }
  }, []);

  const signup = useCallback(
    async (payload: { email: string; password: string; full_name: string }) => {
      const result = await authApi.signup(payload);
      setAccessToken(result.access_token);
      setUser(result.user);
      setStatus("authenticated");
      return { isNewUser: result.is_new_user };
    },
    [],
  );

  const login = useCallback(async (payload: { email: string; password: string }) => {
    const result = await authApi.login(payload);
    setAccessToken(result.access_token);
    setUser(result.user);
    setStatus("authenticated");
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const result = await authApi.loginWithGoogle({ id_token: idToken });
    setAccessToken(result.access_token);
    setUser(result.user);
    setStatus("authenticated");
    return { isNewUser: result.is_new_user };
  }, []);

  const resetPassword = useCallback(async (payload: { token: string; password: string }) => {
    const result = await authApi.resetPassword(payload);
    setAccessToken(result.access_token);
    setUser(result.user);
    setStatus("authenticated");
  }, []);

  const acceptInvitation = useCallback(
    async (payload: { token: string; password: string; full_name?: string }) => {
      const result = await authApi.acceptInvitation(payload);
      setAccessToken(result.access_token);
      setUser(result.user);
      setStatus("authenticated");
    },
    [],
  );

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    const refreshed = await authApi.refreshSession();
    if (!refreshed) {
      setAccessToken(null);
      setStatus("unauthenticated");
      return null;
    }
    setAccessToken(refreshed.access_token);
    return refreshed.access_token;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setAccessToken(null);
    setUser(null);
    setExplicitOrganizationId(null);
    setStatus("unauthenticated");
    queryClient.clear();
  }, [queryClient]);

  const completeOnboarding = useCallback(
    async (payload: OrganizationCreate) => {
      if (!accessToken) {
        throw new ApiError("Session expirée. Reconnectez-vous.", 401, "http");
      }
      const organization = await orgApi.onboardOrganization(accessToken, payload);
      await queryClient.invalidateQueries({ queryKey: ["organizations", accessToken] });
      setCurrentOrganizationId(organization.id);
      return organization;
    },
    [accessToken, queryClient, setCurrentOrganizationId],
  );

  const currentOrganization = useMemo(
    () => organizations.find((org) => org.id === currentOrganizationId) ?? null,
    [organizations, currentOrganizationId],
  );

  // Une seule instance pour toute l'app — `AuthProvider` lui-même n'est monté
  // qu'une fois (voir app/providers.tsx), pas besoin d'un composant dédié de plus.
  useOfflineSync(accessToken, status, refreshAccessToken);

  const value: AuthContextValue = {
    status,
    user,
    accessToken,
    organizations,
    organizationsLoading: organizationsQuery.isLoading,
    organizationsError:
      organizationsQuery.error instanceof ApiError ? organizationsQuery.error : null,
    currentOrganizationId,
    currentOrganization,
    setCurrentOrganizationId,
    signup,
    login,
    loginWithGoogle,
    resetPassword,
    acceptInvitation,
    logout,
    completeOnboarding,
    refreshAccessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth() doit être appelé sous <AuthProvider>.");
  }
  return ctx;
}
