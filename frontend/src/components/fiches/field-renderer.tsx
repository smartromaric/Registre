"use client";

/**
 * FieldRenderer — le moteur de rendu du formulaire de fiche (cahier des charges
 * §5, PRODUCT.md §7.1 : "le formulaire de saisie d'une fiche n'est jamais codé en
 * dur"). Composant central et réutilisable : à partir d'une seule
 * `FieldDefinitionOut`, il affiche le bon champ de saisie React Hook Form pour
 * chacun des 14 types du moteur de fiches (`backend/app/dynamic_fields/types.py`),
 * avec les mêmes formes de valeur JSON que `validate_and_normalize` côté serveur.
 *
 * API :
 *   <FieldRenderer field={fieldDefinition} control={form.control} name={`data.${fieldDefinition.key}`} />
 *
 * - `field`  : la définition du champ telle que renvoyée par l'API (type, réglages,
 *              options de liste, unité, paliers de rappel...).
 * - `control`: le `control` React Hook Form du formulaire parent. Typé de façon
 *              volontairement large (`Control<FieldValues>`) pour rester composable
 *              dans n'importe quel formulaire — voir le commentaire sur `Path<...>`
 *              plus bas.
 * - `name`   : le chemin RHF de la valeur (typiquement `data.<field.key>`).
 * - `disabled?` : désactive le contrôle (ex. rôle sans droit d'édition sur ce champ).
 * - `uploadContext?` : nécessaire uniquement pour les types Document/Photo/Échéance
 *              (téléversement de fichier). Sans lui — ou avec `recordId: null`,
 *              c'est-à-dire avant la première sauvegarde de la fiche, puisqu'un
 *              document ne peut être rattaché qu'à une fiche qui existe déjà côté
 *              serveur — le contrôle se désactive proprement avec un message
 *              honnête plutôt que de simuler un envoi.
 *
 * Erreurs : ce composant ne prend pas de prop `error` séparée. Il lit
 * `fieldState.error` de React Hook Form, qui couvre aussi bien la validation Zod
 * cliente que les erreurs 422 du backend une fois reportées sur le formulaire via
 * `form.setError(name, { message })` (voir `record-form.tsx` — c'est là que
 * `ApiError.fieldErrors` est mappé). Une seule source de vérité pour l'état
 * d'erreur d'un champ, jamais deux qui pourraient diverger.
 *
 * Réutilisation : ce composant ne connaît rien de "fiche" au sens Actifs suivis —
 * il ne fait que traduire un type de champ en contrôle de saisie. L'équipe Stock
 * peut l'utiliser tel quel pour les champs personnalisés d'un article.
 */

import { useCallback, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useController, type Control, type FieldValues, type Path } from "react-hook-form";
import { toast } from "sonner";
import {
  FileText,
  Image as ImageIcon,
  Loader2,
  Navigation,
  Upload,
  X,
} from "lucide-react";

import { FormField } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MAX_UPLOAD_BYTES, uploadDocument } from "@/lib/api/documents";
import { ApiError } from "@/lib/api/errors";
import type {
  DocumentFieldValue,
  DueDateFieldValue,
  FieldDefinitionOut,
  PhotoFieldValue,
  PositionFieldValue,
} from "@/lib/api/types";
import { formatFileSize, getCachedDocument, rememberDocument } from "@/lib/documents-cache";
import { cn } from "@/lib/utils";

export interface UploadContext {
  organizationId: string;
  accessToken: string;
  /** `null` avant la première sauvegarde de la fiche — voir le commentaire d'en-tête. */
  recordId: string | null;
}

export interface FieldRendererProps {
  field: FieldDefinitionOut;
  control: Control<FieldValues>;
  name: string;
  disabled?: boolean;
  uploadContext?: UploadContext;
}

function fieldInputId(name: string): string {
  return `field-${name.replace(/\./g, "-")}`;
}

