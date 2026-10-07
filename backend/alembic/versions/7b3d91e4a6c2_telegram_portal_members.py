"""replace portal access-key sessions with telegram organization members"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "7b3d91e4a6c2"
down_revision: str | None = "4c8ab1d7e205"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "organization_members",
        sa.Column("telegram_user_id", sa.BigInteger(), autoincrement=False, nullable=False),
        sa.Column("organization_id", sa.String(length=36), nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("telegram_user_id > 0", name="member_telegram_id_positive"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("telegram_user_id"),
    )
    op.create_index(
        "ix_organization_members_organization",
        "organization_members",
        ["organization_id", "telegram_user_id"],
    )
    # access-key sessions are short-lived credentials, so dropping them only signs people out
    op.drop_index("ix_portal_sessions_expiry", table_name="portal_sessions")
    op.drop_table("portal_sessions")


def downgrade() -> None:
    op.create_table(
        "portal_sessions",
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("actor", sa.String(length=80), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("organization_id", sa.String(length=36)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("role IN ('operator', 'provider')", name="portal_session_role"),
        sa.CheckConstraint(
            "(role = 'operator' AND organization_id IS NULL) OR "
            "(role = 'provider' AND organization_id IS NOT NULL)",
            name="portal_session_scope",
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("token_hash"),
    )
    op.create_index("ix_portal_sessions_expiry", "portal_sessions", ["expires_at"])
    op.drop_index("ix_organization_members_organization", table_name="organization_members")
    op.drop_table("organization_members")
