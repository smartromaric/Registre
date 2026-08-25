"""Reprise d'un fichier tableur existant (cahier des charges §9 : « Indispensable :
aucun client ne re-saisira 200 véhicules à la main. ») — deux temps, comme demandé :
correspondance des colonnes puis aperçu avant validation (§18.1, l'exemple d'Awa).

Limite assumée pour ce lot : le fichier doit être un CSV encodé en UTF-8, les dates
au format AAAA-MM-JJ. La reprise directe de classeurs .xlsx (mise en forme, feuilles
multiples) est un raffinement possible sans changer cette mécanique de fond.
"""

import csv
import io
import unicodedata
from dataclasses import dataclass, field
from typing import Any

from app.dynamic_fields.types import FieldType
from app.dynamic_fields.validation import FieldValidationError, validate_and_normalize
from app.models.model_definition import FieldDefinition


def _normalize(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return "".join(c for c in decomposed.lower() if c.isalnum())


def parse_csv(content: bytes) -> tuple[list[str], list[dict[str, str]]]:
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    return list(reader.fieldnames or []), list(reader)


def suggest_mapping(headers: list[str], fields: list[FieldDefinition]) -> dict[str, str | None]:
    by_label = {_normalize(f.label): f.key for f in fields}
    by_key = {_normalize(f.key): f.key for f in fields}
    return {header: by_label.get(_normalize(header)) or by_key.get(_normalize(header)) for header in headers}


def _coerce_cell(raw: str, field_type: FieldType) -> Any:
    raw = raw.strip()
    if raw == "":
        return None
    if field_type in (FieldType.NUMBER, FieldType.AMOUNT):
        return float(raw.replace(",", "."))
    if field_type == FieldType.BOOLEAN:
        if raw.lower() in ("oui", "true", "1", "vrai"):
            return True
        if raw.lower() in ("non", "false", "0", "faux"):
            return False
        raise ValueError("valeur booléenne non reconnue (attendu oui/non)")
    if field_type == FieldType.DATE:
        return raw  # validé par validate_and_normalize (format AAAA-MM-JJ attendu)
    if field_type == FieldType.DUE_DATE:
        return {"due_date": raw, "document_id": None}
    return raw


@dataclass
class RowResult:
    index: int
    data: dict[str, Any] = field(default_factory=dict)
    errors: dict[str, str] = field(default_factory=dict)

    @property
    def is_valid(self) -> bool:
        return not self.errors


def build_rows(
    raw_rows: list[dict[str, str]], mapping: dict[str, str], fields: list[FieldDefinition]
) -> list[RowResult]:
    fields_by_key = {f.key: f for f in fields}
    results: list[RowResult] = []

    for index, raw_row in enumerate(raw_rows):
        data: dict[str, Any] = {}
        cell_errors: dict[str, str] = {}
        for header, field_key in mapping.items():
            if not field_key or field_key not in fields_by_key:
                continue
            raw_value = raw_row.get(header, "")
            if raw_value is None or raw_value.strip() == "":
                continue
            try:
                data[field_key] = _coerce_cell(raw_value, fields_by_key[field_key].field_type)
            except ValueError as exc:
                cell_errors[field_key] = str(exc)

        result = RowResult(index=index, data=data, errors=cell_errors)
        if not cell_errors:
            try:
                result.data = validate_and_normalize(fields, data, partial=False)
            except FieldValidationError as exc:
                result.errors = exc.errors
        results.append(result)

    return results
