/**
 * Suggestions de secteur d'activité affichées à l'onboarding (§4.4). Le champ backend
 * (`OrganizationCreate.sector`) est un texte libre optionnel (120 caractères max) : cette
 * liste n'est pas un enum imposé, seulement une aide à la saisie cohérente avec la
 * bibliothèque de modèles prêts à l'emploi du cahier des charges (§5.6). L'utilisateur
 * peut toujours saisir autre chose.
 */
export const SECTOR_SUGGESTIONS: string[] = [
  "Transport et logistique",
  "Gaz et énergie",
  "Textile et habillement",
  "BTP et construction",
  "Distribution et commerce",
  "Sécurité et gardiennage",
  "Hôtellerie et restauration",
  "Santé",
  "Agriculture et agroalimentaire",
  "Services aux entreprises",
];
