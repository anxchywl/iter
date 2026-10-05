import re
from datetime import date
from decimal import Decimal
from ipaddress import ip_address
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import UUID4, BaseModel, ConfigDict, Field, field_validator, model_validator


def safe_url(value: str) -> str:
    value = value.strip()
    parts = urlsplit(value)
    host = parts.hostname or ""
    if (
        len(value) > 2048
        or parts.scheme != "https"
        or not host
        or "." not in host
        or host.endswith((".local", ".localhost"))
        or parts.username is not None
        or parts.password is not None
        or any(char.isspace() for char in value)
    ):
        raise ValueError("invalid external URL")
    try:
        ip_address(host)
    except ValueError:
        return value
    raise ValueError("IP address URLs are not allowed")


def plain_text(value: str) -> str:
    value = value.strip()
    if any(ord(char) < 32 and char not in "\n\t" for char in value):
        raise ValueError("control characters are not allowed")
    return value


def safe_review_text(value: str | None) -> str | None:
    if value is None:
        return None
    value = plain_text(value)
    if (
        any(char.isdigit() for char in value)
        or "@" in value
        or re.search(r"(?i)\b(?:https?://|www\.|[\w-]+\.[a-zа-я]{2,}(?:/|\b))", value)
    ):
        raise ValueError("review text cannot contain numbers or contact details")
    return value


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class EmployerCreate(InputModel):
    legal_name: str = Field(min_length=1, max_length=160)
    official_website_url: str = Field(max_length=2048)

    _url = field_validator("official_website_url")(safe_url)
    _name = field_validator("legal_name")(plain_text)


class EmployerEdit(EmployerCreate):
    expected_version: int = Field(ge=1)
    identity_status: str = Field(default="not_checked", pattern="^(not_checked|checked|disputed)$")
    identity_source_url: str | None = Field(default=None, max_length=2048)

    @model_validator(mode="after")
    def require_identity_source(self) -> "EmployerEdit":
        if self.identity_status in {"checked", "disputed"} and not self.identity_source_url:
            raise ValueError("identity evidence is required")
        if self.identity_status == "not_checked" and self.identity_source_url:
            raise ValueError("unchecked identity cannot retain evidence")
        if self.identity_source_url:
            self.identity_source_url = safe_url(self.identity_source_url)
        return self


