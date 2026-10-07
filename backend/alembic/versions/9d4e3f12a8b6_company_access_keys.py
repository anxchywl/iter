"""replace provider telegram membership with company access keys"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "9d4e3f12a8b6"
down_revision: str | None = "7b3d91e4a6c2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("website_url", sa.String(length=2048)))
    op.add_column("organizations", sa.Column("address", sa.String(length=300)))
    op.add_column("organizations", sa.Column("access_key_hash", sa.String(length=64)))
    op.add_column("organizations", sa.Column("access_key_hint", sa.String(length=12)))
    op.add_column("organizations", sa.Column("access_key_created_at", sa.DateTime(timezone=True)))
    op.add_column(
        "organizations",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.execute(
        "UPDATE organizations SET website_url = 'https://unknown.example', "
        "address = 'Address not recorded'"
    )
    op.alter_column("organizations", "website_url", nullable=False)
    op.alter_column("organizations", "address", nullable=False)
    op.create_unique_constraint(
        "uq_organizations_access_key_hash", "organizations", ["access_key_hash"]
    )
    op.create_check_constraint(
        "organization_address_nonempty", "organizations", "length(trim(address)) > 0"
    )
    op.create_check_constraint("organization_version_positive", "organizations", "version > 0")
    op.create_table(
        "portal_sessions",
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("actor", sa.String(length=80), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("organization_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("role = 'provider'", name="portal_session_role"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("token_hash"),
    )
    op.create_index("ix_portal_sessions_expiry", "portal_sessions", ["expires_at"])
    op.drop_index("ix_organization_members_organization", table_name="organization_members")
    op.drop_table("organization_members")


def downgrade() -> None:
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
    op.drop_index("ix_portal_sessions_expiry", table_name="portal_sessions")
    op.drop_table("portal_sessions")
    op.drop_constraint("organization_version_positive", "organizations", type_="check")
    op.drop_constraint("organization_address_nonempty", "organizations", type_="check")
    op.drop_constraint("uq_organizations_access_key_hash", "organizations", type_="unique")
    op.drop_column("organizations", "version")
    op.drop_column("organizations", "access_key_created_at")
    op.drop_column("organizations", "access_key_hint")
    op.drop_column("organizations", "access_key_hash")
    op.drop_column("organizations", "address")
    op.drop_column("organizations", "website_url")
