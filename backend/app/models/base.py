import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Uuid, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class UUIDPrimaryKeyMixin:
    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)


def utcnow() -> datetime:
    """Callable Python partagé par tous les `onupdate` de la base — voir
    TimestampMixin pour pourquoi ce n'est délibérément pas `func.now()`.
    """
    return datetime.now(UTC)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # `onupdate` côté Python plutôt qu'une fonction SQL (`func.now()`) : un
    # onupdate SQL laisse la colonne "expirée" après un UPDATE — sa relecture
    # dans la même requête (pour sérialiser la réponse) déclenche un rechargement
    # hors du flux async attendu par SQLAlchemy ("MissingGreenlet"). Un callable
    # Python fixe la valeur immédiatement en mémoire, sans aller-retour DB.
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=utcnow
    )


class OrgScopedMixin:
    """Tables portant cette classe sont protégées par une politique RLS Postgres
    (voir la migration initiale) : `organization_id = current_setting('app.current_org_id')`.
    Le cloisonnement ne dépend donc pas d'un WHERE ajouté à la main dans chaque requête
    (cahier des charges §14.1, §15).
    """

    organization_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
