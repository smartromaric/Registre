"use client";

/**
 * Formatage monétaire correct pour une devise administrée par l'éditeur
 * (cahier des charges §12.2, §13) — corrige un bug trouvé lors d'une chasse
 * au bug dédiée (2026-08-25, voir PRODUCT.md §10.14) : presque tous les
 * affichages de montant appelaient `formatAmount(value, currencyCode)`, qui
 * ne fait qu'une déduction `Intl.NumberFormat` à partir d'un code ISO — or le
 * catalogue de devises de la plateforme n'est PAS validé ISO 4217 (l'éditeur
 * peut créer n'importe quel code à trois lettres avec son propre gabarit
 * d'affichage, ex. `"{amount} FCFA"`). Pour un code non-ISO, `Intl` n'échoue
 * pas — il affiche silencieusement le code brut en pseudo-symbole au lieu du
 * gabarit configuré. Ce hook résout la vraie devise (`GET /catalog/currencies`,
 * ouvert à tout utilisateur connecté — voir `lib/api/catalog.ts`) et applique
 * `formatWithCurrencyFormat`, qui respecte ce gabarit.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { listCurrencies } from "@/lib/api/catalog";
import { formatWithCurrencyFormat } from "@/lib/format";
import { useAuth } from "@/lib/auth/auth-context";

export function useCurrencyFormat(): (value: number, currencyCode?: string) => string {
  const { accessToken } = useAuth();
  // Même clé que `app/(app)/abonnement/page.tsx` : un seul appel réseau
  // partagé par tout l'appli via le cache React Query, pas une requête par
  // composant qui affiche un montant.
  const currenciesQuery = useQuery({
    queryKey: ["catalog-currencies"],
    queryFn: () => listCurrencies(accessToken as string),
    enabled: Boolean(accessToken),
    staleTime: 5 * 60 * 1000,
  });
  const currencies = currenciesQuery.data;

  return useMemo(
    () => (value: number, currencyCode?: string) => {
      const currency = currencyCode ? currencies?.find((c) => c.code === currencyCode) : undefined;
      // Catalogue pas encore chargé ou code sans correspondance : nombre
      // décimal simple plutôt qu'un symbole monétaire inventé (même principe
      // que `formatAmount`/`formatWithCurrencyFormat`).
      return formatWithCurrencyFormat(value, currency);
    },
    [currencies],
  );
}
