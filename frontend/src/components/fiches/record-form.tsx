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
 *
 * Hors-ligne (cahier des charges §11.3/§11.4, PRODUCT.md §10.11) : l'id de
 * fiche est TOUJOURS généré côté client (pas seulement hors-ligne — c'est la
 * condition posée dès la création pour que ce mode n'ait jamais à réécrire ce
 * socle), et une mise à jour envoie toujours `field_written_at` (un
 * horodatage par champ modifié, capturé à cette soumission précise) pour la
 * fusion champ par champ côté serveur. Si l'appel échoue avec
 * `ApiError.kind === "network"` (le serveur n'a même pas été joint — jamais
 * pour un 422/403, qui restent des erreurs normales), l'opération part dans la
 * file IndexedDB (`lib/offline/db.ts`) et un instantané local remplace la
 * réponse serveur, pour que la suite (navigation vers la fiche) fonctionne à
 * l'identique.
 */

import { useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
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
import { enqueueOperation, putCachedRecord } from "@/lib/offline/db";
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
  const queryClient = useQueryClient();
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
    const nowIso = new Date().toISOString();
    const payload = {
      data: values.data,
      status: values.status ? values.status : null,
      site: values.site?.trim() ? values.site.trim() : null,
    };
    try {
      let saved: RecordOut;
      let queuedOffline = false;

      if (mode === "create") {
        // Généré ici, pas côté serveur (§11.4) — c'est cet id qui identifie la
        // fiche partout ensuite, qu'elle parte en ligne ou en file d'attente.
        const recordId = crypto.randomUUID();
        try {
          saved = await createRecord(accessToken, organizationId, model.id, { ...payload, id: recordId });
        } catch (err) {
          if (!(err instanceof ApiError) || err.kind !== "network") throw err;
          saved = {
            id: recordId,
            model_definition_id: model.id,
            data: payload.data,
            status: payload.status,
            site: payload.site,
            assigned_person_record_id: null,
            is_archived: false,
            archived_at: null,
            created_at: nowIso,
            updated_at: nowIso,
          };
          await enqueueOperation({
            id: crypto.randomUUID(),
            kind: "record.create",
            organizationId,
            createdAt: nowIso,
            status: "pending",
            attempts: 0,
            payload: {
              modelId: model.id,
              recordId,
              data: payload.data,
              status: payload.status,
              site: payload.site,
              assigned_person_record_id: null,
            },
          });
          await putCachedRecord({ id: recordId, organizationId, modelId: model.id, data: saved, cachedAt: nowIso });
          queuedOffline = true;
        }
        queryClient.setQueryData(["record", organizationId, saved.id], saved);
      } else {
        // Seuls les champs réellement modifiés à CETTE soumission partent au
        // serveur — pas l'objet `data` complet du formulaire. Sans ce tri, un
        // champ jamais touché par cet utilisateur (juste rechargé depuis
        // `record.data` dans `defaultValues`) repartait quand même horodaté à
        // "maintenant", ce qui aurait pu écraser sans avertissement la
        // modification plus récente d'un autre champ par un collègue — la
        // fusion champ par champ (PRODUCT.md §10.11) ne protège que ce qui lui
        // est réellement soumis comme "écrit à cet instant".
        const dirtyKeys = Object.keys(form.formState.dirtyFields.data ?? {});
        const changedData = Object.fromEntries(dirtyKeys.map((key) => [key, values.data[key]]));
        const fieldWrittenAt = Object.fromEntries(dirtyKeys.map((key) => [key, nowIso]));
        const clientOperationId = crypto.randomUUID();
        try {
          saved = await updateRecord(accessToken, organizationId, record!.id, {
            ...payload,
            data: changedData,
            client_operation_id: clientOperationId,
            field_written_at: fieldWrittenAt,
          });
        } catch (err) {
          if (!(err instanceof ApiError) || err.kind !== "network") throw err;
          saved = {
            ...record!,
            data: { ...record!.data, ...changedData },
            status: payload.status,
            site: payload.site,
            updated_at: nowIso,
          };
          await enqueueOperation({
            id: clientOperationId,
            kind: "record.update",
            organizationId,
            createdAt: nowIso,
            status: "pending",
            attempts: 0,
            payload: {
              recordId: record!.id,
              data: changedData,
              status: payload.status,
              site: payload.site,
              assigned_person_record_id: record!.assigned_person_record_id,
              fieldWrittenAt,
            },
          });
          await putCachedRecord({
            id: record!.id,
            organizationId,
            modelId: model.id,
            data: saved,
            cachedAt: nowIso,
          });
          queuedOffline = true;
        }
        queryClient.setQueryData(["record", organizationId, saved.id], saved);
      }

      toast.success(
        queuedOffline
          ? `${mode === "create" ? "Fiche créée" : "Fiche mise à jour"} hors connexion — sera synchronisée au retour du réseau.`
          : mode === "create"
            ? "Fiche créée."
            : "Fiche mise à jour.",
      );
      // Enregistrement réussi (ou mis en file) : le formulaire n'a plus rien de
      // "non enregistré" à protéger — sans ce reset, `formState.isDirty`
      // resterait vrai et le garde-fou (`useUnsavedChangesGuard`) bloquerait à
      // tort la navigation que `onSuccess` s'apprête à déclencher.
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
