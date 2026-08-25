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

/** Montant selon le format d'affichage propre à une devise éditeur (§12.2,
 * §13 — ex. `"{amount} FCFA"`) : les devises de la plateforme sont une table
 * administrée à la main, pas forcément ISO 4217 — leur gabarit d'affichage
 * doit toujours primer sur une déduction `Intl` à partir du seul code (voir
 * `lib/use-currency-format.ts`, qui résout la devise réelle avant d'appeler
 * cette fonction — appeler celle-ci directement avec un code plutôt qu'un
 * objet `Currency` résolu réintroduirait le bug documenté à PRODUCT.md
 * §10.14). Sans devise connue, retombe sur un nombre décimal simple. */
export function formatWithCurrencyFormat(
  value: number,
  currency?: { display_format: string } | null,
): string {
  const amount = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
  if (!currency) return amount;
  return currency.display_format.replace("{amount}", amount);
}
