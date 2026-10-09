import hashlib
import html
import json
import os
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from secrets import token_urlsafe
from typing import Annotated, NamedTuple

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import and_, case, create_engine, func, not_, or_, select
from sqlalchemy import delete as sa_delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, sessionmaker

from app.db import get_session
from app.models import (
    AuditEvent,
    Employer,
    Listing,
    Organization,
    OrganizationMember,
    PortalSession,
    Report,
    Review,
)
from app.schemas import (
    AdminListingCreate,
    AdminListingEdit,
    Confirmation,
    EmployerCreate,
    EmployerEdit,
    ListingContent,
    ListingEdit,
    OrganizationAccessAction,
    OrganizationCreate,
    OrganizationEdit,
    OrganizationStatusAction,
    ReportSubmit,
    ReviewRedaction,
    ReviewSubmit,
    SponsorAssessment,
    SubmissionAction,
    SubmissionDecision,
    VersionedAction,
)
from app.security import (
    WriteGuard,
    WriteLimiter,
    bearer,
    credentials_from_environment,
    load_operator_telegram_ids,
    load_telegram_bot_token,
    require_admin,
    telegram_user_id,
)

FRESHNESS = timedelta(days=14)
# telegram signs init data once per launch, so this bounds how long one launch stays signed in
INIT_DATA_MAX_AGE = timedelta(hours=8)
SessionDep = Annotated[Session, Depends(get_session)]


class PortalPrincipal(NamedTuple):
    actor: str
    telegram_user_id: int | None
    role: str | None
    organization_id: str | None


def require_portal(
    request: Request,
    session: SessionDep,
    token: Annotated[str | None, Header(alias="X-Portal-Session")] = None,
) -> PortalPrincipal:
    if token:
        portal_session = session.get(PortalSession, hashlib.sha256(token.encode()).hexdigest())
        if portal_session is None or portal_session.expires_at <= now_utc():
            if portal_session is not None:
                session.delete(portal_session)
                session.commit()
            raise HTTPException(status_code=401, detail="Unauthorized")
        organization = session.get(Organization, portal_session.organization_id)
        if organization is None or organization.status != "active":
            raise HTTPException(status_code=403, detail="Forbidden")
        return PortalPrincipal(
            portal_session.actor, None, portal_session.role, portal_session.organization_id
        )
    scheme, _, init_data = request.headers.get("authorization", "").partition(" ")
    bot_token = request.app.state.telegram_bot_token
    if scheme.lower() != "tma" or not bot_token:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        user_id = telegram_user_id(init_data, bot_token, INIT_DATA_MAX_AGE, now_utc())
    except (ValueError, KeyError, OverflowError, OSError):
        raise HTTPException(status_code=401, detail="Unauthorized") from None
    actor = f"telegram:{user_id}"
    if user_id in request.app.state.operator_telegram_ids:
        return PortalPrincipal(actor, user_id, "operator", None)
    member = session.get(OrganizationMember, user_id)
    organization = session.get(Organization, member.organization_id) if member else None
    if organization is not None and organization.status == "active":
        return PortalPrincipal(actor, user_id, "provider", organization.id)
    return PortalPrincipal(actor, user_id, None, None)


PortalDep = Annotated[PortalPrincipal, Depends(require_portal)]


def require_member(principal: PortalDep) -> PortalPrincipal:
    if principal.role is None:
        raise HTTPException(status_code=403, detail="Forbidden")
    return principal


MemberDep = Annotated[PortalPrincipal, Depends(require_member)]


def require_operator(
    request: Request,
    session: SessionDep,
    token: Annotated[str | None, Header(alias="X-Portal-Session")] = None,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)] = None,
) -> str:
    if token:
        principal = require_portal(request, session, token)
        session.rollback()
        if principal.role != "operator":
            raise HTTPException(status_code=403, detail="Forbidden")
        return principal.actor
    if request.headers.get("authorization", "").partition(" ")[0].lower() == "tma":
        principal = require_portal(request, session)
        session.rollback()
        if principal.role != "operator":
            raise HTTPException(status_code=403, detail="Forbidden")
        return principal.actor
    return require_admin(request, credentials)


AdminDep = Annotated[str, Depends(require_operator)]


def now_utc() -> datetime:
    return datetime.now(UTC)


def conflict() -> HTTPException:
    return HTTPException(status_code=409, detail="Conflict")


def missing() -> HTTPException:
    return HTTPException(status_code=404, detail="Not found")


def audit(
    session: Session, actor: str, action: str, kind: str, entity_id: str, details: dict
) -> None:
    session.add(
        AuditEvent(
            actor=actor,
            action=action,
            entity_type=kind,
            entity_id=entity_id,
            occurred_at=now_utc(),
            details=details,
        )
    )


def checked_version(actual: int, expected: int) -> None:
    if actual != expected:
        raise conflict()


def fresh_query(moment: datetime):
    return (
        Listing.status == "published",
        Listing.last_confirmed_at.is_not(None),
        Listing.last_confirmed_at > moment - FRESHNESS,
        Listing.season_year >= moment.year,
        or_(Listing.work_end_date.is_(None), Listing.work_end_date >= moment.date()),
    )


def is_fresh(listing: Listing, moment: datetime) -> bool:
    return (
        listing.status == "published"
        and listing.last_confirmed_at is not None
        and listing.last_confirmed_at > moment - FRESHNESS
        and listing.season_year >= moment.year
        and (listing.work_end_date is None or listing.work_end_date >= moment.date())
    )


def public_text(value: str | None) -> str | None:
    return html.escape(value, quote=True) if value is not None else None


def listing_public(listing: Listing) -> dict:
    employer = listing.employer
    return {
        "id": listing.id,
        "season_year": listing.season_year,
        "employer_legal_name": public_text(employer.legal_name),
        "employer_official_website_url": employer.official_website_url,
        "employer_identity_status": employer.identity_status,
        "employer_identity_checked_at": employer.identity_checked_at,
        "employer_identity_public_source_url": employer.identity_source_url
        if employer.identity_status == "checked"
        else None,
        "state": public_text(listing.state),
        "city": public_text(listing.city),
        "location_timezone": listing.location_timezone,
        "category": public_text(listing.category),
        "role": public_text(listing.role),
        "duties": public_text(listing.duties),
        "official_source_url": listing.official_source_url,
        "contact_url": listing.contact_url,
        "work_start_date": listing.work_start_date,
        "work_end_date": listing.work_end_date,
        "wage_amount": listing.wage_amount,
        "wage_currency": listing.wage_currency,
        "wage_basis": listing.wage_basis,
        "expected_hours_per_week": listing.expected_hours_per_week,
        "housing_description": public_text(listing.housing_description),
        "housing_cost_amount": listing.housing_cost_amount,
        "housing_cost_currency": listing.housing_cost_currency,
        "housing_cost_basis": listing.housing_cost_basis,
        "transport_description": public_text(listing.transport_description),
        "sponsor_route_status": listing.sponsor_route_status,
        "sponsor_route_source_url": listing.sponsor_route_source_url,
        "sponsor_approval_status": listing.sponsor_approval_status,
        "sponsor_name": public_text(listing.sponsor_name),
        "sponsor_decision_url": listing.sponsor_decision_url,
        "sponsor_decision_at": listing.sponsor_decision_at,
        "last_confirmed_at": listing.last_confirmed_at,
    }


