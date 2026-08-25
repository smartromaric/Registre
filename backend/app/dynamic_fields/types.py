"""Types de champs du moteur de fiches (cahier des charges §5.2). Le type Échéance
est le champ pivot du produit (§5.4) : il alimente le moteur d'alertes (app/alerts).
"""

import enum


class FieldType(str, enum.Enum):
    TEXT_SHORT = "text_short"
    TEXT_LONG = "text_long"
    NUMBER = "number"
    AMOUNT = "amount"
    DATE = "date"
    DUE_DATE = "due_date"  # Échéance : date de fin + justificatif + règle de rappel
    BOOLEAN = "boolean"
    SELECT = "select"
    DOCUMENT = "document"
    PHOTO = "photo"
    PHONE = "phone"
    RECORD_LINK = "record_link"
    POSITION = "position"
    CODE = "code"


# Paliers de rappel par défaut pour un champ Échéance (cahier des charges §8.1) :
# J-60, J-30, J-7, jour J, puis tous les 3 jours en retard.
DEFAULT_REMINDER_OFFSETS_DAYS = [60, 30, 7, 0]
DEFAULT_REMINDER_REPEAT_DAYS_OVERDUE = 3
