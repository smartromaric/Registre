"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ArrowLeft, Layers, Loader2, Plus } from "lucide-react";

import { ExistingFieldList } from "@/components/fiches/existing-field-list";
import { FieldDefinitionEditorDialog } from "@/components/fiches/field-definition-editor";
import { ColorSwatchPicker, IconPicker } from "@/components/fiches/icon-color-picker";
import { StagedFieldList } from "@/components/fiches/staged-field-list";
import { EmptyState } from "@/components/state-views";
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
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/errors";
import { addFieldDefinition, getModelDefinition, updateModelDefinition } from "@/lib/api/model-definitions";
import type { FieldDefinitionCreate, ModelDefinitionOut } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";

const settingsSchema = z.object({
  name_singular: z.string().min(1, "obligatoire").max(80, "80 caractères maximum."),
  name_plural: z.string().min(1, "obligatoire").max(80, "80 caractères maximum."),
  title_field_key: z.string().optional(),
  status_options: z.string().optional(),
});

type SettingsValues = z.infer<typeof settingsSchema>;

function toFormValues(model: ModelDefinitionOut): SettingsValues {
  return {
    name_singular: model.name_singular,
    name_plural: model.name_plural,
    title_field_key: model.title_field_key ?? "",
    status_options: model.status_options?.join(", ") ?? "",
  };
}

export default function ModelSettingsPage() {
  const { modelId } = useParams<{ modelId: string }>();
  const { accessToken, currentOrganizationId } = useAuth();
  const queryKey = ["model-definition", currentOrganizationId, modelId];

  const modelQuery = useQuery({
    queryKey,
    queryFn: () => getModelDefinition(accessToken as string, currentOrganizationId as string, modelId),
    enabled: Boolean(accessToken && currentOrganizationId && modelId),
  });

  if (modelQuery.isLoading) {
    return (
      <div className="max-w-2xl space-y-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (modelQuery.isError || !modelQuery.data) {
    return (
      <EmptyState
        icon={Layers}
        title="Modèle introuvable"
        description={modelQuery.error instanceof ApiError ? modelQuery.error.message : undefined}
        action={
          <Button variant="outline" asChild>
            <Link href="/models">Retour à mes modèles</Link>
          </Button>
        }
      />
    );
  }

  return (
    // `key` force un nouveau montage — et donc de nouvelles valeurs par défaut du
    // formulaire — si l'on navigue vers un autre modèle, sans avoir besoin d'un
    // useEffect qui resynchroniserait un état dérivé (voir lib/use-hydrated.ts
    // pour la même logique appliquée à un autre cas).
    <ModelSettingsForm
      key={modelQuery.data.id}
      model={modelQuery.data}
      queryKey={queryKey}
      accessToken={accessToken as string}
      organizationId={currentOrganizationId as string}
    />
  );
}

function ModelSettingsForm({
  model,
  queryKey,
  accessToken,
  organizationId,
}: {
  model: ModelDefinitionOut;
  queryKey: QueryKey;
  accessToken: string;
  organizationId: string;
}) {
  const queryClient = useQueryClient();
  const [icon, setIcon] = useState<string | null>(model.icon);
  const [color, setColor] = useState<string | null>(model.color);
  const [newFields, setNewFields] = useState<FieldDefinitionCreate[]>([]);
  const [addingFields, setAddingFields] = useState(false);

  const form = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: toFormValues(model),
  });

  const updateMutation = useMutation({
    mutationFn: (values: SettingsValues) =>
      updateModelDefinition(accessToken, organizationId, model.id, {
        name_singular: values.name_singular,
        name_plural: values.name_plural,
        icon,
        color,
        title_field_key: values.title_field_key ? values.title_field_key : null,
        status_options: values.status_options?.trim()
          ? values.status_options
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : null,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKey, updated);
      toast.success("Modèle mis à jour.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Mise à jour impossible."),
  });

  async function submitNewFields() {
    if (newFields.length === 0) return;
    setAddingFields(true);
    try {
      for (const field of newFields) {
        await addFieldDefinition(accessToken, organizationId, model.id, field);
      }
      toast.success(`${newFields.length} champ(s) ajouté(s).`);
      setNewFields([]);
      await queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Ajout des champs impossible.");
    } finally {
      setAddingFields(false);
    }
  }

  const existingFields = [...model.field_definitions].sort((a, b) => a.position - b.position);
  const allKeys = [...existingFields.map((f) => f.key), ...newFields.map((f) => f.key)];

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href={`/models/${model.id}`}>
            <ArrowLeft className="size-3.5" />
            {model.name_plural}
          </Link>
        </Button>
        <h1 className="mt-2 font-heading text-2xl font-semibold text-foreground sm:text-3xl">
          Réglages — {model.name_singular}
        </h1>
      </div>

      <form onSubmit={form.handleSubmit((values) => updateMutation.mutate(values))} noValidate className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="name_singular" label="Nom au singulier" error={form.formState.errors.name_singular?.message}>
            <Input id="name_singular" {...form.register("name_singular")} />
          </FormField>
          <FormField id="name_plural" label="Nom au pluriel" error={form.formState.errors.name_plural?.message}>
            <Input id="name_plural" {...form.register("name_plural")} />
          </FormField>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <IconPicker value={icon} onChange={setIcon} color={color} />
          <ColorSwatchPicker value={color} onChange={setColor} />
        </div>

        <FormField id="status_options" label="Statuts disponibles" hint="Séparés par des virgules.">
          <Input id="status_options" {...form.register("status_options")} />
        </FormField>

        <FormField id="title_field_key" label="Champ-titre">
          <Controller
            control={form.control}
            name="title_field_key"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="title_field_key" className="w-full">
                  <SelectValue placeholder="Sélectionnez un champ…" />
                </SelectTrigger>
                <SelectContent>
                  {existingFields.map((f) => (
                    <SelectItem key={f.key} value={f.key}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>

        <Button type="submit" disabled={updateMutation.isPending}>
          {updateMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Enregistrer
        </Button>
      </form>

      <section className="space-y-2.5">
        <h2 className="text-sm font-medium text-foreground">Champs existants</h2>
        <ExistingFieldList model={model} queryKey={queryKey} accessToken={accessToken} organizationId={organizationId} />
      </section>

      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">Ajouter des champs</h2>
          <FieldDefinitionEditorDialog
            trigger={
              <Button type="button" variant="outline" size="sm">
                <Plus className="size-3.5" />
                Ajouter un champ
              </Button>
            }
            existingKeys={allKeys}
            onSubmit={(field) => setNewFields((prev) => [...prev, field])}
          />
        </div>
        <StagedFieldList fields={newFields} onChange={setNewFields} />
        {newFields.length > 0 ? (
          <Button type="button" onClick={() => void submitNewFields()} disabled={addingFields}>
            {addingFields ? <Loader2 className="size-4 animate-spin" /> : null}
            Enregistrer {newFields.length} nouveau{newFields.length > 1 ? "x" : ""} champ
            {newFields.length > 1 ? "s" : ""}
          </Button>
        ) : null}
      </section>
    </div>
  );
}
