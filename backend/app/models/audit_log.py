import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, OrgScopedMixin, UUIDPrimaryKeyMixin


class AuditLog(UUIDPrimaryKeyMixin, OrgScopedMixin, Base):
    """Journal d'audit non modifiable (cahier des charges §14.2) : toute création,
    modification, suppression et export y est inscrite. L'immutabilité est imposée
    au niveau base par un trigger (voir la migration initiale), pas seulement par
    l'absence de route UPDATE/DELETE.
    """

    __tablename__ = "audit_logs"

    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(120), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True))
    old_value: Mapped[dict | None] = mapped_column(JSONB)
    new_value: Mapped[dict | None] = mapped_column(JSONB)
    # §11.4 : « toute écriture passe par un journal d'opérations » — c'est ce
    # journal d'audit qui en tient lieu (voir PRODUCT.md §10.6). Un identifiant
    # d'opération généré côté client permet à RecordService de reconnaître une
    # resoumission (coupure réseau après écriture, avant la réponse) et de la
    # traiter sans effet plutôt que de la rejouer une seconde fois.
    client_operation_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
