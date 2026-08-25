import type { ModelDefinitionOut, RecordOut } from "@/lib/api/types";

/** Titre d'affichage d'une fiche : la valeur de son champ-titre (`title_field_key`,
 * cahier des charges §5.1) quand il est renseigné, sinon un repli honnête basé sur
 * l'identifiant plutôt qu'une chaîne vide. */
export function getRecordTitle(record: RecordOut, model: ModelDefinitionOut | null | undefined): string {
  const key = model?.title_field_key;
  if (key) {
    const value = record.data[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return `Fiche ${record.id.slice(0, 8)}`;
}
