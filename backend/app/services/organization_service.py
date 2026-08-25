import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Action, role_can
from app.models.membership import Membership, OrgRole
from app.models.organization import Organization
from app.models.user import User
from app.repositories.membership import MembershipRepository
from app.repositories.organization import OrganizationRepository
from app.repositories.user import UserRepository
from app.services.audit_service import AuditService


class PermissionDeniedError(Exception):
    pass


class MembershipService:
    """Suppose le contexte RLS déjà établi (get_org_context) : organization_id vient
    du membership de l'appelant, jamais d'une entrée utilisateur.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.memberships = MembershipRepository(db)
        self.users = UserRepository(db)
        self.audit = AuditService(db)

    async def list_members(self, organization_id: uuid.UUID) -> list[Membership]:
        return await self.memberships.list_for_org(organization_id)

    async def invite(
        self,
        *,
        organization_id: uuid.UUID,
        actor: User,
        actor_membership: Membership,
        email: str,
        full_name: str,
        role: OrgRole,
        can_view_amounts: bool,
    ) -> Membership:
        if not role_can(actor_membership.role, Action.MANAGE_MEMBERS):
            raise PermissionDeniedError("Seul un administrateur peut inviter un membre.")

        email = email.strip().lower()
        user = await self.users.get_by_email(email)
        if user is None:
            # Compte "invité" : sans identifiants tant qu'il n'est pas réclamé
            # (première connexion Google ou mot de passe défini) — voir AuthService.
            user = await self.users.create(
                User(email=email, full_name=full_name, is_active=False)
            )

        existing = await self.memberships.get_for_user_and_org(user.id, organization_id)
        if existing is not None:
            raise ValueError("Cette personne appartient déjà à l'organisation.")

        membership = await self.memberships.create(
            Membership(
                organization_id=organization_id,
                user_id=user.id,
                role=role,
                can_view_amounts=can_view_amounts,
                is_active=True,
                invited_by_user_id=actor.id,
                invited_at=datetime.now(UTC),
            )
        )
        await self.audit.record(
            organization_id=organization_id,
            actor_user_id=actor.id,
            action="membership.invite",
            entity_type="membership",
            entity_id=membership.id,
            new_value={"email": email, "role": role.value},
        )
        return membership

    async def update(
        self,
        *,
        organization_id: uuid.UUID,
        actor: User,
        actor_membership: Membership,
        membership_id: uuid.UUID,
        role: OrgRole | None,
        can_view_amounts: bool | None,
        is_active: bool | None,
    ) -> Membership:
        if not role_can(actor_membership.role, Action.MANAGE_MEMBERS):
            raise PermissionDeniedError("Seul un administrateur peut modifier un membre.")

        target = await self.memberships.get(membership_id)
        if target is None or target.organization_id != organization_id:
            raise ValueError("Membre introuvable.")

        old_value = {
            "role": target.role.value,
            "can_view_amounts": target.can_view_amounts,
            "is_active": target.is_active,
        }
        if role is not None:
            target.role = role
        if can_view_amounts is not None:
            target.can_view_amounts = can_view_amounts
        if is_active is not None:
            target.is_active = is_active
        target = await self.memberships.save(target)

        await self.audit.record(
            organization_id=organization_id,
            actor_user_id=actor.id,
            action="membership.update",
            entity_type="membership",
            entity_id=target.id,
            old_value=old_value,
            new_value={
                "role": target.role.value,
                "can_view_amounts": target.can_view_amounts,
                "is_active": target.is_active,
            },
        )
        return target


class OrganizationService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.orgs = OrganizationRepository(db)
        self.audit = AuditService(db)

    async def list_for_user(self, user_id: uuid.UUID) -> list[tuple[Organization, Membership]]:
        return await self.orgs.list_for_user(user_id)

    async def update(
        self, *, organization: Organization, actor: User, actor_membership: Membership, **changes
    ) -> Organization:
        if not role_can(actor_membership.role, Action.MANAGE_MEMBERS):
            raise PermissionDeniedError("Seul un administrateur peut modifier l'organisation.")

        old_value = {
            "name": organization.name,
            "sector": organization.sector,
            "currency_code": organization.currency_code,
            "timezone": organization.timezone,
        }
        for field, value in changes.items():
            if value is not None:
                setattr(organization, field, value)
        organization = await self.orgs.save(organization)

        await self.audit.record(
            organization_id=organization.id,
            actor_user_id=actor.id,
            action="organization.update",
            entity_type="organization",
            entity_id=organization.id,
            old_value=old_value,
            new_value={k: getattr(organization, k) for k in old_value},
        )
        return organization