export function FieldRenderer({ field, control, name, disabled, uploadContext }: FieldRendererProps) {
  // `Path<FieldValues>` s'effondre en `string` pour un type générique sans clés
  // littérales (comme `FieldValues`) : le cast est sûr, pas un contournement du
  // typage — c'est ce qui permet à ce composant de rester composable dans
  // n'importe quel formulaire React Hook Form.
  const { field: rhf, fieldState } = useController({ control, name: name as Path<FieldValues> });
  const id = fieldInputId(name);
  const errorMessage = fieldState.error?.message;
  const inputDisabled = Boolean(disabled);

  switch (field.field_type) {
    case "text_short":
      return (
        <FormField id={id} label={field.label} error={errorMessage} hint={field.help_text ?? undefined}>
          <Input
            id={id}
            value={typeof rhf.value === "string" ? rhf.value : ""}
            onChange={(e) => rhf.onChange(e.target.value)}
            onBlur={rhf.onBlur}
            disabled={inputDisabled}
            aria-invalid={Boolean(errorMessage)}
          />
        </FormField>
      );

    case "text_long":
      return (
        <FormField id={id} label={field.label} error={errorMessage} hint={field.help_text ?? undefined}>
          <Textarea
            id={id}
            value={typeof rhf.value === "string" ? rhf.value : ""}
            onChange={(e) => rhf.onChange(e.target.value)}
            onBlur={rhf.onBlur}
            disabled={inputDisabled}
            aria-invalid={Boolean(errorMessage)}
            rows={4}
          />
        </FormField>
      );

    case "phone":
      return (
        <FormField id={id} label={field.label} error={errorMessage} hint={field.help_text ?? undefined}>
          <Input
            id={id}
            type="tel"
            value={typeof rhf.value === "string" ? rhf.value : ""}
            onChange={(e) => rhf.onChange(e.target.value)}
            onBlur={rhf.onBlur}
            disabled={inputDisabled}
            aria-invalid={Boolean(errorMessage)}
          />
        </FormField>
      );

    case "code":
      return (
        <FormField
          id={id}
          label={field.label}
          error={errorMessage}
          hint={field.help_text ?? "Saisie manuelle — le scan par caméra n'est pas encore disponible."}
        >
          <Input
            id={id}
            value={typeof rhf.value === "string" ? rhf.value : ""}
            onChange={(e) => rhf.onChange(e.target.value)}
            onBlur={rhf.onBlur}
            disabled={inputDisabled}
            aria-invalid={Boolean(errorMessage)}
          />
        </FormField>
      );

    case "number":
      return (
        <FormField id={id} label={field.label} error={errorMessage} hint={field.help_text ?? undefined}>
          <InputGroup aria-invalid={Boolean(errorMessage)}>
            <InputGroupInput
              id={id}
              type="number"
              inputMode="decimal"
              value={typeof rhf.value === "number" ? rhf.value : ""}
              onChange={(e) =>
                rhf.onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)
              }
              onBlur={rhf.onBlur}
              disabled={inputDisabled}
            />
            {field.number_unit ? (
              <InputGroupAddon align="inline-end">{field.number_unit}</InputGroupAddon>
            ) : null}
          </InputGroup>
        </FormField>
      );

    case "amount":
      return (
        <FormField id={id} label={field.label} error={errorMessage} hint={field.help_text ?? undefined}>
          <InputGroup aria-invalid={Boolean(errorMessage)}>
            <InputGroupInput
              id={id}
              type="number"
              inputMode="decimal"
              step="0.01"
              value={typeof rhf.value === "number" ? rhf.value : ""}
              onChange={(e) =>
                rhf.onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)
              }
              onBlur={rhf.onBlur}
              disabled={inputDisabled}
            />
          </InputGroup>
        </FormField>
      );

    case "date":
      return (
        <FormField id={id} label={field.label} error={errorMessage} hint={field.help_text ?? undefined}>
          <Input
            id={id}
            type="date"
            value={typeof rhf.value === "string" ? rhf.value : ""}
            onChange={(e) => rhf.onChange(e.target.value || undefined)}
            onBlur={rhf.onBlur}
            disabled={inputDisabled}
            aria-invalid={Boolean(errorMessage)}
          />
        </FormField>
      );

    case "boolean": {
      const checked = rhf.value === true;
      return (
        <FormField id={id} label={field.label} error={errorMessage} hint={field.help_text ?? undefined}>
          <div className="flex items-center gap-2.5">
            <Switch
              id={id}
              checked={checked}
              onCheckedChange={(v) => rhf.onChange(v)}
              disabled={inputDisabled}
            />
            <span className="text-sm text-foreground">{checked ? "Oui" : "Non"}</span>
          </div>
        </FormField>
      );
    }

    case "select":
      return (
        <SelectFieldControl
          id={id}
          field={field}
          value={rhf.value}
          onChange={rhf.onChange}
          disabled={inputDisabled}
          error={errorMessage}
        />
      );

    case "position":
      return (
        <PositionFieldControl
          id={id}
          field={field}
          value={rhf.value as PositionFieldValue | null | undefined}
          onChange={rhf.onChange}
          disabled={inputDisabled}
          error={errorMessage}
        />
      );

    case "record_link": {
      const recordId =
        rhf.value && typeof rhf.value === "object" && "record_id" in rhf.value
          ? String((rhf.value as { record_id?: unknown }).record_id ?? "")
          : "";
      return (
        <FormField
          id={id}
          label={field.label}
          error={errorMessage}
          hint={
            field.help_text ??
            "Identifiant (UUID) de la fiche liée — la sélection visuelle n'est pas encore disponible."
          }
        >
          <Input
            id={id}
            value={recordId}
            onChange={(e) => {
              const v = e.target.value.trim();
              rhf.onChange(v ? { record_id: v } : undefined);
            }}
            onBlur={rhf.onBlur}
            disabled={inputDisabled}
            aria-invalid={Boolean(errorMessage)}
            placeholder="00000000-0000-0000-0000-000000000000"
          />
        </FormField>
      );
    }

    case "document":
      return (
        <FormField id={id} label={field.label} error={errorMessage} hint={field.help_text ?? undefined}>
          <DocumentAttachment
            documentId={(rhf.value as DocumentFieldValue | null | undefined)?.document_id ?? null}
            onChange={(documentId) => rhf.onChange(documentId ? { document_id: documentId } : null)}
            disabled={inputDisabled}
            uploadContext={uploadContext}
            fieldKey={field.key}
          />
        </FormField>
      );

    case "photo":
      return (
        <FormField id={id} label={field.label} error={errorMessage} hint={field.help_text ?? undefined}>
          <PhotosAttachment
            documentIds={(rhf.value as PhotoFieldValue | null | undefined)?.document_ids ?? []}
            onChange={(ids) => rhf.onChange(ids.length ? { document_ids: ids } : null)}
            disabled={inputDisabled}
            uploadContext={uploadContext}
            fieldKey={field.key}
          />
        </FormField>
      );

    case "due_date": {
      const value = rhf.value as DueDateFieldValue | null | undefined;
      return (
        <FormField id={id} label={field.label} error={errorMessage} hint={field.help_text ?? undefined}>
          <div className="space-y-2.5 rounded-lg border border-border p-3">
            <Input
              id={id}
              type="date"
              value={value?.due_date ?? ""}
              onChange={(e) =>
                rhf.onChange(
                  e.target.value ? { due_date: e.target.value, document_id: value?.document_id ?? null } : null,
                )
              }
              onBlur={rhf.onBlur}
              disabled={inputDisabled}
              aria-invalid={Boolean(errorMessage)}
            />
            <DocumentAttachment
              label="Justificatif"
              documentId={value?.document_id ?? null}
              onChange={(documentId) =>
                rhf.onChange(value?.due_date ? { due_date: value.due_date, document_id: documentId } : null)
              }
              disabled={inputDisabled || !value?.due_date}
              uploadContext={uploadContext}
              fieldKey={field.key}
            />
          </div>
        </FormField>
      );
    }

    default:
      return (
        <FormField id={id} label={field.label} error="Type de champ non pris en charge.">
          <Input id={id} disabled />
        </FormField>
      );
  }
}

