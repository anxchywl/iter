from datetime import date, datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import (
    JSON,
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def new_id() -> str:
    return str(uuid4())


class Base(DeclarativeBase):
    pass


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    key: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    website_url: Mapped[str | None] = mapped_column(String(2048))
    address: Mapped[str | None] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    access_key_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    access_key_hint: Mapped[str | None] = mapped_column(String(12))
    access_key_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    listings: Mapped[list["Listing"]] = relationship(back_populates="organization")

    __table_args__ = (
        CheckConstraint("length(trim(key)) > 0", name="organization_key_nonempty"),
        CheckConstraint("length(trim(name)) > 0", name="organization_name_nonempty"),
        CheckConstraint(
            "address IS NULL OR length(trim(address)) > 0", name="organization_address_nonempty"
        ),
        CheckConstraint("version > 0", name="organization_version_positive"),
        CheckConstraint("status IN ('active', 'suspended')", name="organization_status"),
    )


class Employer(Base):
    __tablename__ = "employers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    legal_name: Mapped[str] = mapped_column(String(160), nullable=False)
    official_website_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    identity_status: Mapped[str] = mapped_column(String(20), nullable=False, default="not_checked")
    identity_source_url: Mapped[str | None] = mapped_column(String(2048))
    identity_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    listings: Mapped[list["Listing"]] = relationship(back_populates="employer")

    __table_args__ = (
        CheckConstraint("length(trim(legal_name)) > 0", name="employer_name_nonempty"),
        CheckConstraint("version > 0", name="employer_version_positive"),
        CheckConstraint(
            "identity_status IN ('not_checked', 'checked', 'disputed')",
            name="employer_identity_status",
        ),
        CheckConstraint(
            "identity_status != 'checked' OR (identity_source_url IS NOT NULL AND identity_checked_at IS NOT NULL)",
            name="employer_identity_evidence",
        ),
    )


class Listing(Base):
    __tablename__ = "listings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    employer_id: Mapped[str] = mapped_column(ForeignKey("employers.id"), nullable=False)
    organization_id: Mapped[str | None] = mapped_column(ForeignKey("organizations.id"))
    source_identifier: Mapped[str] = mapped_column(String(120), nullable=False)
    season_year: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    submission_status: Mapped[str] = mapped_column(String(24), nullable=False, default="draft")
    submission_note: Mapped[str | None] = mapped_column(String(300))
    state: Mapped[str] = mapped_column(String(80), nullable=False)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    location_timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    role: Mapped[str] = mapped_column(String(160), nullable=False)
    duties: Mapped[str | None] = mapped_column(Text)
    official_source_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    contact_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    work_start_date: Mapped[date | None] = mapped_column(Date)
    work_end_date: Mapped[date | None] = mapped_column(Date)
    wage_amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    wage_currency: Mapped[str | None] = mapped_column(String(3))
    wage_basis: Mapped[str | None] = mapped_column(String(12))
    expected_hours_per_week: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    housing_description: Mapped[str | None] = mapped_column(Text)
    housing_cost_amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    housing_cost_currency: Mapped[str | None] = mapped_column(String(3))
    housing_cost_basis: Mapped[str | None] = mapped_column(String(12))
    transport_description: Mapped[str | None] = mapped_column(Text)
    sponsor_route_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="not_reported"
    )
    sponsor_route_source_url: Mapped[str | None] = mapped_column(String(2048))
    sponsor_approval_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="unknown"
    )
    sponsor_name: Mapped[str | None] = mapped_column(String(160))
    sponsor_decision_url: Mapped[str | None] = mapped_column(String(2048))
    sponsor_decision_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    confirmation_source_url: Mapped[str | None] = mapped_column(String(2048))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    state_changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    employer: Mapped[Employer] = relationship(back_populates="listings")
    organization: Mapped[Organization | None] = relationship(back_populates="listings")
    reviews: Mapped[list["Review"]] = relationship(back_populates="listing")

    __table_args__ = (
        UniqueConstraint(
            "employer_id", "season_year", "source_identifier", name="uq_listing_source_season"
        ),
        CheckConstraint("season_year BETWEEN 2020 AND 2100", name="listing_season_range"),
        CheckConstraint("version > 0", name="listing_version_positive"),
        CheckConstraint(
            "status IN ('draft', 'published', 'paused', 'closed', 'expired')", name="listing_status"
        ),
        CheckConstraint(
            "submission_status IN ('draft', 'pending', 'changes_requested', 'approved')",
            name="listing_submission_status",
        ),
        CheckConstraint(
            "length(trim(source_identifier)) > 0 AND length(trim(role)) > 0",
            name="listing_required_text",
        ),
        CheckConstraint(
            "work_start_date IS NULL OR work_end_date IS NULL OR work_end_date >= work_start_date",
            name="listing_date_order",
        ),
        CheckConstraint("wage_amount IS NULL OR wage_amount >= 0", name="listing_wage_positive"),
        CheckConstraint(
            "housing_cost_amount IS NULL OR housing_cost_amount >= 0",
            name="listing_housing_positive",
        ),
        CheckConstraint(
            "expected_hours_per_week IS NULL OR expected_hours_per_week BETWEEN 0 AND 168",
            name="listing_hours_range",
        ),
        CheckConstraint(
            "(wage_amount IS NULL AND wage_currency IS NULL AND wage_basis IS NULL) OR (wage_amount IS NOT NULL AND wage_currency IS NOT NULL AND wage_basis IS NOT NULL)",
            name="listing_wage_complete",
        ),
        CheckConstraint(
            "(housing_cost_amount IS NULL AND housing_cost_currency IS NULL AND housing_cost_basis IS NULL) OR (housing_cost_amount IS NOT NULL AND housing_cost_currency IS NOT NULL AND housing_cost_basis IS NOT NULL)",
            name="listing_housing_complete",
        ),
        CheckConstraint(
            "wage_currency IS NULL OR wage_currency ~ '^[A-Z]{3}$'", name="listing_wage_currency"
        ),
        CheckConstraint(
            "housing_cost_currency IS NULL OR housing_cost_currency ~ '^[A-Z]{3}$'",
            name="listing_housing_currency",
        ),
        CheckConstraint(
            "wage_basis IS NULL OR wage_basis IN ('hour', 'day', 'week', 'month')",
            name="listing_wage_basis",
        ),
        CheckConstraint(
            "housing_cost_basis IS NULL OR housing_cost_basis IN ('day', 'week', 'month', 'season')",
            name="listing_housing_basis",
        ),
        CheckConstraint(
            "sponsor_route_status IN ('not_reported', 'reported', 'reported_no_route')",
            name="listing_sponsor_route",
        ),
        CheckConstraint(
            "sponsor_route_status = 'not_reported' OR sponsor_route_source_url IS NOT NULL",
            name="listing_route_evidence",
        ),
        CheckConstraint(
            "sponsor_approval_status IN ('unknown', 'pending', 'confirmed', 'not_approved')",
            name="listing_sponsor_approval",
        ),
        CheckConstraint(
            "sponsor_approval_status = 'unknown' OR (sponsor_name IS NOT NULL AND sponsor_decision_url IS NOT NULL AND sponsor_decision_at IS NOT NULL)",
            name="listing_sponsor_decision_evidence",
        ),
        CheckConstraint(
            "status != 'published' OR (last_confirmed_at IS NOT NULL AND confirmation_source_url IS NOT NULL AND published_at IS NOT NULL)",
            name="listing_publication_evidence",
        ),
        Index("ix_listings_public_season_order", "status", "season_year", "published_at", "id"),
        Index("ix_listings_public_location", "status", "season_year", "state", "city", "category"),
        Index("ix_listings_current", "status", "last_confirmed_at"),
        Index("ix_listings_confirmation_page", "status", "last_confirmed_at", "id"),
        Index("ix_listings_provider_queue", "organization_id", "submission_status", "id"),
        Index("ix_listings_public_dates", "status", "work_start_date", "work_end_date"),
        Index("ix_listings_public_pay", "status", "wage_currency", "wage_basis", "wage_amount"),
    )


