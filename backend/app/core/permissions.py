"""Traduction directe de la matrice des droits du cahier des charges (§4.2) en code.
Gardée volontairement plate et lisible : un ajout de droit doit se voir d'un coup d'oeil,
pas se déduire d'une hiérarchie de rôles implicite.
"""

import enum

from app.models.membership import OrgRole


class Action(str, enum.Enum):
    MANAGE_MODELS = "manage_models"
    CREATE_EDIT_RECORD = "create_edit_record"
    ARCHIVE_RECORD = "archive_record"
    STOCK_MOVEMENT = "stock_movement"
    VALIDATE_INVENTORY = "validate_inventory"
    VIEW_AMOUNTS = "view_amounts"  # soumis en plus à Membership.can_view_amounts pour OPERATOR
    CONFIGURE_ALERTS = "configure_alerts"
    MANAGE_MEMBERS = "manage_members"
    MANAGE_SUBSCRIPTION = "manage_subscription"
    EXPORT_DATA = "export_data"
    VIEW_AUDIT_LOG = "view_audit_log"


_MATRIX: dict[Action, set[OrgRole]] = {
    Action.MANAGE_MODELS: {OrgRole.ADMIN},
    # OPERATOR = partiel, voir service
    Action.CREATE_EDIT_RECORD: {OrgRole.ADMIN, OrgRole.MANAGER, OrgRole.OPERATOR},
    Action.ARCHIVE_RECORD: {OrgRole.ADMIN, OrgRole.MANAGER},
    Action.STOCK_MOVEMENT: {OrgRole.ADMIN, OrgRole.MANAGER, OrgRole.OPERATOR},
    Action.VALIDATE_INVENTORY: {OrgRole.ADMIN, OrgRole.MANAGER},
    Action.VIEW_AMOUNTS: {OrgRole.ADMIN, OrgRole.MANAGER, OrgRole.OPERATOR, OrgRole.READER},
    Action.CONFIGURE_ALERTS: {OrgRole.ADMIN, OrgRole.MANAGER},
    Action.MANAGE_MEMBERS: {OrgRole.ADMIN},
    Action.MANAGE_SUBSCRIPTION: {OrgRole.ADMIN},
    Action.EXPORT_DATA: {OrgRole.ADMIN, OrgRole.MANAGER, OrgRole.READER},
    Action.VIEW_AUDIT_LOG: {OrgRole.ADMIN},
}


def role_can(role: OrgRole, action: Action) -> bool:
    return role in _MATRIX[action]
