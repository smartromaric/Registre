"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ArrowLeft, Loader2, Plus } from "lucide-react";

import { FieldDefinitionEditorDialog } from "@/components/fiches/field-definition-editor";
import { ColorSwatchPicker, IconPicker } from "@/components/fiches/icon-color-picker";
import { StagedFieldList } from "@/components/fiches/staged-field-list";
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
import { ApiError } from "@/lib/api/errors";
import { createModelDefinition } from "@/lib/api/model-definitions";
import type { FieldDefinitionCreate, ModelDefinitionCreate, RecordNature } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";

const modelSchema = z.object({
  name_singular: z.string().min(1, "Le nom au singulier est obligatoire.").max(80, "80 caractères maximum."),
  name_plural: z.string().min(1, "Le nom au pluriel est obligatoire.").max(80, "80 caractères maximum."),
  nature: z.enum(["asset", "stock_item"]),
  title_field_key: z.string().optional(),
  status_options: z.string().optional(),
});

type ModelFormValues = z.infer<typeof modelSchema>;

/**
 * Création d'un modèle de fiche sur mesure (cahier des charges §5.1). Les champs
 * sont construits localement (ajout, réordonnancement, suppression) puis envoyés
 * en un seul appel `POST .../model-definitions` avec leur position finale — le
 * backend n'offre pas de réordonnancement après coup, voir
 * `lib/api/model-definitions.ts` et `staged-field-list.tsx`.
 */
export default function NewModelPage() {
  const { accessToken, currentOrganizationId } = useAuth();
  const router = useRouter();
  const [icon, setIcon] = useState<string | null>("package");
  const [color, setColor] = useState<string | null>("#0E6E63");
  const [fields, setFields] = useState<FieldDefinitionCreate[]>([]);
  const [fieldsError, setFieldsError] = useState<string | null>(null);

  const form = useForm<ModelFormValues>({
    resolver: zodResolver(modelSchema),
    defaultValues: { name_singular: "", name_plural: "", nature: "asset", title_field_key: "", status_options: "" },
  });

  const createMutation = useMutation({
    mutationFn: (payload: ModelDefinitionCreate) =>
      createModelDefinition(accessToken as string, currentOrganizationId as string, payload),
    onSuccess: (model) => {
      toast.success(`Modèle « ${model.name_plural} » créé.`);
      router.push(`/models/${model.id}`);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Création du modèle impossible.");
    },
  });

  function onValid(values: ModelFormValues) {
    if (fields.length === 0) {
      setFieldsError("Ajoutez au moins un champ avant de créer le modèle.");
      return;
    }
    setFieldsError(null);
    const payload: ModelDefinitionCreate = {
      name_singular: values.name_singular,
      name_plural: values.name_plural,
      icon,
      color,
      nature: values.nature as RecordNature,
      title_field_key: values.title_field_key ? values.title_field_key : null,
      status_options: values.status_options?.trim()
        ? values.status_options
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : null,
      fields: fields.map((field, index) => ({ ...field, position: index })),
    };
    createMutation.mutate(payload);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href="/models">
            <ArrowLeft className="size-3.5" />
            Mes modèles
          </Link>
        </Button>
        <h1 className="mt-2 font-heading text-2xl font-semibold text-foreground sm:text-3xl">Nouveau modèle</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Décrivez ce que votre organisation va suivre — aucun développement nécessaire (§5.1).
        </p>
      </div>

      <form onSubmit={form.handleSubmit(onValid)} noValidate className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="name_singular" label="Nom au singulier" error={form.formState.errors.name_singular?.message}>
            <Input id="name_singular" placeholder="Véhicule" {...form.register("name_singular")} />
          </FormField>
          <FormField id="name_plural" label="Nom au pluriel" error={form.formState.errors.name_plural?.message}>
            <Input id="name_plural" placeholder="Véhicules" {...form.register("name_plural")} />
          </FormField>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <IconPicker value={icon} onChange={setIcon} color={color} />
          <ColorSwatchPicker value={color} onChange={setColor} />
        </div>

        <FormField id="nature" label="Nature" hint="Structure toute l'application (§5.5) — ne se change plus après coup.">
          <Controller
            control={form.control}
            name="nature"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="nature" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asset">Actif suivi — « qu&apos;est-ce qui va expirer ? »</SelectItem>
                  <SelectItem value="stock_item">Article de stock — « combien m&apos;en reste-t-il ? »</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </FormField>

        <FormField
          id="status_options"
          label="Statuts disponibles"
          hint="Facultatif, séparés par des virgules. Ex. en_service, immobilise, archive."
        >
          <Input id="status_options" placeholder="en_service, immobilise, archive" {...form.register("status_options")} />
        </FormField>

        <FormField
          id="title_field_key"
          label="Champ-titre"
          hint="Le champ affiché comme titre de chaque fiche — ajoutez d'abord des champs ci-dessous."
        >
          <Controller
            control={form.control}
            name="title_field_key"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={fields.length === 0}>
                <SelectTrigger id="title_field_key" className="w-full">
                  <SelectValue placeholder="Sélectionnez un champ…" />
                </SelectTrigger>
                <SelectContent>
                  {fields.map((f) => (
                    <SelectItem key={f.key} value={f.key}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-foreground">Champs du modèle</h2>
            <FieldDefinitionEditorDialog
              trigger={
                <Button type="button" variant="outline" size="sm">
                  <Plus className="size-3.5" />
                  Ajouter un champ
                </Button>
              }
              existingKeys={fields.map((f) => f.key)}
              onSubmit={(field) => {
                setFields((prev) => [...prev, field]);
                setFieldsError(null);
              }}
            />
          </div>
          <StagedFieldList fields={fields} onChange={setFields} />
          {fieldsError ? <p className="text-sm text-destructive">{fieldsError}</p> : null}
        </div>

        <Button type="submit" size="lg" disabled={createMutation.isPending}>
          {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Créer le modèle
        </Button>
      </form>
    </div>
  );
}
