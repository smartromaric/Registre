"""Import initial depuis un classeur Excel (cahier des charges §9, §18.1 — « Elle
dépose son fichier Excel »).

Le classeur de test est construit en mémoire avec openpyxl : pas de fixture binaire
au dépôt, donc rien qu'on ne puisse relire ni régénérer.
"""

import datetime as dt
import io

import pytest
from openpyxl import Workbook

from app.dynamic_fields.types import FieldType
from app.models.model_definition import FieldDefinition
from app.services.import_service import (
    ImportParseError,
    build_rows,
    parse_spreadsheet,
)


def _fields() -> list[FieldDefinition]:
    return [
        FieldDefinition(key="immatriculation", label="Immatriculation", field_type=FieldType.TEXT_SHORT, is_required=True),
        FieldDefinition(key="marque", label="Marque", field_type=FieldType.TEXT_SHORT),
        FieldDefinition(key="kilometrage", label="Kilométrage", field_type=FieldType.NUMBER),
        FieldDefinition(key="visite_technique", label="Visite technique", field_type=FieldType.DATE),
        FieldDefinition(key="en_service", label="En service", field_type=FieldType.BOOLEAN),
    ]


_MAPPING = {
    "Immatriculation": "immatriculation",
    "Marque": "marque",
    "Kilométrage": "kilometrage",
    "Visite technique": "visite_technique",
    "En service": "en_service",
}


def _xlsx(rows: list[list], title: str = "Parc", extra_sheets: list[str] | None = None) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = title
    for row in rows:
        sheet.append(row)
    for name in extra_sheets or []:
        workbook.create_sheet(name)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def test_xlsx_produces_the_same_rows_as_the_equivalent_csv():
    """Le format d'entrée ne doit rien changer au résultat : mêmes fiches, mêmes erreurs."""
    headers = ["Immatriculation", "Marque", "Kilométrage", "Visite technique", "En service"]
    xlsx = _xlsx(
        [
            headers,
            # Types natifs Excel : nombre, date, booléen — pas des chaînes.
            ["CE 456 AB", "Toyota", 120000, dt.datetime(2026, 3, 14), True],
            ["LT 789 CD", "Hyundai", 84500.5, dt.date(2026, 7, 1), False],
        ]
    )
    csv_bytes = (
        "Immatriculation,Marque,Kilométrage,Visite technique,En service\r\n"
        "CE 456 AB,Toyota,120000,2026-03-14,oui\r\n"
        "LT 789 CD,Hyundai,84500.5,2026-07-01,non\r\n"
    ).encode()

    from_xlsx = parse_spreadsheet(xlsx, "parc.xlsx", None)
    from_csv = parse_spreadsheet(csv_bytes, "parc.csv", "text/csv")

    assert from_xlsx.headers == from_csv.headers == headers
    assert from_xlsx.rows == from_csv.rows

    fields = _fields()
    rows_xlsx = build_rows(from_xlsx.rows, _MAPPING, fields)
    rows_csv = build_rows(from_csv.rows, _MAPPING, fields)

    assert [(r.index, r.data, r.errors) for r in rows_xlsx] == [(r.index, r.data, r.errors) for r in rows_csv]
    assert all(r.is_valid for r in rows_xlsx)
    assert rows_xlsx[0].data == {
        "immatriculation": "CE 456 AB",
        "marque": "Toyota",
        "kilometrage": 120000.0,
        "visite_technique": "2026-03-14",
        "en_service": True,
    }


def test_date_cells_are_normalised_to_iso_dates():
    """Le piège classique du .xlsx : openpyxl rend un datetime, le validateur veut
    « AAAA-MM-JJ ». Une cellule mise en forme en date est horodatée à minuit."""
    sheet = parse_spreadsheet(
        _xlsx(
            [
                ["Immatriculation", "Visite technique"],
                ["CE 456 AB", dt.datetime(2026, 3, 14, 0, 0)],
                ["LT 789 CD", dt.date(2026, 12, 31)],
                # Une cellule date+heure : l'heure est écartée, il n'existe pas de
                # champ « date et heure » dans le moteur de champs (§5.2).
                ["MN 111 ZZ", dt.datetime(2026, 1, 5, 16, 45)],
            ]
        ),
        "parc.xlsx",
        None,
    )

    assert [r["Visite technique"] for r in sheet.rows] == ["2026-03-14", "2026-12-31", "2026-01-05"]

    rows = build_rows(sheet.rows, {"Immatriculation": "immatriculation", "Visite technique": "visite_technique"}, _fields())
    assert all(r.is_valid for r in rows), [r.errors for r in rows]
    assert rows[0].data["visite_technique"] == "2026-03-14"


