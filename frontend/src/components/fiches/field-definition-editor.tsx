"use client";

/**
 * Boîte de dialogue de configuration d'un champ, utilisée par le constructeur de
 * modèles (écran de création et panneau "Ajouter un champ" de l'écran d'édition —
 * voir `app/(app)/models/new/page.tsx` et `.../[modelId]/settings/page.tsx`).
 *
 * Ne parle pas au backend elle-même : elle produit un `FieldDefinitionCreate` que
 * l'appelant ajoute à sa liste locale de champs (encore modifiable/réordonnable
 * avant l'enregistrement — voir `staged-fields-list.tsx`) ou envoie directement à
 * `addFieldDefinition`.
 */

import { useState, type ChangeEvent, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Plus, Trash2 } from "lucide-react";

import { FormField } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FIELD_TYPE_OPTIONS } from "@/components/fiches/field-types";
import {
  DEFAULT_REMINDER_OFFSETS_DAYS,
  DEFAULT_REMINDER_REPEAT_DAYS_OVERDUE,
  type FieldDefinitionCreate,
} from "@/lib/api/types";

const FIELD_TYPE_VALUES = [
  "text_short",
  "text_long",
  "number",
  "amount",
  "date",
  "due_date",
  "boolean",
  "select",
  "document",
  "photo",
  "phone",
  "record_link",
  "position",
  "code",
] as const;

function slugify(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const startsWithLetter = /^[a-z]/.test(base) ? base : `champ_${base}`;
  return startsWithLetter.slice(0, 80) || "champ";
}

function parseOffsets(raw: string | undefined): number[] {
  if (!raw) return [...DEFAULT_REMINDER_OFFSETS_DAYS];
  const values = raw
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0);
  const unique = Array.from(new Set(values)).sort((a, b) => b - a);
  return unique.length > 0 ? unique : [...DEFAULT_REMINDER_OFFSETS_DAYS];
}

const editorSchema = z
  .object({
    label: z.string().min(1, "Le libellé est obligatoire.").max(120, "120 caractères maximum."),
    key: z
      .string()
      .min(1, "obligatoire")
      .max(80, "80 caractères maximum.")
      .regex(/^[a-z][a-z0-9_]*$/, "minuscules, chiffres et _ uniquement, doit commencer par une lettre."),
    field_type: z.enum(FIELD_TYPE_VALUES),
    is_required: z.boolean(),
    is_unique: z.boolean(),
    show_in_list: z.boolean(),
    is_filterable: z.boolean(),
    help_text: z.string().max(300, "300 caractères maximum.").optional(),
    number_unit: z.string().max(20, "20 caractères maximum.").optional(),
    select_multiple: z.boolean(),
    select_options: z.array(
      z.object({ value: z.string().min(1, "obligatoire"), label: z.string().min(1, "obligatoire") }),
    ),
    reminder_offsets_days: z.string().optional(),
    reminder_repeat_days_overdue: z.number().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.field_type === "select" && values.select_options.length === 0) {
      ctx.addIssue({ code: "custom", path: ["select_options"], message: "Ajoutez au moins une option." });
    }
  });

type EditorValues = z.infer<typeof editorSchema>;

function defaultValues(initial?: FieldDefinitionCreate): EditorValues {
  return {
    label: initial?.label ?? "",
    key: initial?.key ?? "",
    field_type: initial?.field_type ?? "text_short",
    is_required: initial?.is_required ?? false,
    is_unique: initial?.is_unique ?? false,
    show_in_list: initial?.show_in_list ?? false,
    is_filterable: initial?.is_filterable ?? false,
    help_text: initial?.help_text ?? "",
    number_unit: initial?.number_unit ?? "",
    select_multiple: initial?.select_multiple ?? false,
    select_options: initial?.select_options ?? [],
    reminder_offsets_days: (initial?.reminder_offsets_days ?? [...DEFAULT_REMINDER_OFFSETS_DAYS]).join(", "),
    reminder_repeat_days_overdue:
      initial?.reminder_repeat_days_overdue ?? DEFAULT_REMINDER_REPEAT_DAYS_OVERDUE,
  };
}

export interface FieldDefinitionEditorDialogProps {
  trigger: ReactNode;
  /** Clés déjà utilisées par d'autres champs du modèle — pour refuser un doublon. */
  existingKeys: string[];
  onSubmit: (field: FieldDefinitionCreate) => void;
  initialValue?: FieldDefinitionCreate;
  dialogTitle?: string;
  /** Le champ existe déjà côté serveur : `key` et `field_type` ne peuvent plus
   * changer (voir `FieldDefinitionUpdate`), la clé est donc verrouillée à la
   * saisie plutôt que de laisser croire qu'elle peut être renommée. */
  lockKey?: boolean;
}

