/** Formatage de dates en français — un seul endroit, pour rester cohérent
 * partout où une date de l'API (ISO 8601) doit être affichée (§14.7). */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(iso));
}

/** Date + heure, pour l'horodatage des mouvements de stock (§7.3) — un simple
 * "aujourd'hui/hier" serait ambigu pour départager plusieurs mouvements du même jour. */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

/** Montant monétaire — devise de l'organisation si connue, sinon un nombre
 * décimal simple plutôt qu'un symbole monétaire inventé. */
export function formatAmount(value: number, currencyCode?: string): string {
  return new Intl.NumberFormat("fr-FR", {
    style: currencyCode ? "currency" : "decimal",
    currency: currencyCode,
    maximumFractionDigits: 2,
  }).format(value);
}
