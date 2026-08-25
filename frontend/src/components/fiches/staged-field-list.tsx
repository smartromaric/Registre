"use client";

/**
 * Liste réordonnable des champs en cours de construction (avant enregistrement).
 * Le backend n'accepte l'ordre des champs (`position`) qu'à la création du modèle
 * ou à l'ajout d'un champ (`POST .../fields`, toujours ajouté en fin de liste) —
 * aucune route ne permet de réordonner un champ déjà enregistré (voir
 * `lib/api/model-definitions.ts`). Le glisser-déposer/haut-bas n'a donc de sens
 * que sur cette liste "en construction", jamais après coup — d'où des boutons
 * haut/bas simples plutôt qu'un vrai glisser-déposer, qui laisserait croire à une
 * réorganisation persistante et générale.
 */

import { createElement } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldDefinitionEditorDialog } from "@/components/fiches/field-definition-editor";
import { fieldTypeIcon, fieldTypeLabel } from "@/components/fiches/field-types";
import type { FieldDefinitionCreate } from "@/lib/api/types";

export interface StagedFieldListProps {
  fields: FieldDefinitionCreate[];
  onChange: (fields: FieldDefinitionCreate[]) => void;
}

export function StagedFieldList({ fields, onChange }: StagedFieldListProps) {
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next.map((f, i) => ({ ...f, position: i })));
  }

  function remove(index: number) {
    onChange(fields.filter((_, i) => i !== index).map((f, i) => ({ ...f, position: i })));
  }

  function replace(index: number, field: FieldDefinitionCreate) {
    const next = [...fields];
    next[index] = { ...field, position: index };
    onChange(next);
  }

  if (fields.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        Aucun champ pour l&apos;instant — ajoutez-en au moins un.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {fields.map((field, index) => {
        const icon = fieldTypeIcon(field.field_type);
        return (
          <li key={field.key} className="flex items-center gap-3 px-3 py-2.5">
            {createElement(icon, { className: "size-4 shrink-0 text-muted-foreground" })}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{field.label}</p>
              <p className="truncate text-xs text-muted-foreground">
                {fieldTypeLabel(field.field_type)}
                {field.is_required ? " · obligatoire" : ""}
                {field.show_in_list ? " · visible en liste" : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Monter"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Descendre"
                disabled={index === fields.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown className="size-3.5" />
              </Button>
              <FieldDefinitionEditorDialog
                trigger={
                  <Button type="button" variant="ghost" size="sm">
                    Modifier
                  </Button>
                }
                existingKeys={fields.map((f) => f.key)}
                initialValue={field}
                onSubmit={(updated) => replace(index, updated)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Retirer le champ"
                onClick={() => remove(index)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
