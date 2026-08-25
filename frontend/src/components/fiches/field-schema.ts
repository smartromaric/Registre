import { z } from "zod";

import type { FieldDefinitionOut } from "@/lib/api/types";

/**
 * Construit, pour un `FieldDefinitionOut`, un schéma Zod qui reproduit fidèlement
 * les règles de `backend/app/dynamic_fields/validation.py:_validate_value` (même
 * distinction obligatoire/facultatif, mêmes formes de valeur composite pour
 * Échéance/Document/Photo/Position/Lien). Ce n'est qu'une première ligne de
 * défense côté client : le backend reste la seule autorité, et ses erreurs 422
 * (`ApiError.fieldErrors`) sont réaffichées telles quelles sur le formulaire.
 *
 * Choix technique : chaque schéma est un `z.unknown().refine(...)` plutôt qu'un
 * enchaînement de méthodes typées (`z.string().min(1)`, `z.number()`...). Ça évite
 * toute dépendance à la forme exacte des options de configuration des messages
 * d'erreur des types primitifs Zod, qui a changé entre les versions majeures — un
 * `.refine()` avec message explicite est stable depuis toujours.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): boolean {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

const REQUIRED_MESSAGE = "Ce champ est obligatoire.";

export function zodSchemaForField(field: FieldDefinitionOut): z.ZodTypeAny {
  const required = field.is_required;

  switch (field.field_type) {
    case "text_short":
    case "text_long":
    case "phone":
    case "code":
      return z.unknown().refine(
        (v) =>
          required
            ? typeof v === "string" && v.trim().length > 0
            : isEmpty(v) || typeof v === "string",
        { message: required ? REQUIRED_MESSAGE : "Doit être un texte." },
      );

    case "number":
    case "amount":
      return z.unknown().refine(
        (v) =>
          required
            ? typeof v === "number" && Number.isFinite(v)
            : isEmpty(v) || (typeof v === "number" && Number.isFinite(v)),
        { message: required ? REQUIRED_MESSAGE : "Doit être un nombre." },
      );

    case "date":
      return z.unknown().refine((v) => (required ? isIsoDate(v) : isEmpty(v) || isIsoDate(v)), {
        message: required ? REQUIRED_MESSAGE : "Date invalide.",
      });

    case "boolean":
      return z.unknown().refine((v) => typeof v === "boolean" || (!required && isEmpty(v)), {
        message: required ? REQUIRED_MESSAGE : "Doit être vrai ou faux.",
      });

    case "select": {
      const allowed = new Set((field.select_options ?? []).map((o) => o.value));
      if (field.select_multiple) {
        return z.unknown().refine(
          (v) => {
            if (isEmpty(v) || (Array.isArray(v) && v.length === 0)) return !required;
            if (!Array.isArray(v)) return false;
            return v.every((item) => typeof item === "string" && (allowed.size === 0 || allowed.has(item)));
          },
          { message: required ? REQUIRED_MESSAGE : "Sélection invalide." },
        );
      }
      return z.unknown().refine(
        (v) => {
          if (isEmpty(v)) return !required;
          return typeof v === "string" && (allowed.size === 0 || allowed.has(v));
        },
        { message: required ? REQUIRED_MESSAGE : "Sélection invalide." },
      );
    }

    case "document":
      return z.unknown().refine(
        (v) => {
          if (isEmpty(v)) return !required;
          return isPlainObject(v) && typeof v.document_id === "string" && v.document_id.length > 0;
        },
        { message: required ? "Un document est requis." : "Document invalide." },
      );

    case "photo":
      return z.unknown().refine(
        (v) => {
          if (isEmpty(v)) return !required;
          return (
            isPlainObject(v) &&
            Array.isArray(v.document_ids) &&
            (required ? v.document_ids.length > 0 : true)
          );
        },
        { message: required ? "Au moins une photo est requise." : "Photo(s) invalide(s)." },
      );

    case "record_link":
      return z.unknown().refine(
        (v) => {
          if (isEmpty(v)) return !required;
          return isPlainObject(v) && typeof v.record_id === "string" && UUID_RE.test(v.record_id);
        },
        { message: required ? REQUIRED_MESSAGE : "Identifiant de fiche invalide." },
      );

    case "position":
      return z.unknown().refine(
        (v) => {
          if (isEmpty(v)) return !required;
          if (!isPlainObject(v)) return false;
          const { lat, lng } = v;
          return (
            typeof lat === "number" &&
            typeof lng === "number" &&
            lat >= -90 &&
            lat <= 90 &&
            lng >= -180 &&
            lng <= 180
          );
        },
        { message: required ? REQUIRED_MESSAGE : "Coordonnées invalides." },
      );

    case "due_date":
      return z.unknown().refine(
        (v) => {
          if (isEmpty(v)) return !required;
          return isPlainObject(v) && isIsoDate(v.due_date);
        },
        { message: required ? "La date d'échéance est obligatoire." : "Date d'échéance invalide." },
      );

    default:
      return z.unknown();
  }
}

/** Construit le schéma Zod complet de `Record.data` pour un modèle — une entrée
 * par champ, clé = `field.key` (miroir de la clé JSONB côté backend). */
export function buildRecordDataSchema(fields: FieldDefinitionOut[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    shape[field.key] = zodSchemaForField(field);
  }
  return z.object(shape);
}
