import uuid
from abc import ABC, abstractmethod

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.mailer import send_email
from app.models.notification import Notification
from app.notifications.intents import NotificationIntent


class NotificationCarrier(ABC):
    @abstractmethod
    async def send(self, intent: NotificationIntent) -> None: ...


class InAppCarrier(NotificationCarrier):
    """Alimente le centre de notifications et le badge (§8.5). Porteur toujours
    actif : c'est le canal minimum garanti, même sans e-mail ni WhatsApp configurés.
    """

    def __init__(self, db: AsyncSession, organization_id: uuid.UUID):
        self.db = db
        self.organization_id = organization_id

    async def send(self, intent: NotificationIntent) -> None:
        self.db.add(
            Notification(
                organization_id=self.organization_id,
                recipient_user_id=intent.recipient_user_id,
                title=intent.title,
                body=intent.body,
                related_alert_id=intent.related_alert_id,
            )
        )


class EmailCarrier(NotificationCarrier):
    """§8.5 : récapitulatif quotidien par e-mail, activable par utilisateur. Un
    SMTP non configuré lève une erreur explicite (voir core/mailer) plutôt que de
    prétendre avoir envoyé — jamais de faux succès silencieux.
    """

    def __init__(self, recipient_email: str):
        self.recipient_email = recipient_email

    async def send(self, intent: NotificationIntent) -> None:
        send_email(to=self.recipient_email, subject=intent.title, body=intent.body)


class WhatsAppCarrier(NotificationCarrier):
    """Hors périmètre v1 (cahier des charges §8.6, lot 6). Existe pour prouver que
    le moteur ne connaît pas le canal : brancher WhatsApp ne touchera que ce fichier.
    """

    async def send(self, intent: NotificationIntent) -> None:
        raise NotImplementedError("Le porteur WhatsApp arrive au lot 6 (cahier des charges §8.6).")