// ---------------------------------------------------------------------------
// Liste de choix (simple ou multiple)
// ---------------------------------------------------------------------------

function SelectFieldControl({
  id,
  field,
  value,
  onChange,
  disabled,
  error,
}: {
  id: string;
  field: FieldDefinitionOut;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
  error?: string;
}) {
  const options = field.select_options ?? [];

  if (field.select_multiple) {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    const toggle = (optionValue: string) => {
      const next = selected.includes(optionValue)
        ? selected.filter((v) => v !== optionValue)
        : [...selected, optionValue];
      onChange(next);
    };
    return (
      <FormField id={id} label={field.label} error={error} hint={field.help_text ?? undefined}>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              disabled={disabled}
              aria-invalid={Boolean(error)}
              className="w-full justify-between font-normal"
            >
              <span className="truncate text-left">
                {selected.length > 0
                  ? options
                      .filter((o) => selected.includes(o.value))
                      .map((o) => o.label)
                      .join(", ")
                  : "Sélectionnez…"}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-1.5">
            <div className="max-h-60 space-y-0.5 overflow-y-auto">
              {options.length === 0 ? (
                <p className="px-2 py-1.5 text-sm text-muted-foreground">Aucune option configurée.</p>
              ) : (
                options.map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <Checkbox
                      checked={selected.includes(option.value)}
                      onCheckedChange={() => toggle(option.value)}
                    />
                    {option.label}
                  </label>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      </FormField>
    );
  }

  return (
    <FormField id={id} label={field.label} error={error} hint={field.help_text ?? undefined}>
      <Select
        value={typeof value === "string" ? value : undefined}
        onValueChange={(v) => onChange(v)}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full" aria-invalid={Boolean(error)}>
          <SelectValue placeholder="Sélectionnez…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );
}

// ---------------------------------------------------------------------------
// Position (latitude/longitude)
// ---------------------------------------------------------------------------

function PositionFieldControl({
  id,
  field,
  value,
  onChange,
  disabled,
  error,
}: {
  id: string;
  field: FieldDefinitionOut;
  value: PositionFieldValue | null | undefined;
  onChange: (value: PositionFieldValue | null) => void;
  disabled: boolean;
  error?: string;
}) {
  const [locating, setLocating] = useState(false);

  const useCurrentPosition = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Géolocalisation non disponible sur cet appareil.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onChange({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => {
        setLocating(false);
        toast.error("Position indisponible — autorisation refusée ou signal absent.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, [onChange]);

  return (
    <FormField id={id} label={field.label} error={error} hint={field.help_text ?? undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Latitude"
          type="number"
          step="any"
          placeholder="Latitude"
          className="w-32"
          value={value?.lat ?? ""}
          onChange={(e) =>
            onChange({ lat: e.target.valueAsNumber, lng: value?.lng ?? Number.NaN })
          }
          disabled={disabled}
          aria-invalid={Boolean(error)}
        />
        <Input
          aria-label="Longitude"
          type="number"
          step="any"
          placeholder="Longitude"
          className="w-32"
          value={value?.lng ?? ""}
          onChange={(e) =>
            onChange({ lat: value?.lat ?? Number.NaN, lng: e.target.valueAsNumber })
          }
          disabled={disabled}
          aria-invalid={Boolean(error)}
        />
        <Button type="button" variant="outline" size="sm" disabled={disabled || locating} onClick={useCurrentPosition}>
          {locating ? <Loader2 className="size-3.5 animate-spin" /> : <Navigation className="size-3.5" />}
          Utiliser ma position
        </Button>
      </div>
    </FormField>
  );
}

// ---------------------------------------------------------------------------
// Téléversement — document unique (aussi utilisé pour le justificatif d'Échéance)
// ---------------------------------------------------------------------------

function useDropzoneHandlers(disabled: boolean, onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      if (disabled) return;
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) onFiles(files);
    },
    [disabled, onFiles],
  );

  const onInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      if (files.length > 0) onFiles(files);
      e.target.value = "";
    },
    [onFiles],
  );

  return { dragging, setDragging, inputRef, onDrop, onInputChange };
}

function DocumentAttachment({
  documentId,
  onChange,
  disabled,
  uploadContext,
  fieldKey,
  label = "Document",
}: {
  documentId: string | null;
  onChange: (documentId: string | null) => void;
  disabled: boolean;
  uploadContext?: UploadContext;
  fieldKey: string;
  label?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const cached = uploadContext && documentId ? getCachedDocument(uploadContext.organizationId, documentId) : null;
  const canUpload = Boolean(uploadContext?.recordId) && !disabled;

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (!uploadContext?.recordId) return;
      const file = files[0];
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error("Fichier trop volumineux (15 Mo maximum).");
        return;
      }
      setUploading(true);
      try {
        const doc = await uploadDocument(
          uploadContext.accessToken,
          uploadContext.organizationId,
          uploadContext.recordId,
          file,
          fieldKey,
        );
        rememberDocument(uploadContext.organizationId, doc);
        onChange(doc.id);
        toast.success(`« ${doc.filename} » téléversé.`);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Téléversement impossible.");
      } finally {
        setUploading(false);
      }
    },
    [uploadContext, fieldKey, onChange],
  );

  const { dragging, setDragging, inputRef, onDrop, onInputChange } = useDropzoneHandlers(
    !canUpload || uploading,
    (files) => void handleFiles(files),
  );

  return (
    <div className="space-y-2">
      {documentId ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">
            {cached ? cached.filename : `Document joint (${documentId.slice(0, 8)}…)`}
            {cached ? <span className="ml-1.5 text-xs text-muted-foreground">{formatFileSize(cached.size_bytes)}</span> : null}
          </span>
          {!disabled ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Retirer le document"
              onClick={() => onChange(null)}
            >
              <X className="size-3.5" />
            </Button>
          ) : null}
        </div>
      ) : null}

      {!uploadContext?.recordId ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
          Enregistrez d&apos;abord la fiche pour joindre {label === "Document" ? "un document" : "un justificatif"}.
        </p>
      ) : (
        <div
          role="button"
          tabIndex={canUpload ? 0 : -1}
          onClick={() => canUpload && inputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && canUpload) inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (canUpload) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
            !canUpload && "pointer-events-none cursor-not-allowed opacity-50",
          )}
        >
          {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          {uploading ? "Envoi en cours…" : `Glissez-déposez ${documentId ? "pour remplacer" : "ou cliquez"}`}
          <input ref={inputRef} type="file" className="hidden" onChange={onInputChange} disabled={!canUpload} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Téléversement — photos multiples
// ---------------------------------------------------------------------------

function PhotosAttachment({
  documentIds,
  onChange,
  disabled,
  uploadContext,
  fieldKey,
}: {
  documentIds: string[];
  onChange: (documentIds: string[]) => void;
  disabled: boolean;
  uploadContext?: UploadContext;
  fieldKey: string;
}) {
  const [uploading, setUploading] = useState(false);
  const canUpload = Boolean(uploadContext?.recordId) && !disabled;

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (!uploadContext?.recordId) return;
      const oversized = files.find((f) => f.size > MAX_UPLOAD_BYTES);
      if (oversized) {
        toast.error(`« ${oversized.name} » dépasse 15 Mo.`);
        return;
      }
      setUploading(true);
      const uploaded: string[] = [];
      try {
        for (const file of files) {
          const doc = await uploadDocument(
            uploadContext.accessToken,
            uploadContext.organizationId,
            uploadContext.recordId,
            file,
            fieldKey,
          );
          rememberDocument(uploadContext.organizationId, doc);
          uploaded.push(doc.id);
        }
        onChange([...documentIds, ...uploaded]);
        toast.success(uploaded.length > 1 ? `${uploaded.length} photos téléversées.` : "Photo téléversée.");
      } catch (err) {
        if (uploaded.length > 0) onChange([...documentIds, ...uploaded]);
        toast.error(err instanceof ApiError ? err.message : "Téléversement impossible.");
      } finally {
        setUploading(false);
      }
    },
    [uploadContext, fieldKey, documentIds, onChange],
  );

  const { dragging, setDragging, inputRef, onDrop, onInputChange } = useDropzoneHandlers(
    !canUpload || uploading,
    (files) => void handleFiles(files),
  );

  return (
    <div className="space-y-2">
      {documentIds.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {documentIds.map((id) => {
            const cached = uploadContext ? getCachedDocument(uploadContext.organizationId, id) : null;
            return (
              <div
                key={id}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 py-1 pr-1 pl-2 text-xs"
              >
                <ImageIcon className="size-3.5 text-muted-foreground" />
                <span className="max-w-32 truncate">{cached ? cached.filename : `${id.slice(0, 8)}…`}</span>
                {!disabled ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Retirer la photo"
                    onClick={() => onChange(documentIds.filter((existing) => existing !== id))}
                  >
                    <X className="size-3" />
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {!uploadContext?.recordId ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
          Enregistrez d&apos;abord la fiche pour ajouter des photos.
        </p>
      ) : (
        <div
          role="button"
          tabIndex={canUpload ? 0 : -1}
          onClick={() => canUpload && inputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && canUpload) inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (canUpload) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
            !canUpload && "pointer-events-none cursor-not-allowed opacity-50",
          )}
        >
          {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          {uploading ? "Envoi en cours…" : "Glissez-déposez des photos ou cliquez"}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onInputChange}
            disabled={!canUpload}
          />
        </div>
      )}
    </div>
  );
}
