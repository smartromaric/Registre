"use client";

/**
 * RecordForm — formulaire de création/édition d'une fiche, entièrement produit à
 * partir de `model.field_definitions` (PRODUCT.md §7.1 : "le formulaire de saisie
 * d'une fiche n'est jamais codé en dur"). Délègue chaque champ à `FieldRenderer`
 * (voir `field-renderer.tsx`) et valide côté client avec un schéma Zod construit
 * par `buildRecordDataSchema` (voir `field-schema.ts`), miroir des règles
 * `validate_and_normalize` du backend.
 *
 * Erreurs serveur (422, `{"errors": {"cle": "message"}}`) : reportées sur les
 * champs concernés via `form.setError("data.<cle>", ...)` — c'est le seul endroit
 * qui traduit `ApiError.fieldErrors` en état de formulaire, `FieldRenderer` se
 * contente ensuite de lire `fieldState.error` normalement.
 */

import { useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, type Control, type FieldValues, type Path } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2 } from "lucide-react";

import { FieldRenderer } from "@/components/fiches/field-renderer";
import { buildRecordDataSchema } from "@/components/fiches/field-schema";
import { FormField } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createRecord, updateRecord } from "@/lib/api/records";
import { ApiError } from "@/lib/api/errors";
import type { ModelDefinitionOut, RecordOut } from "@/lib/api/types";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";

const FULL_WIDTH_TYPES = new Set(["text_long", "photo", "due_date"]);

export interface RecordFormProps {
  model: ModelDefinitionOut;
  organizationId: string;
  accessToken: string;
  mode: "create" | "edit";
  /** Obligatoire quand `mode === "edit"`. */
  record?: RecordOut;
  onSuccess: (record: RecordOut) => void;
}

export function RecordForm({ model, organizationId, accessToken, mode, record, onSuccess }: RecordFormProps) {
  const sortedFields = useMemo(
    () => [...model.field_definitions].sort((a, b) => a.position - b.position),
    [model.field_definitions],
  );

  const schema = useMemo(
    () =>
      z.object({
        data: buildRecordDataSchema(sortedFields),
        status: z.string().optional(),
        site: z.string().max(120, "120 caractères maximum.").optional(),
      }),
    [sortedFields],
  );

  type FormValues = z.infer<typeof schema>;

  const defaultData = useMemo(() => {
    const base: Record<string, unknown> = {};
    for (const field of sortedFields) {
      const value = mode === "edit" && record ? record.data[field.key] : field.default_value;
      if (value !== undefined && value !== null) base[field.key] = value;
    }
    return base;
  }, [sortedFields, mode, record]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      data: defaultData,
      status: record?.status ?? model.status_options?.[0] ?? undefined,
      site: record?.site ?? "",
    },
  });

  const { dialog: unsavedChangesDialog } = useUnsavedChangesGuard(form.formState.isDirty);

  async function onValid(values: FormValues) {
    const payload = {
      data: values.data,
      status: values.status ? values.status : null,
      site: values.site?.trim() ? values.site.trim() : null,
    };
    try {
      const saved =
        mode === "create"
          ? await createRecord(accessToken, organizationId, model.id, payload)
          : await updateRecord(accessToken, organizationId, record!.id, payload);
      toast.success(mode === "create" ? "Fiche créée." : "Fiche mise à jour.");
      // Enregistrement réussi : le formulaire n'a plus rien de "non enregistré"
      // à protéger — sans ce reset, `formState.isDirty` resterait vrai et le
      // garde-fou (`useUnsavedChangesGuard`) bloquerait à tort la navigation
      // que `onSuccess` s'apprête à déclencher.
      form.reset(values);
      onSuccess(saved);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        for (const [key, message] of Object.entries(err.fieldErrors)) {
          form.setError(`data.${key}` as Path<FormValues>, { type: "server", message });
        }
        toast.error("Le formulaire contient des erreurs — corrigez les champs signalés.");
      } else {
        toast.error(err instanceof ApiError ? err.message : "Enregistrement impossible.");
      }
    }
  }

  const { isSubmitting } = form.formState;

  return (
    <form onSubmit={form.handleSubmit(onValid)} noValidate className="space-y-6">
      {unsavedChangesDialog}
      <div className="grid gap-5 sm:grid-cols-2">
        {model.status_options && model.status_options.length > 0 ? (
          <FormField id="record-status" label="Statut">
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="record-status" className="w-full">
                    <SelectValue placeholder="Sélectionnez…" />
                  </SelectTrigger>
                  <SelectContent>
                    {model.status_options!.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
        ) : null}

        <FormField id="record-site" label="Site" hint="Facultatif — lieu ou dépôt d'affectation.">
          <Input id="record-site" {...form.register("site")} />
        </FormField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {sortedFields.map((field) => (
          <div key={field.id} className={FULL_WIDTH_TYPES.has(field.field_type) ? "sm:col-span-2" : undefined}>
            <FieldRenderer
              field={field}
              control={form.control as unknown as Control<FieldValues>}
              name={`data.${field.key}`}
              uploadContext={{
                organizationId,
                accessToken,
                recordId: mode === "edit" && record ? record.id : null,
              }}
            />
          </div>
        ))}
      </div>

      <Button type="submit" disabled={isSubmitting} size="lg">
        {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
        {mode === "create" ? "Créer la fiche" : "Enregistrer les modifications"}
      </Button>
    </form>
  );
}
