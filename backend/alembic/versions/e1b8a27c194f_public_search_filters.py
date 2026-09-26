"""index public date and comparable pay filters"""

from collections.abc import Sequence

from alembic import op

revision: str = "e1b8a27c194f"
down_revision: str | None = "d3b8679f3221"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_listings_public_dates", "listings", ["status", "work_start_date", "work_end_date"]
    )
    op.create_index(
        "ix_listings_public_pay",
        "listings",
        ["status", "wage_currency", "wage_basis", "wage_amount"],
    )


def downgrade() -> None:
    op.drop_index("ix_listings_public_pay", table_name="listings")
    op.drop_index("ix_listings_public_dates", table_name="listings")
