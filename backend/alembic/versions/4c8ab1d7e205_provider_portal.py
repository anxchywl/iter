"""add provider ownership, submission workflow, and portal sessions"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "4c8ab1d7e205"
down_revision: str | None = "f2a6c1d93b47"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("key", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.CheckConstraint("length(trim(key)) > 0", name="organization_key_nonempty"),
        sa.CheckConstraint("length(trim(name)) > 0", name="organization_name_nonempty"),
        sa.CheckConstraint("status IN ('active', 'suspended')", name="organization_status"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key"),
    )
    op.add_column("listings", sa.Column("organization_id", sa.String(length=36)))
    op.add_column(
        "listings",
        sa.Column(
            "submission_status", sa.String(length=24), nullable=False, server_default="draft"
        ),
    )
    op.add_column("listings", sa.Column("submission_note", sa.String(length=300)))
    op.create_foreign_key(
        "fk_listings_organization_id", "listings", "organizations", ["organization_id"], ["id"]
    )
    op.create_check_constraint(
        "listing_submission_status",
        "listings",
        "submission_status IN ('draft', 'pending', 'changes_requested', 'approved')",
    )
    op.create_index(
        "ix_listings_provider_queue",
        "listings",
        ["organization_id", "submission_status", "id"],
    )
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


def downgrade() -> None:
    op.drop_index("ix_portal_sessions_expiry", table_name="portal_sessions")
    op.drop_table("portal_sessions")
    op.drop_index("ix_listings_provider_queue", table_name="listings")
    op.drop_constraint("listing_submission_status", "listings", type_="check")
    op.drop_constraint("fk_listings_organization_id", "listings", type_="foreignkey")
    op.drop_column("listings", "submission_note")
    op.drop_column("listings", "submission_status")
    op.drop_column("listings", "organization_id")
    op.drop_table("organizations")
