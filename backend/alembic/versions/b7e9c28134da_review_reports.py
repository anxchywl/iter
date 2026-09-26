"""review roles and report queue"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b7e9c28134da"
down_revision: str | None = "e1b8a27c194f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("reviews", sa.Column("role", sa.String(length=80), nullable=True))
    op.execute(
        "UPDATE reviews SET role = left(listings.role, 80) "
        "FROM listings WHERE reviews.listing_id = listings.id"
    )
    op.alter_column("reviews", "role", nullable=False)
    op.add_column("reviews", sa.Column("pay_clarity", sa.String(length=16), nullable=True))
    op.execute("UPDATE reviews SET pay_clarity = 'unknown'")
    op.alter_column("reviews", "pay_clarity", nullable=False)
    op.create_check_constraint(
        "review_pay_clarity", "reviews", "pay_clarity IN ('clear', 'unclear', 'unknown')"
    )
    op.create_table(
        "reports",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("request_id", sa.String(length=36), nullable=False, unique=True),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("item_type", sa.String(length=16), nullable=False),
        sa.Column("item_id", sa.String(length=36), nullable=False),
        sa.Column("reason", sa.String(length=32), nullable=False),
        sa.Column("explanation", sa.String(length=300)),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.CheckConstraint("item_type IN ('listing', 'review')", name="report_item_type"),
        sa.CheckConstraint(
            "reason IN ('personal_data', 'inaccurate', 'harmful', 'other')", name="report_reason"
        ),
        sa.CheckConstraint("status IN ('pending', 'resolved', 'dismissed')", name="report_status"),
    )
    op.create_index("ix_reports_queue", "reports", ["status", "submitted_at"])


def downgrade() -> None:
    op.drop_index("ix_reports_queue", table_name="reports")
    op.drop_table("reports")
    op.drop_constraint("review_pay_clarity", "reviews", type_="check")
    op.drop_column("reviews", "pay_clarity")
    op.drop_column("reviews", "role")
