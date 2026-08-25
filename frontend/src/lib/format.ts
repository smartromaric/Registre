/** Formatage de dates en français — un seul endroit, pour rester cohérent
 * partout où une date de l'API (ISO 8601) doit être affichée (§14.7). */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(iso));
}