def test_numeric_boolean_and_empty_cells_are_normalised():
    sheet = parse_spreadsheet(
        _xlsx(
            [
                ["Immatriculation", "Kilométrage", "En service", "Marque"],
                # 12345.0 est ce qu'Excel stocke pour un entier saisi 12345 : le
                # « .0 » ne doit pas ressortir, surtout dans un champ texte.
                ["CE 456 AB", 12345.0, True, None],
                ["LT 789 CD", 84500.5, False, "Hyundai"],
            ]
        ),
        "parc.xlsx",
        None,
    )

    assert sheet.rows[0]["Kilométrage"] == "12345"
    assert sheet.rows[1]["Kilométrage"] == "84500.5"
    assert sheet.rows[0]["En service"] == "oui"
    assert sheet.rows[1]["En service"] == "non"
    assert sheet.rows[0]["Marque"] == ""

    rows = build_rows(sheet.rows, _MAPPING, _fields())
    assert rows[0].data["kilometrage"] == 12345.0
    assert rows[0].data["en_service"] is True
    # Cellule vide sur un champ facultatif : absente, pas une erreur.
    assert "marque" not in rows[0].data
    assert rows[0].is_valid


def test_only_the_first_worksheet_is_read_and_the_others_are_named():
    sheet = parse_spreadsheet(
        _xlsx(
            [["Immatriculation"], ["CE 456 AB"]],
            title="Parc 2026",
            extra_sheets=["Archives", "Notes"],
        ),
        "parc.xlsx",
        None,
    )

    assert sheet.source_format == "xlsx"
    assert sheet.sheet_name == "Parc 2026"
    # Nommées pour que l'écran puisse le dire — un utilisateur à 3 feuilles ne doit
    # pas croire que tout a été importé.
    assert sheet.ignored_sheet_names == ["Archives", "Notes"]
    assert len(sheet.rows) == 1


def test_trailing_empty_rows_are_not_counted_as_failures():
    sheet = parse_spreadsheet(
        _xlsx(
            [
                ["Immatriculation", "Marque"],
                ["CE 456 AB", "Toyota"],
                [None, None],
                ["", ""],
            ]
        ),
        "parc.xlsx",
        None,
    )
    assert len(sheet.rows) == 1

    rows = build_rows(sheet.rows, {"Immatriculation": "immatriculation"}, _fields())
    assert len(rows) == 1 and rows[0].is_valid


def test_blank_and_duplicate_headers_stay_addressable():
    sheet = parse_spreadsheet(
        _xlsx([["Immatriculation", None, "Marque", "Marque"], ["CE 456 AB", "x", "Toyota", "Hyundai"]]),
        "parc.xlsx",
        None,
    )
    assert sheet.headers == ["Immatriculation", "Colonne 2", "Marque", "Marque (2)"]
    assert sheet.rows[0]["Marque"] == "Toyota"
    assert sheet.rows[0]["Marque (2)"] == "Hyundai"


def test_xlsx_detected_without_a_filename_via_content_type_and_magic():
    payload = _xlsx([["Immatriculation"], ["CE 456 AB"]])
    by_content_type = parse_spreadsheet(
        payload, None, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    by_magic = parse_spreadsheet(payload, None, "application/octet-stream")
    assert by_content_type.source_format == by_magic.source_format == "xlsx"


def test_legacy_xls_is_refused_with_an_explicit_message():
    with pytest.raises(ImportParseError) as excinfo:
        parse_spreadsheet(b"\xd0\xcf\x11\xe0oldbiff", "parc.xls", "application/vnd.ms-excel")
    assert ".xlsx" in str(excinfo.value)


def test_corrupt_xlsx_is_refused_rather_than_crashing():
    with pytest.raises(ImportParseError):
        parse_spreadsheet(b"PK\x03\x04not-a-real-workbook", "parc.xlsx", None)


def test_non_utf8_csv_is_refused_with_an_explicit_message():
    with pytest.raises(ImportParseError):
        parse_spreadsheet("Immatriculation\r\nCE 456 ÀB\r\n".encode("latin-1"), "parc.csv", "text/csv")


def test_csv_parsing_is_unchanged():
    """Garde-fou anti-régression : le chemin CSV existant ne doit rien perdre."""
    sheet = parse_spreadsheet(
        "﻿Immatriculation,Marque\r\nCE 456 AB,Toyota\r\n".encode(),
        "parc.csv",
        "text/csv",
    )
    assert sheet.source_format == "csv"
    assert sheet.sheet_name is None
    assert sheet.headers == ["Immatriculation", "Marque"]
    assert sheet.rows == [{"Immatriculation": "CE 456 AB", "Marque": "Toyota"}]