class PortalSession(Base):
    __tablename__ = "portal_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    actor: Mapped[str] = mapped_column(String(80), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        CheckConstraint("role = 'provider'", name="portal_session_role"),
        Index("ix_portal_sessions_expiry", "expires_at"),
    )


class OrganizationMember(Base):
    __tablename__ = "organization_members"

    telegram_user_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), nullable=False)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (CheckConstraint("telegram_user_id > 0", name="member_telegram_id_positive"),)


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    request_id: Mapped[str] = mapped_column(String(36), nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    listing_id: Mapped[str] = mapped_column(ForeignKey("listings.id"), nullable=False)
    season_year: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[str] = mapped_column(String(80), nullable=False)
    pay_match: Mapped[str] = mapped_column(String(16), nullable=False)
    pay_clarity: Mapped[str] = mapped_column(String(16), nullable=False)
    hours_match: Mapped[str] = mapped_column(String(16), nullable=False)
    housing_match: Mapped[str] = mapped_column(String(16), nullable=False)
    transport_match: Mapped[str] = mapped_column(String(16), nullable=False)
    text: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    listing: Mapped[Listing] = relationship(back_populates="reviews")

    __table_args__ = (
        UniqueConstraint("request_id", name="uq_reviews_request_id"),
        CheckConstraint("season_year BETWEEN 2020 AND 2100", name="review_season_range"),
        CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'removed')", name="review_status"
        ),
        CheckConstraint(
            "pay_match IN ('yes', 'no', 'unknown', 'not_applicable')", name="review_pay_answer"
        ),
        CheckConstraint(
            "pay_clarity IN ('clear', 'unclear', 'unknown')", name="review_pay_clarity"
        ),
        CheckConstraint(
            "hours_match IN ('yes', 'no', 'unknown', 'not_applicable')", name="review_hours_answer"
        ),
        CheckConstraint(
            "housing_match IN ('yes', 'no', 'unknown', 'not_applicable')",
            name="review_housing_answer",
        ),
        CheckConstraint(
            "transport_match IN ('yes', 'no', 'unknown', 'not_applicable')",
            name="review_transport_answer",
        ),
        CheckConstraint("version > 0", name="review_version_positive"),
        Index("ix_reviews_public", "listing_id", "status", "submitted_at"),
        Index("ix_reviews_queue_page", "status", "submitted_at", "id"),
    )


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    actor: Mapped[str] = mapped_column(String(80), nullable=False)
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(20), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    details: Mapped[dict] = mapped_column(JSON, nullable=False)

    __table_args__ = (
        Index("ix_audit_entity", "entity_type", "entity_id", "occurred_at"),
        Index("ix_audit_time_page", "occurred_at", "id"),
    )


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    request_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    item_type: Mapped[str] = mapped_column(String(16), nullable=False)
    item_id: Mapped[str] = mapped_column(String(36), nullable=False)
    reason: Mapped[str] = mapped_column(String(32), nullable=False)
    explanation: Mapped[str | None] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    __table_args__ = (
        CheckConstraint("item_type IN ('listing', 'review')", name="report_item_type"),
        CheckConstraint(
            "reason IN ('personal_data', 'inaccurate', 'harmful', 'other', "
            "'closed', 'suspicious', 'off_topic')",
            name="report_reason",
        ),
        CheckConstraint("status IN ('pending', 'resolved', 'dismissed')", name="report_status"),
        Index("ix_reports_queue", "status", "submitted_at"),
        Index("ix_reports_queue_page", "status", "submitted_at", "id"),
    )
