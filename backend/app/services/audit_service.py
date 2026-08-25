import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


class AuditService:
    """Suppose que `SET LOCAL app.current_org_id` est déjà positionné sur la session
    (voir core/deps.py::get_org_context) : la table audit_logs est protégée par RLS.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def record(
        self,
        *,
        organization_id: uuid.UUID,
        actor_user_id: uuid.UUID | None,
        action: str,
        entity_type: str,
        entity_id: uuid.UUID | None = None,
        old_value: dict | None = None,
        new_value: dict | None = None,
    ) -> AuditLog:
        entry = AuditLog(
            organization_id=organization_id,
            actor_user_id=actor_user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            old_value=old_value,
            new_value=new_value,
        )
        self.db.add(entry)
        await self.db.flush()
        return entry
