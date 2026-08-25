from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_role
from app.models.audit_log import AuditLog
from app.models.membership import Membership, OrgRole
from app.schemas.audit_log import AuditLogOut

router = APIRouter(prefix="/organizations/{organization_id}/audit-log", tags=["audit"])


@router.get("", response_model=list[AuditLogOut])
async def list_audit_log(
    membership: Membership = Depends(require_role(OrgRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[AuditLogOut]:
    if limit <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "limit doit être positif.")
    stmt = (
        select(AuditLog)
        .where(AuditLog.organization_id == membership.organization_id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    return [AuditLogOut.model_validate(row) for row in result.scalars().all()]