def blocks_publication(session: Session, listing: Listing, moment: datetime) -> bool:
    return (
        listing.season_year < moment.year
        or (listing.work_end_date is not None and listing.work_end_date < moment.date())
        or session.get(Employer, listing.employer_id).identity_status == "disputed"
    )


def effective_status(listing: Listing, moment: datetime) -> str:
    if listing.status == "published" and not is_fresh(listing, moment):
        return "expired"
    if listing.status == "draft" and listing.submission_status == "pending":
        return "pending"
    return listing.status


def effective_status_sql(moment: datetime):
    return case(
        (and_(Listing.status == "published", not_(and_(*fresh_query(moment)))), "expired"),
        (and_(Listing.status == "draft", Listing.submission_status == "pending"), "pending"),
        else_=Listing.status,
    )


def admin_record(record: Employer | Listing | Review) -> dict:
    return {column.name: getattr(record, column.name) for column in record.__table__.columns}


def organization_record(organization: Organization) -> dict:
    return {
        "id": organization.id,
        "key": organization.key,
        "name": organization.name,
        "website_url": organization.website_url,
        "address": organization.address,
        "status": organization.status,
        "access_key_hint": organization.access_key_hint,
        "access_key_created_at": organization.access_key_created_at,
        "version": organization.version,
    }


def locked_listing(session: Session, listing_id: str, expected_version: int) -> Listing:
    listing = session.scalar(select(Listing).where(Listing.id == listing_id).with_for_update())
    if listing is None:
        raise missing()
    checked_version(listing.version, expected_version)
    return listing


