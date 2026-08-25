import csv
import io

from app.models.model_definition import ModelDefinition
from app.models.record import Record


def export_records_csv(model: ModelDefinition, records: list[Record], *, columns: list[str] | None = None) -> str:
    """Cahier des charges §9 : « la vue courante en tableur ». `columns` reprend
    l'ordre demandé (typiquement celui d'une vue enregistrée) ; par défaut, les
    champs marqués "affiché dans la liste" (§5.3).
    """
    field_by_key = {f.key: f for f in model.field_definitions}
    keys = columns or [f.key for f in model.field_definitions if f.show_in_list] or list(field_by_key)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["id", "statut", *[field_by_key[k].label if k in field_by_key else k for k in keys], "créé le"])

    for record in records:
        row = [str(record.id), record.status or ""]
        for key in keys:
            row.append(_format_value(record.data.get(key)))
        row.append(record.created_at.isoformat())
        writer.writerow(row)

    return buffer.getvalue()


def _format_value(value) -> str:
    if value is None:
        return ""
    if isinstance(value, dict):
        if "due_date" in value:
            return value["due_date"]
        if "record_id" in value:
            return str(value["record_id"])
        if "document_id" in value:
            return str(value["document_id"])
        if "document_ids" in value:
            return ", ".join(str(i) for i in value["document_ids"])
        if "lat" in value and "lng" in value:
            return f"{value['lat']}, {value['lng']}"
        return str(value)
    if isinstance(value, list):
        return ", ".join(str(v) for v in value)
    if isinstance(value, bool):
        return "oui" if value else "non"
    return str(value)
