"""En-tête `Content-Disposition` de l'export CSV.

Le nom du fichier vient du nom du modèle, choisi librement par le client. Un
en-tête HTTP ne transporte en clair que du latin-1 : la première version écrivait
`filename="{nom}.csv"` sans précaution et faisait donc lever un
`UnicodeEncodeError` — une erreur 500 à l'export — dès qu'une organisation
nommait un modèle hors de ce jeu de caractères. Le cas n'a rien d'exotique pour
un produit multi-pays.
"""

from app.api.v1.routers.records import _content_disposition


def _is_header_safe(value: str) -> bool:
    """Reproduit la contrainte réelle : Starlette encode les en-têtes en latin-1."""
    try:
        value.encode("latin-1")
    except UnicodeEncodeError:
        return False
    return True


def test_ascii_filename_is_left_alone():
    header = _content_disposition("Vehicules.csv")
    assert 'filename="Vehicules.csv"' in header
    assert _is_header_safe(header)


def test_accented_filename_keeps_a_readable_ascii_fallback():
    header = _content_disposition("Véhicules.csv")
    # Le repli est translittéré, pas vidé : « Vehicules.csv » reste lisible.
    assert 'filename="Vehicules.csv"' in header
    # Et la forme UTF-8 conserve l'accent pour les navigateurs actuels.
    assert "filename*=UTF-8''V%C3%A9hicules.csv" in header
    assert _is_header_safe(header)


def test_non_latin1_filename_does_not_break_the_header():
    """Le cas qui produisait une 500 : rien d'ASCII à conserver."""
    header = _content_disposition("Прайс.csv")
    assert _is_header_safe(header)
    assert "filename*=UTF-8''" in header
    # Aucun repli exploitable : on en fournit un générique plutôt que vide.
    assert 'filename="' in header


def test_quotes_cannot_escape_the_header():
    """Un nom de modèle contenant un guillemet fermerait l'attribut et
    permettrait d'injecter une directive supplémentaire dans l'en-tête."""
    header = _content_disposition('a"; attachment; filename="pirate.csv')
    assert header.count('filename="') == 1
    assert _is_header_safe(header)


def test_control_characters_cannot_inject_a_header():
    """Un saut de ligne est de l'ASCII : il survivait au filtre `encode("ascii")`
    et aurait permis d'ajouter un en-tête HTTP entier à la réponse."""
    header = _content_disposition("rapport\r\nSet-Cookie: piege=1.csv")
    assert "\n" not in header
    assert "\r" not in header
    assert "Set-Cookie" not in header.split("filename*=")[0].replace("Set-Cookie: piege=1.csv", "")
    assert _is_header_safe(header)


def test_a_name_with_nothing_ascii_still_yields_a_usable_fallback():
    header = _content_disposition("🚚.csv")
    assert 'filename="export.csv"' in header
    assert _is_header_safe(header)
