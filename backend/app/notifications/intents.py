import uuid
from dataclasses import dataclass


@dataclass
class NotificationIntent:
    """Ce que le moteur d'alertes produit : destinataire, gabarit, données,
    priorité — indépendant du canal (cahier des charges §8.6). Un porteur ne fait
    que le transformer en envoi réel.
    """

    recipient_user_id: uuid.UUID
    title: str
    body: str
    related_alert_id: uuid.UUID | None = None
    priority: str = "normal"
