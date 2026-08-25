"use client";

/**
 * Liste des champs déjà enregistrés d'un modèle — modification, suppression et
 * réordonnancement s'appliquent immédiatement côté serveur (`PATCH`/`DELETE`/
 * `PUT .../reorder`), à la différence de `StagedFieldList` qui ne manipule que
 * des champs pas encore créés. Le champ-titre du modèle ne peut pas être
 * supprimé : le bouton est désactivé plutôt que de laisser l'utilisateur
 * découvrir le refus après coup via le 409 du serveur.
 */

import { createElement, useState } from "react";
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FieldDefinitionEditorDialog } from "@/components/fiches/field-definition-editor";
import { fieldTypeIcon, fieldTypeLabel } from "@/components/fiches/field-types";
import { ApiError } from "@/lib/api/errors";
import {
  deleteFieldDefinition,
  reorderFieldDefinitions,
  updateFieldDefinition,
} from "@/lib/api/model-definitions";
import type { FieldDefinitionOut, ModelDefinitionOut } from "@/lib/api/types";

export interface ExistingFieldListProps {
  model: ModelDefinitionOut;
  queryKey: QueryKey;
  accessToken: string;
  organizationId: string;
}

export function ExistingFieldList({ model, queryKey, accessToken, organizationId }: ExistingFieldListProps) {
  const queryClient = useQueryClient();
  const fields = [...model.field_definitions].sort((a, b) => a.position - b.position);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  function setModel(next: ModelDefinitionOut) {
    queryClient.setQueryData(queryKey, next);
  }

  const updateMutation = useMutation({
    mutationFn: ({ fieldId, payload }: { fieldId: string; payload: Parameters<typeof updateFieldDefinition>[4] }) =>
      updateFieldDefinition(accessToken, organizationId, model.id, fieldId, payload),
    onSuccess: (updated) => {
      setModel({
        ...model,
        field_definitions: model.field_definitions.map((f) => (f.id === updated.id ? updated : f)),
      });
      toast.success("Champ mis à jour.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Mise à jour du champ impossible."),
  });

  const deleteMutation = useMutation({
    mutationFn: (fieldId: string) => deleteFieldDefinition(accessToken, organizationId, model.id, fieldId),
    onSuccess: (_data, fieldId) => {
      setModel({
        ...model,
        field_definitions: model.field_definitions.filter((f) => f.id !== fieldId),
      });
      toast.success("Champ supprimé.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Suppression du champ impossible."),
  });

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    setReorderingId(fields[index].id);
    try {
      const reordered = await reorderFieldDefinitions(accessToken, organizationId, model.id, {
        field_ids: next.map((f) => f.id),
      });
      setModel({ ...model, field_definitions: reordered });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Réorganisation impossible.");
    } finally {
      setReorderingId(null);
    }
  }

  if (fields.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        Ce modèle n&apos;a aucun champ pour l&apos;instant.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {fields.map((field, index) => (
        <ExistingFieldRow
          key={field.id}
          field={field}
          isTitleField={model.title_field_key === field.key}
          existingKeys={fields.map((f) => f.key)}
          isFirst={index === 0}
          isLast={index === fields.length - 1}
          isReordering={reorderingId !== null}
          onMoveUp={() => void move(index, -1)}
          onMoveDown={() => void move(index, 1)}
          onSave={(payload) => updateMutation.mutate({ fieldId: field.id, payload })}
          onDelete={() => deleteMutation.mutate(field.id)}
          deleting={deleteMutation.isPending && deleteMutation.variables === field.id}
        />
      ))}
    </ul>
  );
}

function ExistingFieldRow({
  field,
  isTitleField,
  existingKeys,
  isFirst,
  isLast,
  isReordering,
  onMoveUp,
  onMoveDown,
  onSave,
  onDelete,
  deleting,
}: {
  field: FieldDefinitionOut;
  isTitleField: boolean;
  existingKeys: string[];
  isFirst: boolean;
  isLast: boolean;
  isReordering: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSave: (payload: Parameters<typeof updateFieldDefinition>[4]) => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const icon = fieldTypeIcon(field.field_type);

  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      {createElement(icon, { className: "size-4 shrink-0 text-muted-foreground" })}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {field.label}
          {isTitleField ? <span className="ml-1.5 text-xs text-muted-foreground">(titre des fiches)</span> : null}
        </p>
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
          disabled={isFirst || isReordering}
          onClick={onMoveUp}
        >
          <ArrowUp className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Descendre"
          disabled={isLast || isReordering}
          onClick={onMoveDown}
        >
          <ArrowDown className="size-3.5" />
        </Button>
        <FieldDefinitionEditorDialog
          trigger={
            <Button type="button" variant="ghost" size="sm">
              Modifier
            </Button>
          }
          existingKeys={existingKeys}
          initialValue={field}
          lockKey
          dialogTitle="Modifier le champ"
          onSubmit={(updated) =>
            onSave({
              label: updated.label,
              help_text: updated.help_text ?? null,
              show_in_list: updated.show_in_list,
              is_filterable: updated.is_filterable,
              is_required: updated.is_required,
              is_unique: updated.is_unique,
              number_unit: updated.number_unit ?? null,
              select_options: updated.select_options ?? null,
              select_multiple: updated.select_multiple,
              reminder_offsets_days: updated.reminder_offsets_days ?? null,
              reminder_repeat_days_overdue: updated.reminder_repeat_days_overdue ?? null,
            })
          }
        />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Supprimer le champ"
              disabled={isTitleField || deleting}
              title={isTitleField ? "Choisissez d'abord un autre champ-titre dans les réglages du modèle." : undefined}
            >
              {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer « {field.label} » ?</AlertDialogTitle>
              <AlertDialogDescription>
                Les fiches existantes conservent cette donnée dans leur historique, mais elle ne sera plus modifiable
                ni visible dans les formulaires. Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onDelete}>
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}
