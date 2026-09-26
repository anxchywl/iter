"""initial directory tables"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "65bc49c29045"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "audit_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("actor", sa.String(length=80), nullable=False),
        sa.Column("action", sa.String(length=40), nullable=False),
        sa.Column("entity_type", sa.String(length=20), nullable=False),
        sa.Column("entity_id", sa.String(length=36), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_audit_entity", "audit_events", ["entity_type", "entity_id", "occurred_at"], unique=False
    )
    op.create_table(
        "employers",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("legal_name", sa.String(length=160), nullable=False),
        sa.Column("official_website_url", sa.String(length=2048), nullable=False),
        sa.Column("identity_status", sa.String(length=20), nullable=False),
        sa.Column("identity_source_url", sa.String(length=2048), nullable=True),
        sa.Column("identity_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "identity_status != 'checked' OR (identity_source_url IS NOT NULL AND identity_checked_at IS NOT NULL)",
            name="employer_identity_evidence",
        ),
        sa.CheckConstraint(
            "identity_status IN ('not_checked', 'checked', 'disputed')",
            name="employer_identity_status",
        ),
        sa.CheckConstraint("length(trim(legal_name)) > 0", name="employer_name_nonempty"),
        sa.CheckConstraint("version > 0", name="employer_version_positive"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "listings",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("employer_id", sa.String(length=36), nullable=False),
        sa.Column("source_identifier", sa.String(length=120), nullable=False),
        sa.Column("season_year", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("state", sa.String(length=80), nullable=False),
        sa.Column("city", sa.String(length=120), nullable=False),
        sa.Column("location_timezone", sa.String(length=64), nullable=False),
        sa.Column("category", sa.String(length=80), nullable=False),
        sa.Column("role", sa.String(length=160), nullable=False),
        sa.Column("duties", sa.Text(), nullable=True),
        sa.Column("official_source_url", sa.String(length=2048), nullable=False),
        sa.Column("contact_url", sa.String(length=2048), nullable=False),
        sa.Column("work_start_date", sa.Date(), nullable=True),
        sa.Column("work_end_date", sa.Date(), nullable=True),
        sa.Column("wage_amount", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("wage_currency", sa.String(length=3), nullable=True),
        sa.Column("wage_basis", sa.String(length=12), nullable=True),
        sa.Column("expected_hours_per_week", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("housing_description", sa.Text(), nullable=True),
        sa.Column("housing_cost_amount", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("housing_cost_currency", sa.String(length=3), nullable=True),
        sa.Column("housing_cost_basis", sa.String(length=12), nullable=True),
        sa.Column("transport_description", sa.Text(), nullable=True),
        sa.Column("sponsor_route_status", sa.String(length=32), nullable=False),
        sa.Column("sponsor_route_source_url", sa.String(length=2048), nullable=True),
        sa.Column("sponsor_approval_status", sa.String(length=20), nullable=False),
        sa.Column("sponsor_name", sa.String(length=160), nullable=True),
        sa.Column("sponsor_decision_url", sa.String(length=2048), nullable=True),
        sa.Column("sponsor_decision_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmation_source_url", sa.String(length=2048), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("state_changed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "housing_cost_basis IS NULL OR housing_cost_basis IN ('day', 'week', 'month', 'season')",
            name="listing_housing_basis",
        ),
        sa.CheckConstraint(
            "housing_cost_currency IS NULL OR housing_cost_currency ~ '^[A-Z]{3}$'",
            name="listing_housing_currency",
        ),
        sa.CheckConstraint(
            "sponsor_approval_status = 'unknown' OR (sponsor_name IS NOT NULL AND sponsor_decision_url IS NOT NULL AND sponsor_decision_at IS NOT NULL)",
            name="listing_sponsor_decision_evidence",
        ),
        sa.CheckConstraint(
            "sponsor_approval_status IN ('unknown', 'pending', 'confirmed', 'not_approved')",
            name="listing_sponsor_approval",
        ),
        sa.CheckConstraint(
            "sponsor_route_status = 'not_reported' OR sponsor_route_source_url IS NOT NULL",
            name="listing_route_evidence",
        ),
        sa.CheckConstraint(
            "sponsor_route_status IN ('not_reported', 'reported', 'reported_no_route')",
            name="listing_sponsor_route",
        ),
        sa.CheckConstraint(
            "status != 'published' OR (last_confirmed_at IS NOT NULL AND confirmation_source_url IS NOT NULL AND published_at IS NOT NULL)",
            name="listing_publication_evidence",
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'published', 'paused', 'closed', 'expired')", name="listing_status"
        ),
        sa.CheckConstraint(
            "wage_basis IS NULL OR wage_basis IN ('hour', 'day', 'week', 'month')",
            name="listing_wage_basis",
        ),
        sa.CheckConstraint(
            "wage_currency IS NULL OR wage_currency ~ '^[A-Z]{3}$'", name="listing_wage_currency"
        ),
        sa.CheckConstraint(
            "(housing_cost_amount IS NULL AND housing_cost_currency IS NULL AND housing_cost_basis IS NULL) OR (housing_cost_amount IS NOT NULL AND housing_cost_currency IS NOT NULL AND housing_cost_basis IS NOT NULL)",
            name="listing_housing_complete",
        ),
        sa.CheckConstraint(
            "(wage_amount IS NULL AND wage_currency IS NULL AND wage_basis IS NULL) OR (wage_amount IS NOT NULL AND wage_currency IS NOT NULL AND wage_basis IS NOT NULL)",
            name="listing_wage_complete",
        ),
        sa.CheckConstraint(
            "expected_hours_per_week IS NULL OR expected_hours_per_week BETWEEN 0 AND 168",
            name="listing_hours_range",
        ),
        sa.CheckConstraint(
            "housing_cost_amount IS NULL OR housing_cost_amount >= 0",
            name="listing_housing_positive",
        ),
        sa.CheckConstraint(
            "length(trim(source_identifier)) > 0 AND length(trim(role)) > 0",
            name="listing_required_text",
        ),
        sa.CheckConstraint("season_year BETWEEN 2020 AND 2100", name="listing_season_range"),
        sa.CheckConstraint("version > 0", name="listing_version_positive"),
        sa.CheckConstraint("wage_amount IS NULL OR wage_amount >= 0", name="listing_wage_positive"),
        sa.CheckConstraint(
            "work_start_date IS NULL OR work_end_date IS NULL OR work_end_date >= work_start_date",
            name="listing_date_order",
        ),
        sa.ForeignKeyConstraint(
            ["employer_id"],
            ["employers.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "employer_id", "season_year", "source_identifier", name="uq_listing_source_season"
        ),
    )
    op.create_index(
        "ix_listings_public_location",
        "listings",
        ["status", "season_year", "state", "city", "category"],
        unique=False,
    )
    op.create_index(
        "ix_listings_public_season_order",
        "listings",
        ["status", "season_year", "published_at", "id"],
        unique=False,
    )
    op.create_table(
        "reviews",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("listing_id", sa.String(length=36), nullable=False),
        sa.Column("season_year", sa.Integer(), nullable=False),
        sa.Column("pay_match", sa.String(length=16), nullable=False),
        sa.Column("hours_match", sa.String(length=16), nullable=False),
        sa.Column("housing_match", sa.String(length=16), nullable=False),
        sa.Column("transport_match", sa.String(length=16), nullable=False),
        sa.Column("text", sa.String(length=500), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "hours_match IN ('yes', 'no', 'unknown', 'not_applicable')", name="review_hours_answer"
        ),
        sa.CheckConstraint(
            "housing_match IN ('yes', 'no', 'unknown', 'not_applicable')",
            name="review_housing_answer",
        ),
        sa.CheckConstraint(
            "pay_match IN ('yes', 'no', 'unknown', 'not_applicable')", name="review_pay_answer"
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'removed')", name="review_status"
        ),
        sa.CheckConstraint(
            "transport_match IN ('yes', 'no', 'unknown', 'not_applicable')",
            name="review_transport_answer",
        ),
        sa.CheckConstraint("season_year BETWEEN 2020 AND 2100", name="review_season_range"),
        sa.CheckConstraint("version > 0", name="review_version_positive"),
        sa.ForeignKeyConstraint(
            ["listing_id"],
            ["listings.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_reviews_public", "reviews", ["listing_id", "status", "submitted_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_reviews_public", table_name="reviews")
    op.drop_table("reviews")
    op.drop_index("ix_listings_public_season_order", table_name="listings")
    op.drop_index("ix_listings_public_location", table_name="listings")
    op.drop_table("listings")
    op.drop_table("employers")
    op.drop_index("ix_audit_entity", table_name="audit_events")
    op.drop_table("audit_events")
