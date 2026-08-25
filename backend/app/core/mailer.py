import smtplib
from email.message import EmailMessage

from app.core.config import get_settings


class MailerNotConfiguredError(Exception):
    """Levée plutôt que d'avaler l'envoi en silence — un e-mail non configuré doit
    le dire, pas se comporter comme un faux succès (principe des états d'échec honnêtes).
    """


def send_email(*, to: str, subject: str, body: str) -> None:
    settings = get_settings()
    if not settings.smtp_host:
        raise MailerNotConfiguredError("Aucun serveur SMTP n'est configuré sur cet environnement.")

    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        if settings.smtp_use_tls:
            server.starttls()
        if settings.smtp_username and settings.smtp_password:
            server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(message)
