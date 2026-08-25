"""Bibliothèque de modèles prêts à l'emploi (cahier des charges §5.6). Activer un
modèle en fait une copie propre à l'organisation, plus aucun lien vivant vers le
gabarit — voir ModelDefinitionService / seed_model_from_template.

Seuls les quatre modèles de nature "actif suivi" sont livrés avec le lot 1.
Stock de gaz et Vêtements sont de nature "article de stock" (§5.5) : les seeder
avant que le lot 2 ne construise dépôts/mouvements/seuils créerait des fiches qui
ont l'air de suivre un stock sans réellement le faire — contraire au principe des
états d'échec honnêtes. Ils rejoignent la bibliothèque avec le lot 2.
"""

from app.dynamic_fields.types import FieldType
from app.models.model_definition import RecordNature

TEMPLATES: dict[str, dict] = {
    "vehicle": {
        "name_singular": "Véhicule",
        "name_plural": "Véhicules",
        "icon": "car",
        "color": "#0E6E63",
        "nature": RecordNature.ASSET,
        "title_field_key": "immatriculation",
        "status_options": ["en_service", "immobilise", "en_reparation", "cede", "archive"],
        "fields": [
            {
                "key": "immatriculation",
                "label": "Immatriculation",
                "field_type": FieldType.TEXT_SHORT,
                "is_required": True,
                "is_unique": True,
                "show_in_list": True,
                "is_filterable": True,
            },
            {"key": "photos", "label": "Photos", "field_type": FieldType.PHOTO},
            {
                "key": "marque",
                "label": "Marque",
                "field_type": FieldType.TEXT_SHORT,
                "show_in_list": True,
                "is_filterable": True,
            },
            {"key": "modele", "label": "Modèle", "field_type": FieldType.TEXT_SHORT},
            {
                "key": "carburant",
                "label": "Carburant",
                "field_type": FieldType.SELECT,
                "select_options": [
                    {"value": "essence", "label": "Essence"},
                    {"value": "gasoil", "label": "Gasoil"},
                    {"value": "gpl", "label": "GPL"},
                ],
            },
            {"key": "kilometrage", "label": "Kilométrage", "field_type": FieldType.NUMBER, "number_unit": "km"},
            {"key": "carte_grise", "label": "Carte grise", "field_type": FieldType.DOCUMENT},
            {
                "key": "visite_technique",
                "label": "Visite technique",
                "field_type": FieldType.DUE_DATE,
                "show_in_list": True,
                "is_filterable": True,
            },
            {
                "key": "assurance",
                "label": "Assurance",
                "field_type": FieldType.DUE_DATE,
                "show_in_list": True,
                "is_filterable": True,
            },
            {"key": "vignette", "label": "Vignette", "field_type": FieldType.DUE_DATE},
            {"key": "chauffeur", "label": "Chauffeur affecté", "field_type": FieldType.RECORD_LINK},
        ],
    },
    "personnel": {
        "name_singular": "Employé",
        "name_plural": "Personnel",
        "icon": "user",
        "color": "#0E6E63",
        "nature": RecordNature.ASSET,
        "title_field_key": "nom_complet",
        "status_options": ["actif", "conge", "suspendu", "sorti"],
        "fields": [
            {
                "key": "nom_complet",
                "label": "Nom complet",
                "field_type": FieldType.TEXT_SHORT,
                "is_required": True,
                "show_in_list": True,
            },
            {
                "key": "poste",
                "label": "Poste",
                "field_type": FieldType.TEXT_SHORT,
                "show_in_list": True,
                "is_filterable": True,
            },
            {"key": "telephone", "label": "Téléphone", "field_type": FieldType.PHONE},
            {"key": "piece_identite", "label": "Pièce d'identité", "field_type": FieldType.DOCUMENT},
            {
                "key": "fin_contrat",
                "label": "Fin de contrat",
                "field_type": FieldType.DUE_DATE,
                "show_in_list": True,
            },
            {
                "key": "visite_medicale",
                "label": "Visite médicale",
                "field_type": FieldType.DUE_DATE,
                "show_in_list": True,
            },
            {"key": "permis_conduire", "label": "Permis de conduire", "field_type": FieldType.DUE_DATE},
        ],
    },
    "extinguisher": {
        "name_singular": "Extincteur",
        "name_plural": "Extincteurs",
        "icon": "flame",
        "color": "#B3261E",
        "nature": RecordNature.ASSET,
        "title_field_key": "numero",
        "status_options": ["en_service", "hors_service", "archive"],
        "fields": [
            {
                "key": "numero",
                "label": "Numéro",
                "field_type": FieldType.TEXT_SHORT,
                "is_required": True,
                "is_unique": True,
                "show_in_list": True,
            },
            {
                "key": "emplacement",
                "label": "Emplacement",
                "field_type": FieldType.TEXT_SHORT,
                "show_in_list": True,
                "is_filterable": True,
            },
            {
                "key": "type_extincteur",
                "label": "Type",
                "field_type": FieldType.SELECT,
                "select_options": [
                    {"value": "eau", "label": "Eau"},
                    {"value": "poudre", "label": "Poudre"},
                    {"value": "co2", "label": "CO2"},
                ],
            },
            {"key": "date_recharge", "label": "Date de recharge", "field_type": FieldType.DATE},
            {
                "key": "date_controle",
                "label": "Contrôle",
                "field_type": FieldType.DUE_DATE,
                "show_in_list": True,
                "is_filterable": True,
            },
        ],
    },
    "contract": {
        "name_singular": "Contrat",
        "name_plural": "Contrats",
        "icon": "file-text",
        "color": "#0E6E63",
        "nature": RecordNature.ASSET,
        "title_field_key": "objet",
        "status_options": ["actif", "expire", "resilie"],
        "fields": [
            {
                "key": "objet",
                "label": "Objet",
                "field_type": FieldType.TEXT_SHORT,
                "is_required": True,
                "show_in_list": True,
            },
            {
                "key": "partie",
                "label": "Partie contractante",
                "field_type": FieldType.TEXT_SHORT,
                "show_in_list": True,
            },
            {"key": "document_signe", "label": "Document signé", "field_type": FieldType.DOCUMENT},
            {"key": "date_debut", "label": "Date de début", "field_type": FieldType.DATE},
            {
                "key": "date_fin",
                "label": "Date de fin",
                "field_type": FieldType.DUE_DATE,
                "show_in_list": True,
                "is_filterable": True,
            },
            {
                "key": "preavis_jours",
                "label": "Préavis (jours)",
                "field_type": FieldType.NUMBER,
                "number_unit": "jours",
            },
        ],
    },
}
