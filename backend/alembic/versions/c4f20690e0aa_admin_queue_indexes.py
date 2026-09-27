"""index admin queue pagination"""

from collections.abc import Sequence

from alembic import op

revision: str = "c4f20690e0aa"
down_revision: str | None = "b7e9c28134da"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_listings_confirmation_page", "listings", ["status", "last_confirmed_at", "id"]
    )
    op.create_index("ix_reviews_queue_page", "reviews", ["status", "submitted_at", "id"])
    op.create_index("ix_reports_queue_page", "reports", ["status", "submitted_at", "id"])
    op.create_index("ix_audit_time_page", "audit_events", ["occurred_at", "id"])


def downgrade() -> None:
    op.drop_index("ix_audit_time_page", table_name="audit_events")
    op.drop_index("ix_reports_queue_page", table_name="reports")
    op.drop_index("ix_reviews_queue_page", table_name="reviews")
    op.drop_index("ix_listings_confirmation_page", table_name="listings")
