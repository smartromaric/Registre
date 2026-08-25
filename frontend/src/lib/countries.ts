/**
 * Miroir exact de `backend/app/core/countries.py` (§4.4, §12.2 du cahier des charges) :
 * la devise et le fuseau horaire proposés à l'onboarding dépendent du pays choisi.
 * Ne pas ajouter un pays ici sans l'ajouter aussi côté backend — sinon l'aperçu de
 * devise affiché pendant la saisie ne correspondrait plus à ce que l'API applique
 * réellement à la création de l'organisation.
 */
export interface CountryOption {
  code: string;
  name: string;
  currency: string;
  timezone: string;
}

export const COUNTRIES: CountryOption[] = [
  { code: "CM", name: "Cameroun", currency: "XAF", timezone: "Africa/Douala" },
  { code: "SN", name: "Sénégal", currency: "XOF", timezone: "Africa/Dakar" },
  { code: "CI", name: "Côte d'Ivoire", currency: "XOF", timezone: "Africa/Abidjan" },
  { code: "TG", name: "Togo", currency: "XOF", timezone: "Africa/Lome" },
  { code: "BJ", name: "Bénin", currency: "XOF", timezone: "Africa/Porto-Novo" },
  { code: "BF", name: "Burkina Faso", currency: "XOF", timezone: "Africa/Ouagadougou" },
  { code: "ML", name: "Mali", currency: "XOF", timezone: "Africa/Bamako" },
  { code: "NE", name: "Niger", currency: "XOF", timezone: "Africa/Niamey" },
  { code: "GW", name: "Guinée-Bissau", currency: "XOF", timezone: "Africa/Bissau" },
  { code: "GA", name: "Gabon", currency: "XAF", timezone: "Africa/Libreville" },
  { code: "TD", name: "Tchad", currency: "XAF", timezone: "Africa/Ndjamena" },
  { code: "CG", name: "Congo-Brazzaville", currency: "XAF", timezone: "Africa/Brazzaville" },
  { code: "CF", name: "République centrafricaine", currency: "XAF", timezone: "Africa/Bangui" },
  { code: "GQ", name: "Guinée équatoriale", currency: "XAF", timezone: "Africa/Malabo" },
  { code: "CD", name: "République démocratique du Congo", currency: "CDF", timezone: "Africa/Kinshasa" },
  { code: "MA", name: "Maroc", currency: "MAD", timezone: "Africa/Casablanca" },
  { code: "DZ", name: "Algérie", currency: "DZD", timezone: "Africa/Algiers" },
  { code: "TN", name: "Tunisie", currency: "TND", timezone: "Africa/Tunis" },
  { code: "FR", name: "France", currency: "EUR", timezone: "Europe/Paris" },
  { code: "BE", name: "Belgique", currency: "EUR", timezone: "Europe/Brussels" },
  { code: "US", name: "États-Unis", currency: "USD", timezone: "America/New_York" },
  { code: "GB", name: "Royaume-Uni", currency: "GBP", timezone: "Europe/London" },
];

export function currencyForCountry(code: string): string | undefined {
  return COUNTRIES.find((c) => c.code === code)?.currency;
}
