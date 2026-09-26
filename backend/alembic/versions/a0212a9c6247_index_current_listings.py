"""index current listings"""

from collections.abc import Sequence

from alembic import op

revision: str = "a0212a9c6247"
down_revision: str | None = "65bc49c29045"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_listings_current", "listings", ["status", "last_confirmed_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_listings_current", table_name="listings")
