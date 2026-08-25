"""clock_timestamp pour created_at des mouvements de stock

Revision ID: 0fdf30005a2b
Revises: b83491b7a801
Create Date: 2026-08-25 12:36:23.758238

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0fdf30005a2b'
down_revision: str | None = 'b83491b7a801'
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    # `now()` reste figé à l'heure de début de transaction pour toute la
    # transaction — une sortie FIFO multi-lots ou un transfert insèrent plusieurs
    # lignes dans le même flush et obtenaient donc un `created_at` identique,
    # rendant l'ordre "le plus récent d'abord" de l'historique des mouvements
    # non déterministe entre elles. `clock_timestamp()` avance à chaque instruction.
    op.alter_column(
        "stock_movements",
        "created_at",
        server_default=sa.text("clock_timestamp()"),
    )


def downgrade() -> None:
    op.alter_column(
        "stock_movements",
        "created_at",
        server_default=sa.text("now()"),
    )
