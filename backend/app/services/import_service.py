"""Reprise d'un fichier tableur existant (cahier des charges §9 : « Indispensable :
aucun client ne re-saisira 200 véhicules à la main. ») — deux temps, comme demandé :
correspondance des colonnes puis aperçu avant validation (§18.1, l'exemple d'Awa).

Deux formats acceptés : CSV (UTF-8) et classeur Excel .xlsx. Dans les deux cas la
mécanique de fond est identique — on ramène le fichier à des cellules *texte*, puis
`build_rows` applique la correspondance de colonnes et la validation des champs.

Limites assumées, énoncées à l'écran plutôt que silencieuses :
- .xlsx : seule la **première feuille** est lue, sa première ligne faisant les en-têtes.
  Les autres feuilles sont nommées dans la réponse pour que l'utilisateur le sache.
- .xls (ancien format binaire Excel) n'est pas pris en charge — refusé avec un message
  explicite, pas parsé de travers.
- Les formules sont lues via leur dernier résultat *enregistré par Excel* (`data_only`) :
  un fichier généré par un outil tiers qui n'a jamais calculé ses formules donnera des
  cellules vides, signalées comme telles par la validation, jamais inventées.
"""

import csv
import datetime as dt
import io
import unicodedata
import zipfile
from dataclasses import dataclass, field
from typing import Any

import openpyxl

from app.dynamic_fields.types import FieldType
from app.dynamic_fields.validation import FieldValidationError, validate_and_normalize
from app.models.model_definition import FieldDefinition

_XLSX_CONTENT_TYPES = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel.sheet.macroEnabled.12",
}
# Signature ZIP : un .xlsx est une archive. Sert de garde-fou quand le navigateur
# envoie un content-type générique (application/octet-stream) sur un glisser-déposer.
_ZIP_MAGIC = b"PK\x03\x04"
# Signature OLE2 : les vieux .xls, que openpyxl ne sait pas lire.
_OLE2_MAGIC = b"\xd0\xcf\x11\xe0"


class ImportParseError(ValueError):
    """Fichier illisible — message destiné à être affiché tel quel à l'utilisateur."""


