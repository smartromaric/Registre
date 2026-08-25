"""Valide et normalise les données d'une fiche (`Record.data`) contre les
`FieldDefinition` de son modèle. C'est le point unique qui sait comment un champ
personnalisé est représenté en JSON — personne d'autre ne doit interpréter la
forme d'une valeur de champ.
"""

import uuid
from datetime import date
from typing import Any

from app.dynamic_fields.types import FieldType
from app.models.model_definition import FieldDefinition


class FieldValidationError(Exception):
    def __init__(self, errors: dict[str, str]):
        self.errors = errors
        super().__init__(f"{len(errors)} champ(s) invalide(s) : {', '.join(errors)}")


def _is_uuid(value: Any) -> bool:
    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, TypeError):
        return False


def _is_iso_date(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    try:
        date.fromisoformat(value)
        return True
    except ValueError:
        return False


def _validate_value(field: FieldDefinition, value: Any) -> tuple[Any, str | None]:
    """Retourne (valeur_normalisée, message_erreur | None)."""
    match field.field_type:
        case FieldType.TEXT_SHORT | FieldType.PHONE | FieldType.CODE:
            if not isinstance(value, str):
                return None, "doit être un texte."
            return value, None

        case FieldType.TEXT_LONG:
            if not isinstance(value, str):
                return None, "doit être un texte."
            return value, None

        case FieldType.NUMBER | FieldType.AMOUNT:
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                return None, "doit être un nombre."
            return value, None

        case FieldType.DATE:
            if not _is_iso_date(value):
                return None, "doit être une date au format AAAA-MM-JJ."
            return value, None

        case FieldType.BOOLEAN:
            if not isinstance(value, bool):
                return None, "doit être vrai ou faux."
            return value, None

        case FieldType.SELECT:
            allowed = {opt["value"] for opt in (field.select_options or [])}
            if field.select_multiple:
                if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
                    return None, "doit être une liste de choix."
                invalid = set(value) - allowed
                if invalid:
                    return None, f"valeur(s) hors liste : {', '.join(sorted(invalid))}."
                return value, None
            if not isinstance(value, str) or (allowed and value not in allowed):
                return None, "doit être une valeur de la liste."
            return value, None

        case FieldType.DOCUMENT:
            if not isinstance(value, dict) or not _is_uuid(value.get("document_id")):
                return None, "doit référencer un document téléversé."
            return {"document_id": str(value["document_id"])}, None

        case FieldType.PHOTO:
            if not isinstance(value, dict) or not isinstance(value.get("document_ids"), list):
                return None, "doit référencer une liste de photos téléversées."
            ids = value["document_ids"]
            if not all(_is_uuid(i) for i in ids):
                return None, "identifiants de photo invalides."
            return {"document_ids": [str(i) for i in ids]}, None

        case FieldType.RECORD_LINK:
            if not isinstance(value, dict) or not _is_uuid(value.get("record_id")):
                return None, "doit référencer une fiche existante."
            return {"record_id": str(value["record_id"])}, None

        case FieldType.POSITION:
            if not isinstance(value, dict) or "lat" not in value or "lng" not in value:
                return None, "doit contenir une latitude et une longitude."
            try:
                lat, lng = float(value["lat"]), float(value["lng"])
            except (TypeError, ValueError):
                return None, "latitude/longitude invalides."
            if not (-90 <= lat <= 90 and -180 <= lng <= 180):
                return None, "latitude/longitude hors limites."
            return {"lat": lat, "lng": lng}, None

        case FieldType.DUE_DATE:
            if not isinstance(value, dict) or not _is_iso_date(value.get("due_date")):
                return None, "doit contenir une date d'échéance au format AAAA-MM-JJ."
            document_id = value.get("document_id")
            if document_id is not None and not _is_uuid(document_id):
                return None, "justificatif invalide."
            return {
                "due_date": value["due_date"],
                "document_id": str(document_id) if document_id else None,
            }, None

    return None, "type de champ non reconnu."  # pragma: no cover — defensive


def validate_and_normalize(
    field_definitions: list[FieldDefinition], data: dict[str, Any], *, partial: bool
) -> dict[str, Any]:
    """`partial=False` (création) : tout champ obligatoire doit être présent.
    `partial=True` (mise à jour) : seules les clés fournies sont validées, les
    absentes ne touchent pas la valeur existante (fusion faite par l'appelant).
    """
    errors: dict[str, str] = {}
    normalized: dict[str, Any] = {}
    fields_by_key = {f.key: f for f in field_definitions}

    unknown_keys = set(data) - set(fields_by_key)
    for key in unknown_keys:
        errors[key] = "ce champ n'existe pas sur ce modèle."

    for field in field_definitions:
        if field.key not in data:
            if not partial and field.is_required:
                errors[field.key] = "ce champ est obligatoire."
            continue
        value = data[field.key]
        if value is None:
            if field.is_required and not partial:
                errors[field.key] = "ce champ est obligatoire."
            else:
                normalized[field.key] = None
            continue
        normalized_value, error = _validate_value(field, value)
        if error:
            errors[field.key] = error
        else:
            normalized[field.key] = normalized_value

    if errors:
        raise FieldValidationError(errors)
    return normalized


def extract_due_dates(field_definitions: list[FieldDefinition], data: dict[str, Any]) -> dict[str, dict]:
    """Renvoie {field_key: {"due_date": ..., "document_id": ...}} pour les champs
    Échéance présents dans `data` — sert à synchroniser RecordDeadline (voir
    RecordService et app/alerts).
    """
    result = {}
    for field in field_definitions:
        if field.field_type == FieldType.DUE_DATE and field.key in data and data[field.key]:
            result[field.key] = data[field.key]
    return result
