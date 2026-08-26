import uuid

from pydantic import BaseModel


class SearchHitOut(BaseModel):
    record_id: uuid.UUID
    model_definition_id: uuid.UUID
    model_name: str
    title: str


class ImportMappingSuggestion(BaseModel):
    headers: list[str]
    suggested_mapping: dict[str, str | None]
    preview_rows: list[dict[str, str]]
    total_rows: int
    valid_row_count: int
    invalid_row_count: int
    sample_errors: list[dict]
    # Format réellement lu et, pour un classeur, la feuille retenue : seule la première
    # est importée, les autres sont nommées ici pour que l'écran le dise (§9).
    source_format: str = "csv"
    sheet_name: str | None = None
    ignored_sheet_names: list[str] = []


class ImportCommitResult(BaseModel):
    created: int
    failed: int
    errors: list[dict]