def create_app(
    database_url: str | None = None,
    admin_credentials: dict[str, str] | None = None,
    feedback_enabled: bool | None = None,
    telegram_bot_token: str | None = None,
    operator_telegram_ids: frozenset[int] | None = None,
) -> FastAPI:
    url = database_url or os.environ.get("DATABASE_URL")
    if not url or not url.startswith("postgresql+psycopg://"):
        raise RuntimeError("DATABASE_URL must be a PostgreSQL psycopg URL")
    credentials = admin_credentials or credentials_from_environment()
    engine = create_engine(url, pool_pre_ping=True)
    # environment variables must never start exporting request or error data
    app = FastAPI(
        title="Iter directory API",
        docs_url=None,
        redoc_url=None,
        telemetry={"auto_configure": False},
    )
    app.state.session_factory = sessionmaker(engine, expire_on_commit=False)
    app.state.admin_credentials = credentials
    app.state.telegram_bot_token = telegram_bot_token or load_telegram_bot_token(
        os.environ.get("TELEGRAM_BOT_TOKEN")
    )
    app.state.operator_telegram_ids = (
        operator_telegram_ids
        if operator_telegram_ids is not None
        else load_operator_telegram_ids(os.environ.get("OPERATOR_TELEGRAM_IDS"))
    )
    app.state.feedback_enabled = (
        os.environ.get("FEEDBACK_ENABLED") == "true"
        if feedback_enabled is None
        else feedback_enabled
    )
    limiter = WriteLimiter()
    app.state.write_limiter = limiter
    app.add_middleware(WriteGuard, limiter=limiter)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, __: RequestValidationError) -> JSONResponse:
        return JSONResponse({"detail": "Invalid request"}, status_code=422)

    @app.exception_handler(IntegrityError)
    async def integrity_error(_: Request, __: IntegrityError) -> JSONResponse:
        return JSONResponse({"detail": "Conflict"}, status_code=409)

    @app.get("/api/v1/listings")
    def search_listings(
        session: SessionDep,
        season: Annotated[int | None, Query(ge=2020, le=2100)] = None,
        state: Annotated[str | None, Query(min_length=1, max_length=80)] = None,
        city: Annotated[str | None, Query(min_length=1, max_length=120)] = None,
        category: Annotated[str | None, Query(min_length=1, max_length=80)] = None,
        q: Annotated[str | None, Query(min_length=1, max_length=80)] = None,
        start_from: date | None = None,
        end_by: date | None = None,
        min_wage: Annotated[Decimal | None, Query(ge=0, le=99999999)] = None,
        wage_currency: Annotated[str | None, Query(pattern="^[A-Z]{3}$")] = None,
        wage_basis: Annotated[str | None, Query(pattern="^(hour|day|week|month)$")] = None,
        min_hours: Annotated[Decimal | None, Query(ge=0, le=168)] = None,
        housing_known: bool | None = None,
        confirmed_within_days: Annotated[int | None, Query(ge=1, le=14)] = None,
        page: Annotated[int, Query(ge=1, le=100)] = 1,
        page_size: Annotated[int, Query(ge=1, le=50)] = 20,
    ) -> dict:
        if (min_wage is not None and (wage_currency is None or wage_basis is None)) or (
            min_wage is None and (wage_currency is not None or wage_basis is not None)
        ):
            raise HTTPException(status_code=422, detail="Invalid request")
        if start_from and end_by and start_from > end_by:
            raise HTTPException(status_code=422, detail="Invalid request")
        conditions = list(fresh_query(now_utc()))
        if season is not None:
            conditions.append(Listing.season_year == season)
        if state:
            conditions.append(Listing.state == state)
        if city:
            conditions.append(Listing.city == city)
        if category:
            conditions.append(Listing.category == category)
        if start_from:
            conditions.append(Listing.work_start_date >= start_from)
        if end_by:
            conditions.append(Listing.work_end_date <= end_by)
        if min_wage is not None:
            conditions.extend(
                (
                    Listing.wage_amount >= min_wage,
                    Listing.wage_currency == wage_currency,
                    Listing.wage_basis == wage_basis,
                )
            )
        if min_hours is not None:
            conditions.append(Listing.expected_hours_per_week >= min_hours)
        if housing_known is not None:
            known = or_(
                Listing.housing_description.is_not(None), Listing.housing_cost_amount.is_not(None)
            )
            conditions.append(known if housing_known else ~known)
        if confirmed_within_days is not None:
            conditions.append(
                Listing.last_confirmed_at > now_utc() - timedelta(days=confirmed_within_days)
            )
        if q:
            escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            pattern = f"%{escaped}%"
            conditions.append(
                or_(
                    Listing.role.ilike(pattern, escape="\\"),
                    Listing.duties.ilike(pattern, escape="\\"),
                    Employer.legal_name.ilike(pattern, escape="\\"),
                )
            )
        query = (
            select(Listing)
            .join(Listing.employer)
            .options(joinedload(Listing.employer))
            .where(*conditions)
            .order_by(Listing.published_at.desc(), Listing.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size + 1)
        )
        rows = session.scalars(query).all()
        return jsonable_encoder(
            {
                "items": [listing_public(item) for item in rows[:page_size]],
                "page": page,
                "page_size": page_size,
                "has_more": len(rows) > page_size,
            }
        )

    @app.get("/api/v1/listings/locations")
    def listing_locations(session: SessionDep) -> dict:
        rows = session.execute(
            select(Listing.state, Listing.city)
            .where(*fresh_query(now_utc()))
            .distinct()
            .order_by(Listing.state, Listing.city)
            .limit(500)
        ).all()
        return {"items": [{"state": state, "city": city} for state, city in rows]}

    @app.get("/api/v1/listings/{listing_id}")
    def get_listing(listing_id: str, session: SessionDep) -> dict:
        listing = session.scalar(
            select(Listing).options(joinedload(Listing.employer)).where(Listing.id == listing_id)
        )
        if listing is None:
            raise missing()
        if listing.published_at is None:
            raise missing()
        if not is_fresh(listing, now_utc()):
            stale = listing.status in {"published", "expired"} and (
                listing.last_confirmed_at is None
                or listing.last_confirmed_at <= now_utc() - FRESHNESS
            )
            return JSONResponse(
                {"detail": "Unavailable", "reason": "stale" if stale else "unavailable"},
                status_code=410,
            )
        return jsonable_encoder(listing_public(listing))

    @app.get("/api/v1/listings/{listing_id}/reviews")
    def public_reviews(listing_id: str, session: SessionDep) -> dict:
        listing = session.get(Listing, listing_id)
        if listing is None or not is_fresh(listing, now_utc()):
            raise missing()
        reviews = session.scalars(
            select(Review)
            .where(Review.listing_id == listing_id, Review.status == "approved")
            .order_by(Review.submitted_at.desc(), Review.id.desc())
            .limit(50)
        ).all()
        count = session.scalar(
            select(func.count())
            .select_from(Review)
            .where(Review.listing_id == listing_id, Review.status == "approved")
        )
        return jsonable_encoder(
            {
                "count": count,
                "items": [
                    {
                        "id": item.id,
                        "season_year": item.season_year,
                        "role": public_text(item.role),
                        "pay_match": item.pay_match,
                        "pay_clarity": item.pay_clarity,
                        "hours_match": item.hours_match,
                        "housing_match": item.housing_match,
                        "transport_match": item.transport_match,
                        "text": public_text(item.text),
                        "submitted_at": item.submitted_at,
                        "label": "self-reported experience",
                    }
                    for item in reviews
                ],
            }
        )

    @app.post("/api/v1/reviews", status_code=202)
    def submit_review(payload: ReviewSubmit, session: SessionDep, request: Request) -> dict:
        if not request.app.state.feedback_enabled:
            raise HTTPException(status_code=503, detail="Submissions unavailable")
        content = payload.model_dump(mode="json", exclude={"self_report_consent"})
        request_id = content["request_id"]
        content_hash = hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()
        with session.begin():
            existing = session.scalar(select(Review).where(Review.request_id == request_id))
            if existing is not None:
                if existing.content_hash != content_hash:
                    raise conflict()
                return {
                    "receipt_id": existing.id,
                    "status": "rejected" if existing.status == "removed" else existing.status,
                }
            client = request.client.host if request.client else "unknown"
            if not request.app.state.write_limiter.allow(client, "new_reviews", 5, 3600):
                raise HTTPException(status_code=429, detail="Too many requests")
            listing = session.get(Listing, payload.listing_id)
            if (
                listing is None
                or not is_fresh(listing, now_utc())
                or payload.season_year != listing.season_year
            ):
                raise missing()
            review = Review(
                **content,
                content_hash=content_hash,
                status="pending",
                submitted_at=now_utc(),
            )
            try:
                with session.begin_nested():
                    session.add(review)
                    session.flush()
            except IntegrityError:
                existing = session.scalar(select(Review).where(Review.request_id == request_id))
                if existing is None or existing.content_hash != content_hash:
                    raise conflict() from None
                return {
                    "receipt_id": existing.id,
                    "status": "rejected" if existing.status == "removed" else existing.status,
                }
        return {"receipt_id": review.id, "status": "pending"}

    @app.post("/api/v1/reports", status_code=202)
    def submit_report(payload: ReportSubmit, session: SessionDep, request: Request) -> dict:
        if not request.app.state.feedback_enabled:
            raise HTTPException(status_code=503, detail="Submissions unavailable")
        content = payload.model_dump(mode="json")
        request_id = content["request_id"]
        content_hash = hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()
        with session.begin():
            existing = session.scalar(select(Report).where(Report.request_id == request_id))
            if existing is not None:
                if existing.content_hash != content_hash:
                    raise conflict()
                return {"receipt_id": existing.id, "status": "received"}
            client = request.client.host if request.client else "unknown"
            if not request.app.state.write_limiter.allow(client, "new_reports", 10, 3600):
                raise HTTPException(status_code=429, detail="Too many requests")
            if payload.item_type == "review":
                item = session.get(Review, payload.item_id)
                if item is None or item.status != "approved":
                    raise missing()
            else:
                item = session.get(Listing, payload.item_id)
                if item is None or item.published_at is None:
                    raise missing()
            report = Report(**content, content_hash=content_hash, submitted_at=now_utc())
            try:
                with session.begin_nested():
                    session.add(report)
                    session.flush()
            except IntegrityError:
                existing = session.scalar(select(Report).where(Report.request_id == request_id))
                if existing is None or existing.content_hash != content_hash:
                    raise conflict() from None
                return {"receipt_id": existing.id, "status": "received"}
        return {"receipt_id": report.id, "status": "received"}

    @app.post("/api/v1/portal/sessions", status_code=201)
    def create_portal_session(
        session: SessionDep,
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    ) -> dict:
        if (
            credentials is None
            or credentials.scheme.lower() != "bearer"
            or not 32 <= len(credentials.credentials) <= 256
        ):
            raise HTTPException(status_code=401, detail="Unauthorized")
        organization = session.scalar(
            select(Organization).where(
                Organization.access_key_hash
                == hashlib.sha256(credentials.credentials.encode()).hexdigest(),
                Organization.status == "active",
            )
        )
        if organization is None:
            raise HTTPException(status_code=401, detail="Unauthorized")
        raw_token = token_urlsafe(32)
        moment = now_utc()
        session.execute(sa_delete(PortalSession).where(PortalSession.expires_at <= moment))
        session.add(
            PortalSession(
                token_hash=hashlib.sha256(raw_token.encode()).hexdigest(),
                actor=f"company:{organization.id}",
                role="provider",
                organization_id=organization.id,
                created_at=moment,
                expires_at=moment + timedelta(hours=8),
            )
        )
        session.commit()
        return {
            "token": raw_token,
            "role": "provider",
            "organization_id": organization.id,
            "expires_at": moment + timedelta(hours=8),
        }

    @app.get("/api/v1/portal/session")
    def read_portal_session(session: SessionDep, principal: PortalDep) -> dict:
        organization = (
            session.get(Organization, principal.organization_id)
            if principal.organization_id
            else None
        )
        return {
            "role": principal.role,
            "organization_id": principal.organization_id,
            "organization_name": organization.name if organization else None,
            "organization_address": organization.address if organization else None,
            "organization_website_url": organization.website_url if organization else None,
        }

    @app.delete("/api/v1/portal/session", status_code=204)
    def delete_portal_session(
        session: SessionDep,
        _: PortalDep,
        token: Annotated[str, Header(alias="X-Portal-Session")],
    ) -> None:
        session.execute(
            sa_delete(PortalSession).where(
                PortalSession.token_hash == hashlib.sha256(token.encode()).hexdigest()
            )
        )
        session.commit()

    @app.get("/api/v1/portal/me")
    def read_portal_identity(session: SessionDep, principal: PortalDep) -> dict:
        organization = (
            session.get(Organization, principal.organization_id)
            if principal.organization_id
            else None
        )
        return {
            "telegram_user_id": principal.telegram_user_id,
            "role": principal.role,
            "organization_name": organization.name if organization else None,
            "organization_address": organization.address if organization else None,
            "organization_website_url": organization.website_url if organization else None,
        }

    @app.get("/api/v1/portal/employers")
    def portal_employers(session: SessionDep, _: MemberDep) -> dict:
        rows = session.scalars(select(Employer).order_by(Employer.legal_name, Employer.id)).all()
        return {"items": [admin_record(row) for row in rows]}

    @app.get("/api/v1/provider/listings")
    def provider_listings(session: SessionDep, principal: MemberDep) -> dict:
        if principal.role != "provider":
            raise HTTPException(status_code=403, detail="Forbidden")
        rows = session.scalars(
            select(Listing)
            .where(Listing.organization_id == principal.organization_id)
            .order_by(Listing.state_changed_at.desc(), Listing.id.desc())
        ).all()
        return {"items": [admin_record(row) for row in rows]}

    @app.post("/api/v1/provider/listings", status_code=201)
    def provider_create_listing(
        payload: ListingContent, session: SessionDep, principal: MemberDep
    ) -> dict:
        if principal.role != "provider":
            raise HTTPException(status_code=403, detail="Forbidden")
        session.rollback()
        with session.begin():
            if session.get(Employer, payload.employer_id) is None:
                raise HTTPException(status_code=422, detail="Invalid request")
            listing = Listing(
                **payload.model_dump(),
                organization_id=principal.organization_id,
                status="draft",
                submission_status="draft",
                state_changed_at=now_utc(),
            )
            session.add(listing)
            session.flush()
            audit(session, principal.actor, "provider_listing_created", "listing", listing.id, {})
        return jsonable_encoder(admin_record(listing))

    def provider_listing(session: Session, principal: PortalPrincipal, listing_id: str) -> Listing:
        if principal.role != "provider":
            raise HTTPException(status_code=403, detail="Forbidden")
        listing = session.scalar(
            select(Listing).where(
                Listing.id == listing_id,
                Listing.organization_id == principal.organization_id,
            )
        )
        if listing is None:
            raise missing()
        return listing

    @app.get("/api/v1/provider/listings/{listing_id}")
    def provider_read_listing(listing_id: str, session: SessionDep, principal: MemberDep) -> dict:
        return jsonable_encoder(admin_record(provider_listing(session, principal, listing_id)))

    @app.put("/api/v1/provider/listings/{listing_id}")
    def provider_edit_listing(
        listing_id: str,
        payload: ListingEdit,
        session: SessionDep,
        principal: MemberDep,
    ) -> dict:
        session.rollback()
        with session.begin():
            listing = provider_listing(session, principal, listing_id)
            session.refresh(listing, with_for_update=True)
            checked_version(listing.version, payload.expected_version)
            if listing.status != "draft" or listing.submission_status == "pending":
                raise conflict()
            if listing.employer_id != payload.content.employer_id:
                raise conflict()
            for name, value in payload.content.model_dump().items():
                setattr(listing, name, value)
            listing.submission_status = "draft"
            listing.submission_note = None
            listing.state_changed_at = now_utc()
            listing.version += 1
            audit(session, principal.actor, "provider_listing_edited", "listing", listing.id, {})
        return jsonable_encoder(admin_record(listing))

    @app.post("/api/v1/provider/listings/{listing_id}/submit")
    def provider_submit_listing(
        listing_id: str,
        payload: SubmissionAction,
        session: SessionDep,
        principal: MemberDep,
    ) -> dict:
        session.rollback()
        with session.begin():
            listing = provider_listing(session, principal, listing_id)
            session.refresh(listing, with_for_update=True)
            checked_version(listing.version, payload.expected_version)
            if listing.status != "draft" or listing.submission_status not in {
                "draft",
                "changes_requested",
            }:
                raise conflict()
            listing.submission_status = "pending"
            listing.submission_note = None
            listing.state_changed_at = now_utc()
            listing.version += 1
            audit(session, principal.actor, "listing_submitted", "listing", listing.id, {})
        return jsonable_encoder(admin_record(listing))

    @app.post("/api/v1/provider/listings/{listing_id}/close")
    def provider_close_listing(
        listing_id: str,
        payload: SubmissionAction,
        session: SessionDep,
        principal: MemberDep,
    ) -> dict:
        session.rollback()
        with session.begin():
            listing = provider_listing(session, principal, listing_id)
            session.refresh(listing, with_for_update=True)
            checked_version(listing.version, payload.expected_version)
            if listing.status not in {"published", "paused", "expired"}:
                raise conflict()
            prior = listing.status
            listing.status = "closed"
            listing.state_changed_at = now_utc()
            listing.version += 1
            audit(
                session,
                principal.actor,
                "provider_listing_closed",
                "listing",
                listing.id,
                {"from": prior},
            )
        return jsonable_encoder(admin_record(listing))

    @app.get("/api/v1/portal/submissions")
    def operator_submissions(session: SessionDep, principal: MemberDep) -> dict:
        if principal.role != "operator":
            raise HTTPException(status_code=403, detail="Forbidden")
        rows = session.scalars(
            select(Listing)
            .where(Listing.submission_status == "pending")
            .order_by(Listing.state_changed_at, Listing.id)
        ).all()
        return {"items": [admin_record(row) for row in rows]}

    @app.post("/api/v1/portal/submissions/{listing_id}/changes")
    def request_submission_changes(
        listing_id: str,
        payload: SubmissionDecision,
        session: SessionDep,
        principal: MemberDep,
    ) -> dict:
        if principal.role != "operator":
            raise HTTPException(status_code=403, detail="Forbidden")
        session.rollback()
        with session.begin():
            listing = locked_listing(session, listing_id, payload.expected_version)
            if listing.submission_status != "pending":
                raise conflict()
            listing.submission_status = "changes_requested"
            listing.submission_note = payload.note
            listing.version += 1
            audit(
                session,
                principal.actor,
                "listing_changes_requested",
                "listing",
                listing.id,
                {"note": payload.note},
            )
        return jsonable_encoder(admin_record(listing))

    @app.post("/api/v1/portal/submissions/{listing_id}/approve")
    def approve_submission(
        listing_id: str,
        payload: SubmissionDecision,
        session: SessionDep,
        principal: MemberDep,
    ) -> dict:
        if principal.role != "operator":
            raise HTTPException(status_code=403, detail="Forbidden")
        session.rollback()
        with session.begin():
            listing = locked_listing(session, listing_id, payload.expected_version)
            moment = now_utc()
            if (
                listing.status != "draft"
                or listing.submission_status != "pending"
                or blocks_publication(session, listing, moment)
            ):
                raise conflict()
            listing.last_confirmed_at = moment
            listing.confirmation_source_url = listing.official_source_url
            listing.published_at = moment
            listing.status = "published"
            listing.submission_status = "approved"
            listing.submission_note = None
            listing.state_changed_at = moment
            listing.version += 1
            audit(
                session,
                principal.actor,
                "listing_approved",
                "listing",
                listing.id,
                {"reason": payload.note, "source_url": listing.official_source_url},
            )
        return jsonable_encoder(admin_record(listing))

    @app.post("/api/v1/admin/organizations", status_code=201)
    def create_organization(
        payload: OrganizationCreate, session: SessionDep, actor: AdminDep
    ) -> dict:
        access_key = f"iter_company_{token_urlsafe(32)}"
        organization = Organization(
            **payload.model_dump(),
            key=f"company-{token_urlsafe(9).lower().replace('_', '-')}",
            status="active",
            access_key_hash=hashlib.sha256(access_key.encode()).hexdigest(),
            access_key_hint=access_key[-8:],
            access_key_created_at=now_utc(),
        )
        with session.begin():
            session.add(organization)
            session.flush()
            audit(session, actor, "organization_created", "organization", organization.id, {})
        return jsonable_encoder(organization_record(organization) | {"access_key": access_key})

    def organization_by_id(session: Session, organization_id: str) -> Organization:
        organization = session.get(Organization, organization_id)
        if organization is None:
            raise missing()
        return organization

    @app.get("/api/v1/admin/organizations")
    def list_organizations(session: SessionDep, _: AdminDep) -> dict:
        organizations = session.scalars(
            select(Organization).order_by(Organization.name, Organization.id)
        ).all()
        counts: dict[str, dict[str, int]] = {}
        state = effective_status_sql(now_utc()).label("state")
        for organization_id, status, total in session.execute(
            select(Listing.organization_id, state, func.count())
            .where(Listing.organization_id.is_not(None))
            .group_by(Listing.organization_id, state)
        ):
            counts.setdefault(organization_id, {})[status] = total
        return {
            "items": [
                organization_record(organization)
                | {"listing_counts": counts.get(organization.id, {})}
                for organization in organizations
            ]
        }

    @app.get("/api/v1/admin/organizations/{organization_id}")
    def read_organization(organization_id: str, session: SessionDep, _: AdminDep) -> dict:
        return jsonable_encoder(organization_record(organization_by_id(session, organization_id)))

    @app.put("/api/v1/admin/organizations/{organization_id}")
    def edit_organization(
        organization_id: str,
        payload: OrganizationEdit,
        session: SessionDep,
        actor: AdminDep,
    ) -> dict:
        session.rollback()
        with session.begin():
            organization = organization_by_id(session, organization_id)
            session.refresh(organization, with_for_update=True)
            checked_version(organization.version, payload.expected_version)
            organization.name = payload.name
            organization.website_url = payload.website_url
            organization.address = payload.address
            organization.version += 1
            audit(
                session,
                actor,
                "organization_updated",
                "organization",
                organization.id,
                {},
            )
        return jsonable_encoder(organization_record(organization))

    @app.post("/api/v1/admin/organizations/{organization_id}/access-key")
    def rotate_organization_access_key(
        organization_id: str,
        payload: OrganizationAccessAction,
        session: SessionDep,
        actor: AdminDep,
    ) -> dict:
        access_key = f"iter_company_{token_urlsafe(32)}"
        with session.begin():
            organization = organization_by_id(session, organization_id)
            session.refresh(organization, with_for_update=True)
            checked_version(organization.version, payload.expected_version)
            if not organization.website_url or not organization.address:
                raise conflict()
            organization.access_key_hash = hashlib.sha256(access_key.encode()).hexdigest()
            organization.access_key_hint = access_key[-8:]
            organization.access_key_created_at = now_utc()
            organization.version += 1
            session.execute(
                sa_delete(PortalSession).where(PortalSession.organization_id == organization.id)
            )
            audit(
                session,
                actor,
                "organization_access_key_rotated",
                "organization",
                organization.id,
                {},
            )
        return jsonable_encoder(organization_record(organization) | {"access_key": access_key})

    @app.post("/api/v1/admin/organizations/{organization_id}/status")
    def change_organization_status(
        organization_id: str,
        payload: OrganizationStatusAction,
        session: SessionDep,
        actor: AdminDep,
    ) -> dict:
        session.rollback()
        with session.begin():
            organization = organization_by_id(session, organization_id)
            session.refresh(organization, with_for_update=True)
            checked_version(organization.version, payload.expected_version)
            if organization.status == payload.status:
                raise conflict()
            previous = organization.status
            organization.status = payload.status
            organization.version += 1
            session.execute(
                sa_delete(PortalSession).where(PortalSession.organization_id == organization.id)
            )
            audit(
                session,
                actor,
                f"organization_{payload.status}",
                "organization",
                organization.id,
                {"from": previous, "to": payload.status, "reason": payload.reason},
            )
        return jsonable_encoder(organization_record(organization))

    @app.post("/api/v1/admin/employers", status_code=201)
    def create_employer(payload: EmployerCreate, session: SessionDep, actor: AdminDep) -> dict:
        with session.begin():
            employer = Employer(**payload.model_dump())
            session.add(employer)
            session.flush()
            audit(session, actor, "employer_created", "employer", employer.id, {})
        return jsonable_encoder(admin_record(employer))

    @app.get("/api/v1/admin/employers/{employer_id}")
    def read_employer(employer_id: str, session: SessionDep, actor: AdminDep) -> dict:
        employer = session.get(Employer, employer_id)
        if employer is None:
            raise missing()
        return jsonable_encoder(admin_record(employer))

    @app.put("/api/v1/admin/employers/{employer_id}")
    def edit_employer(
        employer_id: str, payload: EmployerEdit, session: SessionDep, actor: AdminDep
    ) -> dict:
        with session.begin():
            employer = session.scalar(
                select(Employer).where(Employer.id == employer_id).with_for_update()
            )
            if employer is None:
                raise missing()
            checked_version(employer.version, payload.expected_version)
            previous = employer.identity_status
            employer.legal_name = payload.legal_name
            employer.official_website_url = payload.official_website_url
            employer.identity_status = payload.identity_status
            employer.identity_source_url = payload.identity_source_url
            employer.identity_checked_at = (
                now_utc() if payload.identity_status != "not_checked" else None
            )
            employer.version += 1
            audit(
                session,
                actor,
                "employer_verified",
                "employer",
                employer.id,
                {"from": previous, "to": employer.identity_status},
            )
            if employer.identity_status == "disputed":
                for listing in session.scalars(
                    select(Listing)
                    .where(Listing.employer_id == employer.id, Listing.status == "published")
                    .with_for_update()
                ):
                    listing.status = "paused"
                    listing.state_changed_at = now_utc()
                    listing.version += 1
                    audit(
                        session,
                        actor,
                        "listing_paused",
                        "listing",
                        listing.id,
                        {"reason": "employer identity disputed"},
                    )
        return jsonable_encoder(admin_record(employer))

    @app.post("/api/v1/admin/listings", status_code=201)
    def create_listing(payload: AdminListingCreate, session: SessionDep, actor: AdminDep) -> dict:
        organization_id = str(payload.organization_id) if payload.organization_id else None
        with session.begin():
            if session.get(Employer, payload.employer_id) is None:
                raise HTTPException(status_code=422, detail="Invalid request")
            if organization_id and session.get(Organization, organization_id) is None:
                raise HTTPException(status_code=422, detail="Invalid request")
            listing = Listing(
                **payload.model_dump(exclude={"organization_id"}),
                organization_id=organization_id,
                status="draft",
                submission_status="draft",
                state_changed_at=now_utc(),
            )
            session.add(listing)
            session.flush()
            audit(
                session,
                actor,
                "listing_created",
                "listing",
                listing.id,
                {"status": "draft", "organization_id": organization_id},
            )
        return jsonable_encoder(admin_record(listing))

    @app.get("/api/v1/admin/listings")
    def admin_listings(
        session: SessionDep,
        _: AdminDep,
        status: Annotated[
            str, Query(pattern="^(open|all|draft|pending|published|paused|expired|closed)$")
        ] = "open",
        organization_id: Annotated[str | None, Query(min_length=36, max_length=36)] = None,
        q: Annotated[str | None, Query(min_length=1, max_length=80)] = None,
        limit: Annotated[int, Query(ge=1, le=100)] = 100,
        cursor: Annotated[str | None, Query(min_length=36, max_length=36)] = None,
    ) -> dict:
        moment = now_utc()
        conditions = []
        if status != "all":
            effective = effective_status_sql(moment)
            conditions.append(effective != "closed" if status == "open" else effective == status)
        if organization_id:
            conditions.append(Listing.organization_id == organization_id)
        if q:
            escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            pattern = f"%{escaped}%"
            conditions.append(
                or_(
                    Listing.role.ilike(pattern, escape="\\"),
                    Listing.city.ilike(pattern, escape="\\"),
                    Listing.source_identifier.ilike(pattern, escape="\\"),
                    Employer.legal_name.ilike(pattern, escape="\\"),
                    Organization.name.ilike(pattern, escape="\\"),
                )
            )
        if cursor:
            boundary = session.get(Listing, cursor)
            if boundary is None:
                raise missing()
            conditions.append(
                or_(
                    Listing.state_changed_at < boundary.state_changed_at,
                    and_(
                        Listing.state_changed_at == boundary.state_changed_at,
                        Listing.id < boundary.id,
                    ),
                )
            )
        rows = session.execute(
            select(Listing, Employer.legal_name, Organization.name)
            .join(Listing.employer)
            .outerjoin(Listing.organization)
            .where(*conditions)
            .order_by(Listing.state_changed_at.desc(), Listing.id.desc())
            .limit(limit + 1)
        ).all()
        items = [
            admin_record(listing)
            | {
                "effective_status": effective_status(listing, moment),
                "employer_name": employer_name,
                "organization_name": organization_name,
            }
            for listing, employer_name, organization_name in rows[:limit]
        ]
        return jsonable_encoder(
            {
                "items": items,
                "next_cursor": rows[limit - 1][0].id if len(rows) > limit else None,
            }
        )

    @app.get("/api/v1/admin/listings/{listing_id}")
    def read_admin_listing(listing_id: str, session: SessionDep, actor: AdminDep) -> dict:
        listing = session.get(Listing, listing_id)
        if listing is None:
            raise missing()
        data = admin_record(listing)
        data["effective_status"] = (
            "expired"
            if listing.status == "published" and not is_fresh(listing, now_utc())
            else listing.status
        )
        return jsonable_encoder(data)

    @app.put("/api/v1/admin/listings/{listing_id}")
    def edit_listing(
        listing_id: str, payload: AdminListingEdit, session: SessionDep, actor: AdminDep
    ) -> dict:
        with session.begin():
            listing = locked_listing(session, listing_id, payload.expected_version)
            if listing.status == "closed" or listing.submission_status == "pending":
                raise conflict()
            immutable = (listing.employer_id, listing.season_year, listing.source_identifier)
            content = payload.content.model_dump()
            if immutable != (
                content["employer_id"],
                content["season_year"],
                content["source_identifier"],
            ):
                raise conflict()
            fields = sorted(
                name for name, value in content.items() if getattr(listing, name) != value
            )
            if not fields:
                return jsonable_encoder(admin_record(listing))
            live = listing.status == "published"
            if live and {"official_source_url", "contact_url"} & set(fields) and not payload.reason:
                raise HTTPException(status_code=422, detail="Invalid request")
            for name in fields:
                setattr(listing, name, content[name])
            if live and blocks_publication(session, listing, now_utc()):
                raise conflict()
            if not live:
                listing.state_changed_at = now_utc()
            listing.version += 1
            audit(
                session,
                actor,
                "listing_edited",
                "listing",
                listing.id,
                {
                    "version": listing.version,
                    "fields": fields,
                    "live": live,
                    "reason": payload.reason,
                },
            )
        return jsonable_encoder(admin_record(listing))

    @app.post("/api/v1/admin/listings/{listing_id}/republish")
    def republish_listing(
        listing_id: str, payload: Confirmation, session: SessionDep, actor: AdminDep
    ) -> dict:
        with session.begin():
            listing = locked_listing(session, listing_id, payload.expected_version)
            moment = now_utc()
            stale = listing.status == "published" and not is_fresh(listing, moment)
            if not (listing.status in {"paused", "expired"} or stale):
                raise conflict()
            if blocks_publication(session, listing, moment):
                raise conflict()
            previous = "expired" if stale else listing.status
            listing.last_confirmed_at = moment
            listing.confirmation_source_url = payload.confirmation_source_url
            listing.published_at = moment
            listing.status = "published"
            listing.state_changed_at = moment
            listing.version += 1
            audit(
                session,
                actor,
                "listing_confirmed",
                "listing",
                listing.id,
                {"source_url": payload.confirmation_source_url, "reason": payload.reason},
            )
            audit(
                session,
                actor,
                "listing_published",
                "listing",
                listing.id,
                {"from": previous, "to": "published", "reason": payload.reason},
            )
        return jsonable_encoder(admin_record(listing))

    @app.post("/api/v1/admin/listings/{listing_id}/delete")
    def delete_listing(
        listing_id: str, payload: VersionedAction, session: SessionDep, actor: AdminDep
    ) -> dict:
        with session.begin():
            listing = locked_listing(session, listing_id, payload.expected_version)
            if (
                listing.status != "draft"
                or listing.published_at is not None
                or listing.submission_status == "pending"
                or session.scalar(select(Review.id).where(Review.listing_id == listing.id).limit(1))
                or session.scalar(
                    select(Report.id)
                    .where(Report.item_type == "listing", Report.item_id == listing.id)
                    .limit(1)
                )
            ):
                raise conflict()
            audit(
                session,
                actor,
                "listing_deleted",
                "listing",
                listing.id,
                {
                    "organization_id": listing.organization_id,
                    "employer_id": listing.employer_id,
                    "season_year": listing.season_year,
                    "source_identifier": listing.source_identifier,
                    "reason": payload.reason,
                },
            )
            session.delete(listing)
        return {"deleted": listing_id}

    @app.post("/api/v1/admin/listings/{listing_id}/confirm")
    def confirm_listing(
        listing_id: str, payload: Confirmation, session: SessionDep, actor: AdminDep
    ) -> dict:
        with session.begin():
            listing = locked_listing(session, listing_id, payload.expected_version)
            moment = now_utc()
            if listing.status == "closed":
                raise conflict()
            if listing.status == "published" and not is_fresh(listing, moment):
                listing.status = "expired"
                listing.state_changed_at = listing.last_confirmed_at + FRESHNESS
                audit(session, actor, "listing_expired", "listing", listing.id, {})
            listing.last_confirmed_at = moment
            listing.confirmation_source_url = payload.confirmation_source_url
            listing.version += 1
            audit(
                session,
                actor,
                "listing_confirmed",
                "listing",
                listing.id,
                {"source_url": payload.confirmation_source_url, "reason": payload.reason},
            )
        return jsonable_encoder(admin_record(listing))

    @app.post("/api/v1/admin/listings/{listing_id}/sponsor")
    def assess_sponsor(
        listing_id: str, payload: SponsorAssessment, session: SessionDep, actor: AdminDep
    ) -> dict:
        with session.begin():
            listing = locked_listing(session, listing_id, payload.expected_version)
            if listing.status == "closed":
                raise conflict()
            listing.sponsor_route_status = payload.route_status
            listing.sponsor_route_source_url = payload.route_source_url
            listing.sponsor_approval_status = payload.approval_status
            listing.sponsor_name = payload.sponsor_name
            listing.sponsor_decision_url = payload.decision_url
            listing.sponsor_decision_at = (
                now_utc() if payload.approval_status != "unknown" else None
            )
            listing.version += 1
            audit(
                session,
                actor,
                "sponsor_assessed",
                "listing",
                listing.id,
                {
                    "route": payload.route_status,
                    "approval": payload.approval_status,
                    "reason": payload.reason,
                },
            )
        return jsonable_encoder(admin_record(listing))

    def change_state(
        listing_id: str, payload: VersionedAction, session: Session, actor: str, target: str
    ) -> dict:
        with session.begin():
            listing = locked_listing(session, listing_id, payload.expected_version)
            previous = listing.status
            moment = now_utc()
            if target == "published":
                if previous not in {"draft", "paused", "expired"}:
                    raise conflict()
                if (
                    listing.last_confirmed_at is None
                    or listing.last_confirmed_at <= moment - FRESHNESS
                    or listing.confirmation_source_url is None
                    or (
                        previous in {"paused", "expired"}
                        and listing.last_confirmed_at <= listing.state_changed_at
                    )
                    or blocks_publication(session, listing, moment)
                ):
                    raise conflict()
                listing.published_at = moment
            elif target == "paused":
                if previous != "published":
                    raise conflict()
            elif target == "closed":
                if previous == "closed":
                    raise conflict()
            listing.status = target
            listing.state_changed_at = moment
            listing.version += 1
            audit(
                session,
                actor,
                f"listing_{target}",
                "listing",
                listing.id,
                {"from": previous, "to": target, "reason": payload.reason},
            )
        return jsonable_encoder(admin_record(listing))

    @app.post("/api/v1/admin/listings/{listing_id}/publish")
    def publish(
        listing_id: str, payload: VersionedAction, session: SessionDep, actor: AdminDep
    ) -> dict:
        return change_state(listing_id, payload, session, actor, "published")

    @app.post("/api/v1/admin/listings/{listing_id}/pause")
    def pause(
        listing_id: str, payload: VersionedAction, session: SessionDep, actor: AdminDep
    ) -> dict:
        return change_state(listing_id, payload, session, actor, "paused")

    @app.post("/api/v1/admin/listings/{listing_id}/close")
    def close(
        listing_id: str, payload: VersionedAction, session: SessionDep, actor: AdminDep
    ) -> dict:
        return change_state(listing_id, payload, session, actor, "closed")

    @app.post("/api/v1/admin/expire")
    def reconcile_expired(session: SessionDep, actor: AdminDep) -> dict:
        cutoff = now_utc() - FRESHNESS
        with session.begin():
            expired = session.scalars(
                select(Listing)
                .where(Listing.status == "published", Listing.last_confirmed_at <= cutoff)
                .order_by(Listing.last_confirmed_at, Listing.id)
                .limit(100)
                .with_for_update(skip_locked=True)
            ).all()
            for listing in expired:
                listing.status = "expired"
                listing.state_changed_at = listing.last_confirmed_at + FRESHNESS
                listing.version += 1
                audit(session, actor, "listing_expired", "listing", listing.id, {})
        return {"expired": len(expired)}

    @app.get("/api/v1/admin/reviews/{review_id}")
    def admin_review(review_id: str, session: SessionDep, actor: AdminDep) -> dict:
        review = session.get(Review, review_id)
        if review is None:
            raise missing()
        return jsonable_encoder(admin_record(review))

    @app.get("/api/v1/admin/reviews")
    def admin_reviews(
        session: SessionDep,
        actor: AdminDep,
        status: Annotated[str, Query(pattern="^(pending|approved|rejected|removed)$")] = "pending",
        limit: Annotated[int, Query(ge=1, le=100)] = 100,
        cursor: Annotated[str | None, Query(min_length=36, max_length=36)] = None,
    ) -> dict:
        conditions = [Review.status == status]
        if cursor:
            boundary = session.get(Review, cursor)
            if boundary is None or boundary.status != status:
                raise missing()
            conditions.append(
                or_(
                    Review.submitted_at > boundary.submitted_at,
                    (Review.submitted_at == boundary.submitted_at) & (Review.id > boundary.id),
                )
            )
        rows = session.scalars(
            select(Review)
            .where(*conditions)
            .order_by(Review.submitted_at, Review.id)
            .limit(limit + 1)
        ).all()
        return jsonable_encoder(
            {
                "items": [admin_record(row) for row in rows[:limit]],
                "next_cursor": rows[limit - 1].id if len(rows) > limit else None,
            }
        )

    @app.post("/api/v1/admin/reviews/{review_id}/redact")
    def redact_review(
        review_id: str, payload: ReviewRedaction, session: SessionDep, actor: AdminDep
    ) -> dict:
        with session.begin():
            review = session.scalar(select(Review).where(Review.id == review_id).with_for_update())
            if review is None:
                raise missing()
            checked_version(review.version, payload.expected_version)
            if review.status not in {"pending", "approved"}:
                raise conflict()
            changes_text = "text" in payload.model_fields_set
            if not changes_text and payload.role is None:
                raise conflict()
            if changes_text:
                review.text = payload.text
            if payload.role is not None:
                review.role = payload.role
            review.version += 1
            audit(
                session,
                actor,
                "review_redacted",
                "review",
                review.id,
                {"reason": payload.reason, "status": review.status},
            )
        return jsonable_encoder(admin_record(review))

    @app.post("/api/v1/admin/reviews/{review_id}/{decision}")
    def moderate_review(
        review_id: str,
        decision: str,
        payload: VersionedAction,
        session: SessionDep,
        actor: AdminDep,
    ) -> dict:
        if decision not in {"approve", "reject", "remove"}:
            raise missing()
        with session.begin():
            review = session.scalar(select(Review).where(Review.id == review_id).with_for_update())
            if review is None:
                raise missing()
            checked_version(review.version, payload.expected_version)
            target = {"approve": "approved", "reject": "rejected", "remove": "removed"}[decision]
            if (review.status, target) not in {
                ("pending", "approved"),
                ("pending", "rejected"),
                ("approved", "removed"),
            }:
                raise conflict()
            prior = review.status
            review.status = target
            if target in {"rejected", "removed"}:
                review.role = "redacted"
                review.text = None
            review.version += 1
            audit(
                session,
                actor,
                "review_moderated",
                "review",
                review.id,
                {"from": prior, "to": target, "reason": payload.reason},
            )
        return jsonable_encoder(admin_record(review))

    @app.get("/api/v1/admin/reports")
    def admin_reports(
        session: SessionDep,
        actor: AdminDep,
        status: Annotated[str, Query(pattern="^(pending|resolved|dismissed)$")] = "pending",
        limit: Annotated[int, Query(ge=1, le=100)] = 100,
        cursor: Annotated[str | None, Query(min_length=36, max_length=36)] = None,
    ) -> dict:
        conditions = [Report.status == status]
        if cursor:
            boundary = session.get(Report, cursor)
            if boundary is None or boundary.status != status:
                raise missing()
            conditions.append(
                or_(
                    Report.submitted_at > boundary.submitted_at,
                    (Report.submitted_at == boundary.submitted_at) & (Report.id > boundary.id),
                )
            )
        rows = session.scalars(
            select(Report)
            .where(*conditions)
            .order_by(Report.submitted_at, Report.id)
            .limit(limit + 1)
        ).all()
        return jsonable_encoder(
            {
                "items": [admin_record(row) for row in rows[:limit]],
                "next_cursor": rows[limit - 1].id if len(rows) > limit else None,
            }
        )

    @app.post("/api/v1/admin/reports/{report_id}/{decision}")
    def decide_report(
        report_id: str,
        decision: str,
        payload: VersionedAction,
        session: SessionDep,
        actor: AdminDep,
    ) -> dict:
        if decision not in {"resolve", "dismiss"}:
            raise missing()
        with session.begin():
            report = session.scalar(select(Report).where(Report.id == report_id).with_for_update())
            if report is None:
                raise missing()
            checked_version(report.version, payload.expected_version)
            if report.status != "pending":
                raise conflict()
            report.status = "resolved" if decision == "resolve" else "dismissed"
            report.decided_at = now_utc()
            report.version += 1
            audit(
                session,
                actor,
                "report_decided",
                "report",
                report.id,
                {"to": report.status, "reason": payload.reason},
            )
        return jsonable_encoder(admin_record(report))

    @app.get("/api/v1/admin/listings-needing-confirmation")
    def listings_needing_confirmation(
        session: SessionDep,
        actor: AdminDep,
        limit: Annotated[int, Query(ge=1, le=100)] = 100,
        cursor: Annotated[str | None, Query(min_length=36, max_length=36)] = None,
    ) -> dict:
        conditions = [
            Listing.status.in_(["published", "expired"]),
            Listing.last_confirmed_at <= now_utc() - FRESHNESS,
        ]
        if cursor:
            boundary = session.get(Listing, cursor)
            if (
                boundary is None
                or boundary.status not in {"published", "expired"}
                or boundary.last_confirmed_at is None
                or boundary.last_confirmed_at > now_utc() - FRESHNESS
            ):
                raise missing()
            conditions.append(
                or_(
                    Listing.last_confirmed_at > boundary.last_confirmed_at,
                    (Listing.last_confirmed_at == boundary.last_confirmed_at)
                    & (Listing.id > boundary.id),
                )
            )
        rows = session.scalars(
            select(Listing)
            .where(*conditions)
            .order_by(Listing.last_confirmed_at, Listing.id)
            .limit(limit + 1)
        ).all()
        return jsonable_encoder(
            {
                "items": [admin_record(row) for row in rows[:limit]],
                "next_cursor": rows[limit - 1].id if len(rows) > limit else None,
            }
        )

    @app.get("/api/v1/admin/audit")
    def read_audit(
        session: SessionDep,
        actor: AdminDep,
        entity_type: Annotated[
            str | None, Query(pattern="^(employer|listing|review|report)$")
        ] = None,
        entity_id: Annotated[str | None, Query(min_length=36, max_length=36)] = None,
        limit: Annotated[int, Query(ge=1, le=100)] = 50,
        cursor: Annotated[str | None, Query(min_length=36, max_length=36)] = None,
    ) -> dict:
        query = select(AuditEvent)
        if entity_type:
            query = query.where(AuditEvent.entity_type == entity_type)
        if entity_id:
            query = query.where(AuditEvent.entity_id == entity_id)
        if cursor:
            boundary = session.get(AuditEvent, cursor)
            if (
                boundary is None
                or (entity_type is not None and boundary.entity_type != entity_type)
                or (entity_id is not None and boundary.entity_id != entity_id)
            ):
                raise missing()
            query = query.where(
                or_(
                    AuditEvent.occurred_at < boundary.occurred_at,
                    (AuditEvent.occurred_at == boundary.occurred_at)
                    & (AuditEvent.id < boundary.id),
                )
            )
        events = session.scalars(
            query.order_by(AuditEvent.occurred_at.desc(), AuditEvent.id.desc()).limit(limit + 1)
        ).all()
        return jsonable_encoder(
            {
                "items": [admin_record(event) for event in events[:limit]],
                "next_cursor": events[limit - 1].id if len(events) > limit else None,
            }
        )

    return app