export function FieldDefinitionEditorDialog({
  trigger,
  existingKeys,
  onSubmit,
  initialValue,
  dialogTitle,
  lockKey,
}: FieldDefinitionEditorDialogProps) {
  const [open, setOpen] = useState(false);
  const [keyTouched, setKeyTouched] = useState(Boolean(initialValue));

  const form = useForm<EditorValues>({
    resolver: zodResolver(editorSchema),
    defaultValues: defaultValues(initialValue),
  });
  const { control, register, handleSubmit, setValue, setError, formState } = form;
  const fieldType = useWatch({ control, name: "field_type" });
  const optionsArray = useFieldArray({ control, name: "select_options" });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      form.reset(defaultValues(initialValue));
      setKeyTouched(Boolean(initialValue));
    }
  }

  function onValid(values: EditorValues) {
    const otherKeys = existingKeys.filter((k) => k !== initialValue?.key);
    if (otherKeys.includes(values.key)) {
      setError("key", { message: "Cette clé est déjà utilisée par un autre champ." });
      return;
    }
    const payload: FieldDefinitionCreate = {
      key: values.key,
      label: values.label,
      field_type: values.field_type,
      is_required: values.is_required,
      is_unique: values.is_unique,
      show_in_list: values.show_in_list,
      is_filterable: values.is_filterable,
      help_text: values.help_text?.trim() ? values.help_text.trim() : null,
      number_unit:
        values.field_type === "number" && values.number_unit?.trim() ? values.number_unit.trim() : null,
      select_options: values.field_type === "select" ? values.select_options : null,
      select_multiple: values.field_type === "select" ? values.select_multiple : false,
      reminder_offsets_days: values.field_type === "due_date" ? parseOffsets(values.reminder_offsets_days) : null,
      reminder_repeat_days_overdue:
        values.field_type === "due_date"
          ? (values.reminder_repeat_days_overdue ?? DEFAULT_REMINDER_REPEAT_DAYS_OVERDUE)
          : null,
    };
    onSubmit(payload);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dialogTitle ?? (initialValue ? "Modifier le champ" : "Ajouter un champ")}</DialogTitle>
          <DialogDescription>
            Configurez le type et les réglages du champ (cahier des charges §5.2, §5.3).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onValid)} noValidate className="space-y-4">
          <FormField id="fd-label" label="Libellé" error={formState.errors.label?.message}>
            <Input
              id="fd-label"
              placeholder="Ex. Kilométrage"
              {...register("label", {
                onChange: (e: ChangeEvent<HTMLInputElement>) => {
                  if (!keyTouched) setValue("key", slugify(e.target.value));
                },
              })}
            />
          </FormField>

          <FormField
            id="fd-key"
            label="Clé technique"
            error={formState.errors.key?.message}
            hint={
              lockKey
                ? "Ce champ existe déjà : sa clé technique ne peut plus changer."
                : "Identifiant stable utilisé en interne — ne change plus une fois des fiches créées."
            }
          >
            <Input
              id="fd-key"
              placeholder="kilometrage"
              disabled={lockKey}
              {...register("key", { onChange: () => setKeyTouched(true) })}
            />
          </FormField>

          <FormField id="fd-type" label="Type de champ" error={formState.errors.field_type?.message}>
            <Controller
              control={control}
              name="field_type"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={Boolean(initialValue)}>
                  <SelectTrigger id="fd-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>

          {fieldType === "number" ? (
            <FormField id="fd-unit" label="Unité" hint="Ex. km, litres, jours…">
              <Input id="fd-unit" placeholder="km" {...register("number_unit")} />
            </FormField>
          ) : null}

          {fieldType === "select" ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Options</span>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Controller
                    control={control}
                    name="select_multiple"
                    render={({ field }) => (
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    )}
                  />
                  Choix multiple
                </label>
              </div>
              <div className="space-y-2">
                {optionsArray.fields.map((option, index) => (
                  <div key={option.id} className="flex items-center gap-1.5">
                    <Input
                      placeholder="Valeur"
                      className="w-28"
                      {...register(`select_options.${index}.value` as const)}
                    />
                    <Input placeholder="Libellé affiché" {...register(`select_options.${index}.label` as const)} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Retirer l'option"
                      onClick={() => optionsArray.remove(index)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              {formState.errors.select_options?.message ? (
                <p className="text-sm text-destructive">{formState.errors.select_options.message}</p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => optionsArray.append({ value: "", label: "" })}
              >
                <Plus className="size-3.5" />
                Ajouter une option
              </Button>
            </div>
          ) : null}

          {fieldType === "due_date" ? (
            <>
              <FormField
                id="fd-offsets"
                label="Paliers de rappel (jours avant échéance)"
                hint="Séparés par des virgules — par défaut 60, 30, 7, 0 (le jour même)."
              >
                <Input id="fd-offsets" placeholder="60, 30, 7, 0" {...register("reminder_offsets_days")} />
              </FormField>
              <FormField
                id="fd-repeat"
                label="Relance en retard (tous les N jours)"
                hint="Par défaut : tous les 3 jours tant que l'échéance n'est pas renouvelée."
              >
                <Input
                  id="fd-repeat"
                  type="number"
                  min={1}
                  {...register("reminder_repeat_days_overdue", { valueAsNumber: true })}
                />
              </FormField>
            </>
          ) : null}

          <FormField id="fd-help" label="Texte d'aide" hint="Facultatif — affiché sous le champ à la saisie.">
            <Textarea id="fd-help" rows={2} {...register("help_text")} />
          </FormField>

          <div className="grid grid-cols-2 gap-2.5 rounded-lg border border-border p-3">
            <label className="flex items-center gap-2 text-sm">
              <Controller
                control={control}
                name="is_required"
                render={({ field }) => <Checkbox checked={field.value} onCheckedChange={field.onChange} />}
              />
              Obligatoire
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Controller
                control={control}
                name="is_unique"
                render={({ field }) => <Checkbox checked={field.value} onCheckedChange={field.onChange} />}
              />
              Valeur unique
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Controller
                control={control}
                name="show_in_list"
                render={({ field }) => <Checkbox checked={field.value} onCheckedChange={field.onChange} />}
              />
              Visible en liste
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Controller
                control={control}
                name="is_filterable"
                render={({ field }) => <Checkbox checked={field.value} onCheckedChange={field.onChange} />}
              />
              Filtrable
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit">{initialValue ? "Enregistrer" : "Ajouter le champ"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