class ListingContent(InputModel):
    employer_id: str = Field(min_length=36, max_length=36)
    source_identifier: str = Field(min_length=1, max_length=120)
    season_year: int = Field(ge=2020, le=2100)
    state: str = Field(min_length=1, max_length=80)
    city: str = Field(min_length=1, max_length=120)
    location_timezone: str = Field(min_length=1, max_length=64)
    category: str = Field(min_length=1, max_length=80)
    role: str = Field(min_length=1, max_length=160)
    duties: str | None = Field(default=None, max_length=2000)
    official_source_url: str = Field(max_length=2048)
    contact_url: str = Field(max_length=2048)
    work_start_date: date | None = None
    work_end_date: date | None = None
    wage_amount: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    wage_currency: str | None = Field(default=None, pattern="^[A-Z]{3}$")
    wage_basis: str | None = Field(default=None, pattern="^(hour|day|week|month)$")
    expected_hours_per_week: Decimal | None = Field(default=None, ge=0, le=168, decimal_places=2)
    housing_description: str | None = Field(default=None, max_length=2000)
    housing_cost_amount: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    housing_cost_currency: str | None = Field(default=None, pattern="^[A-Z]{3}$")
    housing_cost_basis: str | None = Field(default=None, pattern="^(day|week|month|season)$")
    transport_description: str | None = Field(default=None, max_length=2000)

    @field_validator("official_source_url", "contact_url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        return safe_url(value)

    @field_validator(
        "source_identifier",
        "state",
        "city",
        "category",
        "role",
        "duties",
        "housing_description",
        "transport_description",
    )
    @classmethod
    def validate_text(cls, value: str | None) -> str | None:
        return plain_text(value) if value is not None else None

    @field_validator("location_timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as exc:
            raise ValueError("invalid time zone") from exc
        return value

    @model_validator(mode="after")
    def validate_pairs(self) -> "ListingContent":
        if (
            self.work_start_date
            and self.work_end_date
            and self.work_end_date < self.work_start_date
        ):
            raise ValueError("work end date precedes start date")
        if any(
            value is not None for value in (self.wage_amount, self.wage_currency, self.wage_basis)
        ) and not all(
            value is not None for value in (self.wage_amount, self.wage_currency, self.wage_basis)
        ):
            raise ValueError("wage amount, currency, and basis belong together")
        if any(
            value is not None
            for value in (
                self.housing_cost_amount,
                self.housing_cost_currency,
                self.housing_cost_basis,
            )
        ) and not all(
            value is not None
            for value in (
                self.housing_cost_amount,
                self.housing_cost_currency,
                self.housing_cost_basis,
            )
        ):
            raise ValueError("housing cost amount, currency, and basis belong together")
        return self


class ListingEdit(InputModel):
    expected_version: int = Field(ge=1)
    content: ListingContent


class VersionedAction(InputModel):
    expected_version: int = Field(ge=1)
    reason: str = Field(min_length=1, max_length=300)

    _reason = field_validator("reason")(plain_text)


class Confirmation(VersionedAction):
    confirmation_source_url: str = Field(max_length=2048)

    _source = field_validator("confirmation_source_url")(safe_url)


class SponsorAssessment(VersionedAction):
    route_status: str = Field(pattern="^(not_reported|reported|reported_no_route)$")
    route_source_url: str | None = Field(default=None, max_length=2048)
    approval_status: str = Field(pattern="^(unknown|pending|confirmed|not_approved)$")
    sponsor_name: str | None = Field(default=None, max_length=160)
    decision_url: str | None = Field(default=None, max_length=2048)

    @model_validator(mode="after")
    def validate_evidence(self) -> "SponsorAssessment":
        if self.route_status != "not_reported" and not self.route_source_url:
            raise ValueError("route source is required")
        if self.route_status == "not_reported" and self.route_source_url:
            raise ValueError("unreported route cannot retain evidence")
        if self.approval_status != "unknown" and not (self.sponsor_name and self.decision_url):
            raise ValueError("sponsor decision evidence is required")
        if self.approval_status == "unknown" and (self.sponsor_name or self.decision_url):
            raise ValueError("unknown approval cannot retain a sponsor decision")
        if self.route_source_url:
            self.route_source_url = safe_url(self.route_source_url)
        if self.decision_url:
            self.decision_url = safe_url(self.decision_url)
        return self


class ReviewSubmit(InputModel):
    request_id: UUID4
    listing_id: str = Field(min_length=36, max_length=36)
    season_year: int = Field(ge=2020, le=2100)
    role: str = Field(min_length=1, max_length=80)
    pay_match: str = Field(pattern="^(yes|no|unknown|not_applicable)$")
    pay_clarity: str = Field(pattern="^(clear|unclear|unknown)$")
    hours_match: str = Field(pattern="^(yes|no|unknown|not_applicable)$")
    housing_match: str = Field(pattern="^(yes|no|unknown|not_applicable)$")
    transport_match: str = Field(pattern="^(yes|no|unknown|not_applicable)$")
    text: str | None = Field(default=None, max_length=500)
    self_report_consent: bool

    _safe_text = field_validator("text", "role")(safe_review_text)

    @model_validator(mode="after")
    def require_consent(self) -> "ReviewSubmit":
        if not self.self_report_consent:
            raise ValueError("self-report acknowledgment is required")
        return self


class ReviewRedaction(VersionedAction):
    text: str | None = Field(default=None, max_length=500)
    role: str | None = Field(default=None, min_length=1, max_length=80)

    _text = field_validator("text", "role")(safe_review_text)


class ReportSubmit(InputModel):
    request_id: UUID4
    item_type: str = Field(pattern="^(listing|review)$")
    item_id: str = Field(min_length=36, max_length=36)
    reason: str = Field(
        pattern="^(personal_data|inaccurate|harmful|other|closed|suspicious|off_topic)$"
    )
    explanation: str | None = Field(default=None, max_length=300)

    _explanation = field_validator("explanation")(safe_review_text)

    @model_validator(mode="after")
    def match_reason_to_item(self) -> "ReportSubmit":
        if self.reason in {"closed", "suspicious"} and self.item_type != "listing":
            raise ValueError("reason applies only to listings")
        if self.reason == "off_topic" and self.item_type != "review":
            raise ValueError("reason applies only to reviews")
        return self
