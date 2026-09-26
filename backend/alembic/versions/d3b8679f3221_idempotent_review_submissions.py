"""idempotent review submissions"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d3b8679f3221"
down_revision: str | None = "a0212a9c6247"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("reviews", sa.Column("request_id", sa.String(length=36), nullable=True))
    op.add_column("reviews", sa.Column("content_hash", sa.String(length=64), nullable=True))
    op.execute("UPDATE reviews SET request_id = id, content_hash = repeat(md5(id), 2)")
    op.alter_column("reviews", "request_id", nullable=False)
    op.alter_column("reviews", "content_hash", nullable=False)
    op.create_unique_constraint("uq_reviews_request_id", "reviews", ["request_id"])


def downgrade() -> None:
    op.drop_constraint("uq_reviews_request_id", "reviews", type_="unique")
    op.drop_column("reviews", "content_hash")
    op.drop_column("reviews", "request_id")