def _normalize(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return "".join(c for c in decomposed.lower() if c.isalnum())


@dataclass
class ParsedSheet:
    """Résultat de lecture, indépendant du format d'origine."""

    headers: list[str]
    rows: list[dict[str, str]]
    source_format: str  # "csv" | "xlsx"
    sheet_name: str | None = None
    ignored_sheet_names: list[str] = field(default_factory=list)


def parse_csv(content: bytes) -> tuple[list[str], list[dict[str, str]]]:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ImportParseError(
            "Le fichier CSV n'est pas encodé en UTF-8. Réenregistrez-le en UTF-8, "
            "ou envoyez directement le fichier Excel (.xlsx)."
        ) from exc
    reader = csv.DictReader(io.StringIO(text))
    return list(reader.fieldnames or []), list(reader)


def _cell_to_text(value: Any) -> str:
    """Ramène une cellule openpyxl au texte que `build_rows` sait déjà consommer.

    C'est le point sensible du .xlsx : openpyxl rend de *vrais* objets Python
    (datetime, float, bool), là où la validation attend des chaînes — une date
    au format AAAA-MM-JJ, notamment.
    """
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    # bool avant int : en Python bool est une sous-classe d'int.
    if isinstance(value, bool):
        return "oui" if value else "non"
    if isinstance(value, dt.datetime):
        # Pas de type « date + heure » dans le moteur de champs (§5.2) : on garde la
        # date seule. Excel horodate à minuit toute cellule mise en forme en date.
        return value.date().isoformat()
    if isinstance(value, dt.date):
        return value.isoformat()
    if isinstance(value, dt.time):
        return value.strftime("%H:%M")
    if isinstance(value, dt.timedelta):
        return str(value)
    if isinstance(value, float):
        # Excel stocke tout nombre en flottant : un code « 12345 » revient en 12345.0.
        # `str(int(...))` évite le « .0 » parasite et la notation scientifique.
        if value.is_integer():
            return str(int(value))
        return str(value)
    return str(value)


def _visible_width(rows: list[tuple[Any, ...]]) -> int:
    """Largeur réelle des données : openpyxl surestime souvent le nombre de colonnes
    (mise en forme résiduelle sur des colonnes vides)."""
    width = 0
    for row in rows:
        for index in range(len(row) - 1, -1, -1):
            if _cell_to_text(row[index]).strip() != "":
                width = max(width, index + 1)
                break
    return width


def _build_headers(header_row: tuple[Any, ...], width: int) -> list[str]:
    headers: list[str] = []
    seen: dict[str, int] = {}
    for index in range(width):
        raw = header_row[index] if index < len(header_row) else None
        label = _cell_to_text(raw).strip() or f"Colonne {index + 1}"
        # Deux colonnes homonymes resteraient indistinguables dans l'écran de
        # correspondance : on suffixe pour que chacune reste mappable séparément.
        count = seen.get(label, 0) + 1
        seen[label] = count
        headers.append(label if count == 1 else f"{label} ({count})")
    return headers


def parse_xlsx(content: bytes) -> ParsedSheet:
    try:
        workbook = openpyxl.load_workbook(io.BytesIO(content), data_only=True, read_only=True)
    except (zipfile.BadZipFile, KeyError, ValueError) as exc:
        raise ImportParseError(
            "Ce classeur Excel est illisible ou endommagé. Réenregistrez-le au format .xlsx depuis Excel."
        ) from exc

    try:
        worksheets = list(workbook.worksheets)
        if not worksheets:
            raise ImportParseError("Ce classeur Excel ne contient aucune feuille de calcul.")

        sheet = worksheets[0]
        raw_rows = [row for row in sheet.iter_rows(values_only=True)]
        ignored = [ws.title for ws in worksheets[1:]]
        sheet_name = sheet.title
    finally:
        workbook.close()

    if not raw_rows:
        return ParsedSheet([], [], "xlsx", sheet_name=sheet_name, ignored_sheet_names=ignored)

    width = _visible_width(raw_rows)
    if width == 0:
        return ParsedSheet([], [], "xlsx", sheet_name=sheet_name, ignored_sheet_names=ignored)

    headers = _build_headers(raw_rows[0], width)

    rows: list[dict[str, str]] = []
    for raw_row in raw_rows[1:]:
        values = [_cell_to_text(raw_row[i]) if i < len(raw_row) else "" for i in range(width)]
        # Une feuille Excel traîne presque toujours des lignes vides après les données ;
        # les compter comme des lignes en erreur serait un faux négatif.
        if all(v.strip() == "" for v in values):
            continue
        rows.append(dict(zip(headers, values, strict=True)))

    return ParsedSheet(headers, rows, "xlsx", sheet_name=sheet_name, ignored_sheet_names=ignored)


def looks_like_xlsx(content: bytes, filename: str | None, content_type: str | None) -> bool:
    if filename and filename.lower().endswith((".xlsx", ".xlsm")):
        return True
    if content_type and content_type.split(";")[0].strip() in _XLSX_CONTENT_TYPES:
        return True
    return content.startswith(_ZIP_MAGIC)


def parse_spreadsheet(content: bytes, filename: str | None = None, content_type: str | None = None) -> ParsedSheet:
    """Point d'entrée unique des routes d'import : choisit le lecteur selon le format."""
    if content.startswith(_OLE2_MAGIC) or (filename and filename.lower().endswith(".xls")):
        raise ImportParseError(
            "Les fichiers .xls (ancien format Excel) ne sont pas pris en charge. "
            "Ouvrez le fichier dans Excel puis « Enregistrer sous » au format .xlsx."
        )
    if looks_like_xlsx(content, filename, content_type):
        return parse_xlsx(content)
    headers, rows = parse_csv(content)
    return ParsedSheet(headers, rows, "csv")


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
