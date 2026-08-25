/**
 * Types d'événements courants pour une fiche (cahier des charges §6.2 : "entretien,
 * réparation, incident, contrôle, affectation"). `RecordEvent.event_type` est un
 * texte libre côté backend (pas un enum) — cette liste n'est qu'une aide à la
 * saisie ; le champ reste modifiable librement au besoin.
 */
export interface RecordEventTypeOption {
  value: string;
  label: string;
}

export const RECORD_EVENT_TYPES: RecordEventTypeOption[] = [
  { value: "entretien", label: "Entretien" },
  { value: "reparation", label: "Réparation" },
  { value: "incident", label: "Incident" },
  { value: "controle", label: "Contrôle" },
  { value: "affectation", label: "Affectation" },
  { value: "autre", label: "Autre" },
];

export function eventTypeLabel(value: string): string {
  return RECORD_EVENT_TYPES.find((option) => option.value === value)?.label ?? value;
}
