"""allow report reasons specific to listings and reviews"""

from collections.abc import Sequence

from alembic import op

revision: str = "f2a6c1d93b47"
down_revision: str | None = "c4f20690e0aa"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SHARED = "'personal_data', 'inaccurate', 'harmful', 'other'"


def upgrade() -> None:
    op.drop_constraint("report_reason", "reports", type_="check")
    op.create_check_constraint(
        "report_reason",
        "reports",
        f"reason IN ({SHARED}, 'closed', 'suspicious', 'off_topic')",
    )


def downgrade() -> None:
    # fold the newer reasons into the closest older ones so no report is lost
    op.execute(
        "UPDATE reports SET reason = CASE reason "
        "WHEN 'closed' THEN 'inaccurate' "
        "WHEN 'suspicious' THEN 'harmful' "
        "ELSE 'other' END "
        "WHERE reason IN ('closed', 'suspicious', 'off_topic')"
    )
    op.drop_constraint("report_reason", "reports", type_="check")
    op.create_check_constraint("report_reason", "reports", f"reason IN ({SHARED})")
