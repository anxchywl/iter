import hashlib
import hmac
import json
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import Barrier
from urllib.parse import urlencode

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from alembic import command
from app.main import create_app
from tests.conftest import OPERATOR_TELEGRAM_ID, TELEGRAM_BOT_TOKEN

PROVIDER_TELEGRAM_ID = 7000002
OTHER_PROVIDER_TELEGRAM_ID = 7000003


def employer(client, auth):
    response = client.post(
        "/api/v1/admin/employers",
        headers=auth,
        json={
            "legal_name": "Example Hospitality LLC",
            "official_website_url": "https://example.com",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def listing_content(employer_id, identifier="role-1", **changes):
    content = {
        "employer_id": employer_id,
        "source_identifier": identifier,
        "season_year": 2027,
        "state": "New York",
        "city": "Albany",
        "location_timezone": "America/New_York",
        "category": "Hospitality",
        "role": "Front desk assistant",
        "duties": "Check in guests",
        "official_source_url": "https://example.com/jobs/role-1",
        "contact_url": "https://example.com/jobs/apply",
        "work_start_date": "2027-06-01",
        "work_end_date": "2027-08-30",
        "wage_amount": "16.50",
        "wage_currency": "USD",
        "wage_basis": "hour",
        "expected_hours_per_week": "35",
    }
    content.update(changes)
    return content


def draft(client, auth, employer_id, identifier="role-1", **changes):
    response = client.post(
        "/api/v1/admin/listings",
        headers=auth,
        json=listing_content(employer_id, identifier, **changes),
    )
    assert response.status_code == 201, response.text
    return response.json()


def action(client, auth, listing_id, name, version):
    response = client.post(
        f"/api/v1/admin/listings/{listing_id}/{name}",
        headers=auth,
        json={"expected_version": version, "reason": "manual check"},
    )
    return response


def published(client, auth, employer_id, identifier="role-1", **changes):
    item = draft(client, auth, employer_id, identifier, **changes)
    confirmation = client.post(
        f"/api/v1/admin/listings/{item['id']}/confirm",
        headers=auth,
        json={
            "expected_version": item["version"],
            "reason": "official job is open",
            "confirmation_source_url": "https://example.com/jobs/role-1",
        },
    )
    assert confirmation.status_code == 200, confirmation.text
    item = confirmation.json()
    response = action(client, auth, item["id"], "publish", item["version"])
    assert response.status_code == 200, response.text
    return response.json()


def init_data(user_id, auth_date=None, token=TELEGRAM_BOT_TOKEN, **extra):
    fields = {
        "auth_date": str(int((auth_date or datetime.now(UTC)).timestamp())),
        "query_id": "AAH-test",
        "user": json.dumps({"id": user_id, "first_name": "Test"}),
        **extra,
    }
    check = "\n".join(f"{key}={value}" for key, value in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)


def telegram(user_id, **options):
    return {"Authorization": f"tma {init_data(user_id, **options)}"}


def provider_organizations(client, auth):
    for key, name, member in (
        ("provider-org", "Provider Org", PROVIDER_TELEGRAM_ID),
        ("other-provider-org", "Other Org", OTHER_PROVIDER_TELEGRAM_ID),
    ):
        response = client.post(
            "/api/v1/admin/organizations", headers=auth, json={"key": key, "name": name}
        )
        assert response.status_code == 201, response.text
        response = client.post(
            f"/api/v1/admin/organizations/{key}/members",
            headers=auth,
            json={"telegram_user_id": member},
        )
        assert response.status_code == 201, response.text


def submitted_offer(client, provider, employer_id, identifier="provider-role", **changes):
    created = client.post(
        "/api/v1/provider/listings",
        headers=provider,
        json=listing_content(employer_id, identifier, **changes),
    )
    assert created.status_code == 201, created.text
    item = created.json()
    submitted = client.post(
        f"/api/v1/provider/listings/{item['id']}/submit",
        headers=provider,
        json={"expected_version": item["version"]},
    )
    assert submitted.status_code == 200, submitted.text
    return submitted.json()


def test_provider_portal_scopes_submissions_to_telegram_members(client, auth):
    provider_organizations(client, auth)
    owner = employer(client, auth)
    provider = telegram(PROVIDER_TELEGRAM_ID)
    other = telegram(OTHER_PROVIDER_TELEGRAM_ID)
    operator = telegram(OPERATOR_TELEGRAM_ID)

    identity = client.get("/api/v1/portal/me", headers=provider).json()
    assert identity == {
        "telegram_user_id": PROVIDER_TELEGRAM_ID,
        "role": "provider",
        "organization_name": "Provider Org",
    }
    assert client.get("/api/v1/portal/me", headers=operator).json()["role"] == "operator"

    created = client.post(
        "/api/v1/provider/listings",
        headers=provider,
        json=listing_content(owner["id"], "provider-role", status="published"),
    )
    assert created.status_code == 422
    item = submitted_offer(client, provider, owner["id"])
    assert item["submission_status"] == "pending"
    assert client.get(f"/api/v1/provider/listings/{item['id']}", headers=other).status_code == 404
    assert client.get("/api/v1/provider/listings", headers=other).json()["items"] == []
    assert client.get("/api/v1/portal/submissions", headers=provider).status_code == 403
    assert client.get("/api/v1/admin/reviews", headers=provider).status_code == 403
    assert client.get("/api/v1/admin/organizations", headers=provider).status_code == 403
    assert client.get("/api/v1/provider/listings", headers=operator).status_code == 403
    assert client.get("/api/v1/admin/reviews", headers=operator).status_code == 200
    assert client.get("/api/v1/admin/reports", headers=operator).status_code == 200
    assert (
        client.put(
            f"/api/v1/provider/listings/{item['id']}",
            headers=provider,
            json={"expected_version": item["version"], "content": listing_content(owner["id"])},
        ).status_code
        == 409
    )
    queue = client.get("/api/v1/portal/submissions", headers=operator)
    assert [row["id"] for row in queue.json()["items"]] == [item["id"]]

    approved = client.post(
        f"/api/v1/portal/submissions/{item['id']}/approve",
        headers=operator,
        json={"expected_version": item["version"], "note": "official source checked"},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "published"
    assert client.get(f"/api/v1/listings/{item['id']}").status_code == 200
    events = client.get("/api/v1/admin/audit", headers=auth).json()["items"]
    assert {"actor": f"telegram:{OPERATOR_TELEGRAM_ID}", "action": "listing_approved"} in [
        {"actor": event["actor"], "action": event["action"]} for event in events
    ]


def test_portal_rejects_unsigned_stale_or_foreign_init_data(client, auth):
    provider_organizations(client, auth)
    now = datetime.now(UTC)
    valid = init_data(PROVIDER_TELEGRAM_ID)
    tampered = valid.replace("7000002", "7000003")
    rejected = [
        {},
        {"Authorization": f"Bearer {valid}"},
        {"Authorization": f"tma {tampered}"},
        {"Authorization": "tma " + valid.replace("hash=", "hash=0")},
        {"Authorization": f"tma {valid}&hash=0"},
        {"Authorization": "tma auth_date=1&user=%7B%22id%22%3A1%7D"},
        telegram(PROVIDER_TELEGRAM_ID, token="654321:a-different-bot-token-for-signing"),
        telegram(PROVIDER_TELEGRAM_ID, auth_date=now - timedelta(hours=9)),
        telegram(PROVIDER_TELEGRAM_ID, auth_date=now + timedelta(minutes=5)),
        {"Authorization": f"tma {'a=' * 3000}"},
    ]
    for headers in rejected:
        assert client.get("/api/v1/portal/me", headers=headers).status_code == 401, headers
        assert client.get("/api/v1/provider/listings", headers=headers).status_code == 401
    assert (
        client.get("/api/v1/admin/reviews", headers={"Authorization": f"tma {tampered}"})
    ).status_code == 401
    assert (
        client.get("/api/v1/portal/me", headers={"Authorization": f"tma {valid}"}).json()["role"]
        == "provider"
    )


def test_unknown_telegram_users_see_only_their_id(client, auth):
    stranger = telegram(7000099)
    assert client.get("/api/v1/portal/me", headers=stranger).json() == {
        "telegram_user_id": 7000099,
        "role": None,
        "organization_name": None,
    }
    for path in ("/api/v1/portal/employers", "/api/v1/provider/listings", "/api/v1/admin/audit"):
        assert client.get(path, headers=stranger).status_code == 403, path
    response = client.post(
        "/api/v1/admin/organizations",
        headers=stranger,
        json={"key": "stranger-org", "name": "Stranger"},
    )
    assert response.status_code == 403


def test_operators_manage_members_and_removal_revokes_access(client, auth):
    provider_organizations(client, auth)
    operator = telegram(OPERATOR_TELEGRAM_ID)
    members = "/api/v1/admin/organizations/provider-org/members"
    for member, status in (
        (PROVIDER_TELEGRAM_ID, 409),
        (OTHER_PROVIDER_TELEGRAM_ID, 409),
        (OPERATOR_TELEGRAM_ID, 409),
        (7000004, 201),
    ):
        response = client.post(members, headers=operator, json={"telegram_user_id": member})
        assert response.status_code == status, (member, response.text)
    for invalid in (0, -1, "7000005", 2**53):
        response = client.post(members, headers=operator, json={"telegram_user_id": invalid})
        assert response.status_code == 422, invalid
    assert (
        client.post(
            "/api/v1/admin/organizations/missing-org/members",
            headers=operator,
            json={"telegram_user_id": 7000006},
        ).status_code
        == 404
    )
    listed = client.get("/api/v1/admin/organizations", headers=operator).json()["items"]
    assert {row["key"]: row["member_telegram_ids"] for row in listed} == {
        "provider-org": [PROVIDER_TELEGRAM_ID, 7000004],
        "other-provider-org": [OTHER_PROVIDER_TELEGRAM_ID],
    }

    provider = telegram(PROVIDER_TELEGRAM_ID)
    assert client.get("/api/v1/provider/listings", headers=provider).status_code == 200
    assert (
        client.delete(
            f"/api/v1/admin/organizations/other-provider-org/members/{PROVIDER_TELEGRAM_ID}",
            headers=operator,
        ).status_code
        == 404
    )
    assert client.delete(f"{members}/{PROVIDER_TELEGRAM_ID}", headers=operator).status_code == 204
    assert client.get("/api/v1/portal/me", headers=provider).json()["role"] is None
    assert client.get("/api/v1/provider/listings", headers=provider).status_code == 403
    assert client.delete(f"{members}/{PROVIDER_TELEGRAM_ID}", headers=operator).status_code == 404
    actions = [
        event["action"] for event in client.get("/api/v1/admin/audit", headers=auth).json()["items"]
    ]
    assert actions.count("member_added") == 3
    assert actions.count("member_removed") == 1


def test_approval_applies_the_publication_rules(client, auth, database_url):
    provider_organizations(client, auth)
    owner = employer(client, auth)
    provider = telegram(PROVIDER_TELEGRAM_ID)
    operator = telegram(OPERATOR_TELEGRAM_ID)
    last_year = datetime.now(UTC).year - 1
    past = submitted_offer(
        client,
        provider,
        owner["id"],
        "past-role",
        season_year=last_year,
        work_start_date=f"{last_year}-06-01",
        work_end_date=f"{last_year}-08-30",
    )
    current = submitted_offer(client, provider, owner["id"], "current-role")
    disputed = client.put(
        f"/api/v1/admin/employers/{owner['id']}",
        headers=auth,
        json={
            "expected_version": owner["version"],
            "legal_name": owner["legal_name"],
            "official_website_url": owner["official_website_url"],
            "identity_status": "disputed",
            "identity_source_url": "https://example.org/registry",
        },
    )
    assert disputed.status_code == 200, disputed.text
    for item in (past, current):
        response = client.post(
            f"/api/v1/portal/submissions/{item['id']}/approve",
            headers=operator,
            json={"expected_version": item["version"], "note": "official source checked"},
        )
        assert response.status_code == 409, item["source_identifier"]
        assert client.get(f"/api/v1/listings/{item['id']}").status_code == 404


def test_public_visibility_filters_and_bounded_pages(client, auth):
    owner = employer(client, auth)
    first = published(client, auth, owner["id"])
    published(
        client, auth, owner["id"], "role-2", city="Buffalo", category="Retail", role="Cashier"
    )
    hidden = draft(client, auth, owner["id"], "unpublished")

    response = client.get(
        "/api/v1/listings", params={"season": 2027, "city": "Albany", "page_size": 1}
    )
    assert response.status_code == 200
    assert [item["id"] for item in response.json()["items"]] == [first["id"]]
    assert "confirmation_source_url" not in response.json()["items"][0]
    assert "version" not in response.json()["items"][0]
    assert (
        client.get("/api/v1/listings", params={"category": "Retail"}).json()["items"][0]["role"]
        == "Cashier"
    )
    assert (
        client.get("/api/v1/listings", params={"q": "desk"}).json()["items"][0]["id"] == first["id"]
    )
    assert client.get("/api/v1/listings", params={"season": 2028}).json()["items"] == []
    assert client.get("/api/v1/listings", params={"page_size": 51}).status_code == 422
    assert client.get("/api/v1/listings", params={"page": 101}).status_code == 422
    assert client.get(f"/api/v1/listings/{first['id']}").status_code == 200
    assert client.get(f"/api/v1/listings/{hidden['id']}").status_code == 404


def test_stale_listing_is_unavailable_even_before_persisted_expiry(client, auth, database_url):
    owner = employer(client, auth)
    item = published(client, auth, owner["id"])
    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            text("UPDATE listings SET last_confirmed_at=:past WHERE id=:listing_id"),
            {"past": datetime.now(UTC) - timedelta(days=15), "listing_id": item["id"]},
        )
    engine.dispose()
    assert client.get("/api/v1/listings").json()["items"] == []
    stale_response = client.get(f"/api/v1/listings/{item['id']}")
    assert stale_response.status_code == 410
    assert stale_response.json()["reason"] == "stale"
    admin = client.get(f"/api/v1/admin/listings/{item['id']}", headers=auth).json()
    assert admin["effective_status"] == "expired"
    assert client.get("/api/v1/admin/listings-needing-confirmation").status_code == 401
    needing = client.get("/api/v1/admin/listings-needing-confirmation", headers=auth).json()
    assert [row["id"] for row in needing["items"]] == [item["id"]]
    reconciled = client.post("/api/v1/admin/expire", headers=auth)
    assert reconciled.status_code == 200
    assert reconciled.json() == {"expired": 1}
    assert (
        client.get(f"/api/v1/admin/listings/{item['id']}", headers=auth).json()["status"]
        == "expired"
    )
    assert (
        client.get("/api/v1/admin/audit", headers=auth, params={"entity_id": item["id"]}).json()[
            "items"
        ][0]["action"]
        == "listing_expired"
    )


def test_public_condition_filters_keep_unknowns_out_only_when_requested(client, auth):
    owner = employer(client, auth)
    matching = published(
        client,
        auth,
        owner["id"],
        "with-housing",
        housing_description="Shared room",
    )
    unknown = published(
        client,
        auth,
        owner["id"],
        "unknown-conditions",
        wage_amount=None,
        wage_currency=None,
        wage_basis=None,
        work_start_date=None,
        work_end_date=None,
        expected_hours_per_week=None,
    )
    assert len(client.get("/api/v1/listings").json()["items"]) == 2
    filters = {
        "start_from": "2027-05-01",
        "end_by": "2027-09-01",
        "min_wage": "16",
        "wage_currency": "USD",
        "wage_basis": "hour",
        "min_hours": "30",
        "housing_known": "true",
        "confirmed_within_days": "7",
    }
    response = client.get("/api/v1/listings", params=filters)
    assert response.status_code == 200
    assert [item["id"] for item in response.json()["items"]] == [matching["id"]]
    assert [
        item["id"]
        for item in client.get("/api/v1/listings", params={"housing_known": "false"}).json()[
            "items"
        ]
    ] == [unknown["id"]]
    assert (
        client.get(
            "/api/v1/listings",
            params={"min_wage": "20", "wage_currency": "USD", "wage_basis": "hour"},
        ).json()["items"]
        == []
    )
    assert client.get("/api/v1/listings", params={"min_wage": "16"}).status_code == 422
    assert (
        client.get(
            "/api/v1/listings", params={"start_from": "2027-09-01", "end_by": "2027-05-01"}
        ).status_code
        == 422
    )
    assert client.get("/api/v1/listings", params={"confirmed_within_days": "15"}).status_code == 422


def test_state_changes_need_fresh_confirmation_and_leave_audit(client, auth):
    owner = employer(client, auth)
    item = published(client, auth, owner["id"])
    paused = action(client, auth, item["id"], "pause", item["version"])
    assert paused.status_code == 200
    assert client.get("/api/v1/listings").json()["items"] == []
    assert client.get(f"/api/v1/listings/{item['id']}").json()["reason"] == "unavailable"
    assert action(client, auth, item["id"], "publish", paused.json()["version"]).status_code == 409
    confirmation = client.post(
        f"/api/v1/admin/listings/{item['id']}/confirm",
        headers=auth,
        json={
            "expected_version": paused.json()["version"],
            "reason": "checked again",
            "confirmation_source_url": "https://example.com/jobs/role-1",
        },
    )
    assert confirmation.status_code == 200
    reopened = action(client, auth, item["id"], "publish", confirmation.json()["version"])
    assert reopened.status_code == 200
    closed = action(client, auth, item["id"], "close", reopened.json()["version"])
    assert closed.status_code == 200
    assert action(client, auth, item["id"], "publish", closed.json()["version"]).status_code == 409
    events = client.get(
        "/api/v1/admin/audit", headers=auth, params={"entity_id": item["id"]}
    ).json()["items"]
    assert {event["action"] for event in events} >= {
        "listing_created",
        "listing_confirmed",
        "listing_published",
        "listing_paused",
        "listing_closed",
    }


def test_validation_and_duplicate_retry(client, auth):
    owner = employer(client, auth)
    bad = listing_content(owner["id"], work_end_date="2027-05-01")
    assert client.post("/api/v1/admin/listings", headers=auth, json=bad).status_code == 422
    bad = listing_content(owner["id"], contact_url="http://example.com/apply")
    assert client.post("/api/v1/admin/listings", headers=auth, json=bad).status_code == 422
    bad = listing_content(owner["id"], wage_currency="US")
    assert client.post("/api/v1/admin/listings", headers=auth, json=bad).status_code == 422
    first = draft(client, auth, owner["id"])
    duplicate = client.post(
        "/api/v1/admin/listings", headers=auth, json=listing_content(owner["id"])
    )
    assert duplicate.status_code == 409
    assert client.get(f"/api/v1/admin/listings/{first['id']}", headers=auth).status_code == 200


def test_admin_auth_and_client_role_claims(client, auth):
    owner = employer(client, auth)
    assert (
        client.post("/api/v1/admin/listings", json=listing_content(owner["id"])).status_code == 401
    )
    assert (
        client.post(
            "/api/v1/admin/listings",
            headers={"Authorization": "Bearer wrong"},
            json=listing_content(owner["id"]),
        ).status_code
        == 401
    )
    assert client.get("/api/v1/admin/audit").status_code == 401
    claimed = listing_content(owner["id"], role_claim="admin")
    assert client.post("/api/v1/admin/listings", headers=auth, json=claimed).status_code == 422
    assert client.get("/api/v1/listings").json()["items"] == []


def test_stale_concurrent_edit_cannot_overwrite(client, auth):
    owner = employer(client, auth)
    item = draft(client, auth, owner["id"])
    payloads = [
        {"expected_version": item["version"], "content": listing_content(owner["id"], city=city)}
        for city in ("Syracuse", "Rochester")
    ]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(
            pool.map(
                lambda payload: (
                    client.put(
                        f"/api/v1/admin/listings/{item['id']}", headers=auth, json=payload
                    ).status_code
                ),
                payloads,
            )
        )
    assert sorted(results) == [200, 409]
    assert client.get(f"/api/v1/admin/listings/{item['id']}", headers=auth).json()["version"] == 2


def test_review_moderation_is_private_until_approval(client, auth):
    owner = employer(client, auth)
    item = published(client, auth, owner["id"])
    review_payload = {
        "request_id": "122beab1-78a8-4a35-b750-a397551e94db",
        "listing_id": item["id"],
        "season_year": 2027,
        "role": "Front desk",
        "pay_match": "yes",
        "pay_clarity": "clear",
        "hours_match": "unknown",
        "housing_match": "not_applicable",
        "transport_match": "no",
        "text": "<script>alert('x')</script>",
        "self_report_consent": True,
    }
    submission = client.post("/api/v1/reviews", json=review_payload)
    assert submission.status_code == 202, submission.text
    review_id = submission.json()["receipt_id"]
    assert client.post("/api/v1/reviews", json=review_payload).json()["receipt_id"] == review_id
    changed_retry = client.post("/api/v1/reviews", json={**review_payload, "pay_match": "no"})
    assert changed_retry.status_code == 409
    assert client.get(f"/api/v1/listings/{item['id']}/reviews").json()["items"] == []
    assert client.get(f"/api/v1/admin/reviews/{review_id}").status_code == 401
    approved = client.post(
        f"/api/v1/admin/reviews/{review_id}/approve",
        headers=auth,
        json={"expected_version": 1, "reason": "reviewed"},
    )
    assert approved.status_code == 200
    public = client.get(f"/api/v1/listings/{item['id']}/reviews").json()["items"]
    assert public[0]["text"] == "&lt;script&gt;alert(&#x27;x&#x27;)&lt;/script&gt;"
    assert public[0]["role"] == "Front desk"
    assert public[0]["pay_clarity"] == "clear"
    assert public[0]["submitted_at"]
    assert "version" not in public[0]
    assert (
        client.post(
            f"/api/v1/admin/reviews/{review_id}/approve",
            headers=auth,
            json={"expected_version": 2, "reason": "again"},
        ).status_code
        == 409
    )
    assert (
        client.post(
            f"/api/v1/admin/reviews/{review_id}/remove",
            headers=auth,
            json={"expected_version": 2, "reason": "report"},
        ).status_code
        == 200
    )
    assert client.get(f"/api/v1/listings/{item['id']}/reviews").json()["items"] == []
    events = client.get(
        "/api/v1/admin/audit", headers=auth, params={"entity_id": review_id}
    ).json()["items"]
    assert [event["details"]["to"] for event in events] == ["removed", "approved"]


def test_review_text_rejects_contact_details_before_storage(client, auth):
    owner = employer(client, auth)
    item = published(client, auth, owner["id"])
    response = client.post(
        "/api/v1/reviews",
        json={
            "request_id": "793a7d8a-f591-45fc-8da9-61368e8c3a63",
            "listing_id": item["id"],
            "season_year": 2027,
            "role": "Front desk",
            "pay_match": "unknown",
            "pay_clarity": "unknown",
            "hours_match": "unknown",
            "housing_match": "unknown",
            "transport_match": "unknown",
            "text": "Call 5551234567",
            "self_report_consent": True,
        },
    )
    assert response.status_code == 422
    assert (
        client.post(
            "/api/v1/reviews",
            json={
                "request_id": "6b8accc5-709b-4de8-8439-96af28803336",
                "listing_id": item["id"],
                "season_year": 2027,
                "role": "Front desk",
                "pay_match": "unknown",
                "pay_clarity": "unknown",
                "hours_match": "unknown",
                "housing_match": "unknown",
                "transport_match": "unknown",
                "text": "See example.com for details",
                "self_report_consent": True,
            },
        ).status_code
        == 422
    )
    too_long = client.post(
        "/api/v1/reviews",
        json={
            "request_id": "158813bd-b486-42b3-998d-9289270434f9",
            "listing_id": item["id"],
            "season_year": 2027,
            "role": "Front desk",
            "pay_match": "unknown",
            "pay_clarity": "unknown",
            "hours_match": "unknown",
            "housing_match": "unknown",
            "transport_match": "unknown",
            "text": "a" * 501,
            "self_report_consent": True,
        },
    )
    assert too_long.status_code == 422


def test_review_redaction_rejection_and_public_boundary(client, auth):
    owner = employer(client, auth)
    item = published(client, auth, owner["id"])
    payload = {
        "request_id": "7a87ecba-2b4f-43bb-901b-c2147353a936",
        "listing_id": item["id"],
        "season_year": item["season_year"],
        "role": "Front desk",
        "pay_match": "no",
        "pay_clarity": "unknown",
        "hours_match": "yes",
        "housing_match": "unknown",
        "transport_match": "not_applicable",
        "text": "Worked with Alice",
        "self_report_consent": True,
    }
    receipt = client.post("/api/v1/reviews", json=payload)
    assert receipt.status_code == 202
    review_id = receipt.json()["receipt_id"]
    assert client.get(f"/api/v1/listings/{item['id']}/reviews").json() == {"items": [], "count": 0}
    assert client.get("/api/v1/admin/reviews").status_code == 401
    assert (
        client.post(
            f"/api/v1/admin/reviews/{review_id}/redact",
            json={"expected_version": 1, "reason": "name", "text": "Worked on the front desk"},
        ).status_code
        == 401
    )
    redacted = client.post(
        f"/api/v1/admin/reviews/{review_id}/redact",
        headers=auth,
        json={"expected_version": 1, "reason": "name", "text": "Worked on the front desk"},
    )
    assert redacted.status_code == 200
    assert redacted.json()["version"] == 2
    assert (
        client.post(
            f"/api/v1/admin/reviews/{review_id}/approve",
            headers=auth,
            json={"expected_version": 2, "reason": "redacted"},
        ).status_code
        == 200
    )
    public = client.get(f"/api/v1/listings/{item['id']}/reviews").json()
    assert public["count"] == 1
    assert "Alice" not in str(public)
    assert "content_hash" not in str(public)
    assert "request_id" not in str(public)
    assert "reason" not in str(public)
    revised = client.post(
        f"/api/v1/admin/reviews/{review_id}/redact",
        headers=auth,
        json={"expected_version": 3, "reason": "more precise", "text": "Front desk work"},
    )
    assert revised.status_code == 200
    assert (
        client.get(f"/api/v1/listings/{item['id']}/reviews").json()["items"][0]["text"]
        == "Front desk work"
    )
    role_revision = client.post(
        f"/api/v1/admin/reviews/{review_id}/redact",
        headers=auth,
        json={"expected_version": 4, "reason": "role correction", "role": "Guest desk"},
    )
    assert role_revision.status_code == 200
    current = client.get(f"/api/v1/listings/{item['id']}/reviews").json()["items"][0]
    assert current["text"] == "Front desk work"
    assert current["role"] == "Guest desk"
    assert (
        client.post(
            f"/api/v1/admin/reviews/{review_id}/remove",
            headers=auth,
            json={"expected_version": 5, "reason": "reported"},
        ).status_code
        == 200
    )
    removed_record = client.get(f"/api/v1/admin/reviews/{review_id}", headers=auth).json()
    assert removed_record["role"] == "redacted"
    assert removed_record["text"] is None
    assert client.post("/api/v1/reviews", json=payload).json() == {
        "receipt_id": review_id,
        "status": "rejected",
    }
    assert client.get(f"/api/v1/listings/{item['id']}/reviews").json()["count"] == 0

    rejected = client.post(
        "/api/v1/reviews",
        json={**payload, "request_id": "a98fd2c1-69d9-4bc1-b00f-afbda060a055"},
    ).json()["receipt_id"]
    assert (
        client.post(
            f"/api/v1/admin/reviews/{rejected}/reject",
            headers=auth,
            json={"expected_version": 1, "reason": "unsupported claim"},
        ).status_code
        == 200
    )
    rejected_record = client.get(f"/api/v1/admin/reviews/{rejected}", headers=auth).json()
    assert rejected_record["role"] == "redacted"
    assert rejected_record["text"] is None
    assert client.post(
        "/api/v1/reviews",
        json={**payload, "request_id": "a98fd2c1-69d9-4bc1-b00f-afbda060a055"},
    ).json() == {"receipt_id": rejected, "status": "rejected"}
    assert client.get(f"/api/v1/listings/{item['id']}/reviews").json()["count"] == 0


def test_reports_are_private_idempotent_and_audited(client, auth):
    owner = employer(client, auth)
    item = published(client, auth, owner["id"])
    payload = {
        "request_id": "50aa5c2f-bd42-4bbd-979a-78f1c73aa2e6",
        "item_type": "listing",
        "item_id": item["id"],
        "reason": "inaccurate",
        "explanation": "Housing description changed",
    }
    created = client.post("/api/v1/reports", json=payload)
    assert created.status_code == 202
    report_id = created.json()["receipt_id"]
    assert client.post("/api/v1/reports", json=payload).json()["receipt_id"] == report_id
    assert client.post("/api/v1/reports", json={**payload, "reason": "other"}).status_code == 409
    assert client.get("/api/v1/admin/reports").status_code == 401
    assert client.get("/api/v1/admin/reports", headers=auth).json()["items"][0]["id"] == report_id
    assert (
        client.post(
            f"/api/v1/admin/reports/{report_id}/resolve",
            headers=auth,
            json={"expected_version": 1, "reason": "listing paused for recheck"},
        ).status_code
        == 200
    )
    events = client.get("/api/v1/admin/audit", headers=auth, params={"entity_id": report_id}).json()
    assert events["items"][0]["details"]["to"] == "resolved"


def test_report_reasons_must_match_the_reported_item(client, auth):
    owner = employer(client, auth)
    item = published(client, auth, owner["id"])
    listing_report = {
        "request_id": "3f0f7f8e-8c39-4a52-9a43-2f6b3b0c6a10",
        "item_type": "listing",
        "item_id": item["id"],
        "reason": "closed",
    }
    assert client.post("/api/v1/reports", json=listing_report).status_code == 202
    for reason in ("off_topic", "unknown"):
        rejected = {
            **listing_report,
            "request_id": "8c1d6a7e-2b4f-4c1e-9d3a-5e6f7a8b9c0d",
            "reason": reason,
        }
        assert client.post("/api/v1/reports", json=rejected).status_code == 422
    review_report = {
        **listing_report,
        "request_id": "a2b3c4d5-e6f7-4a8b-9c0d-1e2f3a4b5c6d",
        "item_type": "review",
        "reason": "suspicious",
    }
    assert client.post("/api/v1/reports", json=review_report).status_code == 422


def test_public_submissions_are_disabled_by_default(client, auth, database_url, monkeypatch):
    owner = employer(client, auth)
    item = published(client, auth, owner["id"])
    monkeypatch.delenv("FEEDBACK_ENABLED", raising=False)
    app = create_app(database_url, {"operator": "another-test-admin-token-with-32-characters"})
    with TestClient(app) as disabled_client:
        review = disabled_client.post(
            "/api/v1/reviews",
            json={
                "request_id": "d87e5862-ecaf-4db2-96f3-e74ec31120c4",
                "listing_id": item["id"],
                "season_year": item["season_year"],
                "role": "Front desk",
                "pay_match": "unknown",
                "pay_clarity": "unknown",
                "hours_match": "unknown",
                "housing_match": "unknown",
                "transport_match": "unknown",
                "self_report_consent": True,
            },
        )
        report = disabled_client.post(
            "/api/v1/reports",
            json={
                "request_id": "be3d221b-dbf4-4d07-a65f-b9f805fbac40",
                "item_type": "listing",
                "item_id": item["id"],
                "reason": "inaccurate",
            },
        )
        assert review.status_code == 503
        assert report.status_code == 503
    engine = create_engine(database_url)
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT count(*) FROM reviews")) == 0
        assert connection.scalar(text("SELECT count(*) FROM reports")) == 0
    engine.dispose()


def test_admin_queues_and_audit_can_page_past_first_batch(client, auth, database_url):
    owner = employer(client, auth)
    item = published(client, auth, owner["id"])
    review_ids = []
    report_ids = []
    for index in range(2):
        review = client.post(
            "/api/v1/reviews",
            json={
                "request_id": f"aa000000-0000-4000-8000-{index:012d}",
                "listing_id": item["id"],
                "season_year": item["season_year"],
                "role": "Front desk",
                "pay_match": "unknown",
                "pay_clarity": "unknown",
                "hours_match": "unknown",
                "housing_match": "unknown",
                "transport_match": "unknown",
                "self_report_consent": True,
            },
        )
        report = client.post(
            "/api/v1/reports",
            json={
                "request_id": f"bb000000-0000-4000-8000-{index:012d}",
                "item_type": "listing",
                "item_id": item["id"],
                "reason": "inaccurate",
            },
        )
        assert review.status_code == 202
        assert report.status_code == 202
        review_ids.append(review.json()["receipt_id"])
        report_ids.append(report.json()["receipt_id"])

    engine = create_engine(database_url)
    with engine.begin() as connection:
        moment = datetime.now(UTC)
        for table, column in (
            ("reviews", "submitted_at"),
            ("reports", "submitted_at"),
            ("audit_events", "occurred_at"),
        ):
            connection.execute(text(f"UPDATE {table} SET {column} = :moment"), {"moment": moment})
    engine.dispose()

    for path, expected in (
        ("/api/v1/admin/reviews", set(review_ids)),
        ("/api/v1/admin/reports", set(report_ids)),
    ):
        first = client.get(path, headers=auth, params={"limit": 1}).json()
        second = client.get(
            path, headers=auth, params={"limit": 1, "cursor": first["next_cursor"]}
        ).json()
        assert {first["items"][0]["id"], second["items"][0]["id"]} == expected
        assert second["next_cursor"] is None
        assert client.get(path, headers=auth, params={"limit": 101}).status_code == 422
        assert client.get(path, headers=auth, params={"cursor": "x" * 36}).status_code == 404

    first = client.get("/api/v1/admin/audit", headers=auth, params={"limit": 1}).json()
    second = client.get(
        "/api/v1/admin/audit",
        headers=auth,
        params={"limit": 1, "cursor": first["next_cursor"]},
    ).json()
    assert first["items"][0]["id"] != second["items"][0]["id"]

    rejected = client.post(
        f"/api/v1/admin/reviews/{review_ids[0]}/reject",
        headers=auth,
        json={"expected_version": 1, "reason": "not suitable"},
    )
    assert rejected.status_code == 200
    assert (
        client.get(
            "/api/v1/admin/reviews",
            headers=auth,
            params={"status": "pending", "cursor": review_ids[0]},
        ).status_code
        == 404
    )
    listing_event = client.get(
        "/api/v1/admin/audit", headers=auth, params={"entity_id": item["id"], "limit": 1}
    ).json()["items"][0]
    assert (
        client.get(
            "/api/v1/admin/audit",
            headers=auth,
            params={"entity_id": owner["id"], "cursor": listing_event["id"]},
        ).status_code
        == 404
    )


def test_stale_confirmation_queue_pages_with_equal_times(client, auth, database_url):
    owner = employer(client, auth)
    listing_ids = {
        published(client, auth, owner["id"], identifier)["id"] for identifier in ("first", "second")
    }
    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            text("UPDATE listings SET last_confirmed_at = :stale"),
            {"stale": datetime.now(UTC) - timedelta(days=15)},
        )
    engine.dispose()
    path = "/api/v1/admin/listings-needing-confirmation"
    first = client.get(path, headers=auth, params={"limit": 1}).json()
    second = client.get(
        path, headers=auth, params={"limit": 1, "cursor": first["next_cursor"]}
    ).json()
    assert {first["items"][0]["id"], second["items"][0]["id"]} == listing_ids
    assert second["next_cursor"] is None
    boundary = first["items"][0]
    refreshed = client.post(
        f"/api/v1/admin/listings/{boundary['id']}/confirm",
        headers=auth,
        json={
            "expected_version": boundary["version"],
            "reason": "checked again",
            "confirmation_source_url": "https://example.com/jobs/role-1",
        },
    )
    assert refreshed.status_code == 200
    assert client.get(path, headers=auth, params={"cursor": boundary["id"]}).status_code == 404


def test_review_migration_preserves_existing_rows(client, auth, database_url):
    owner = employer(client, auth)
    item = published(client, auth, owner["id"])
    payload = {
        "request_id": "5d88d21c-842b-4982-bd2b-56e6772fdf88",
        "listing_id": item["id"],
        "season_year": item["season_year"],
        "role": "Front desk",
        "pay_match": "yes",
        "pay_clarity": "unknown",
        "hours_match": "yes",
        "housing_match": "unknown",
        "transport_match": "unknown",
        "self_report_consent": True,
    }
    review_id = client.post("/api/v1/reviews", json=payload).json()["receipt_id"]
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    config.set_main_option("script_location", str(Path(__file__).parents[1] / "alembic"))
    previous_url = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = database_url
    try:
        command.downgrade(config, "e1b8a27c194f")
        command.upgrade(config, "head")
    finally:
        if previous_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous_url
    review = client.get(f"/api/v1/admin/reviews/{review_id}", headers=auth).json()
    assert review["id"] == review_id
    assert review["role"] == item["role"]
    assert review["pay_clarity"] == "unknown"


def test_trust_facts_require_separate_evidence_and_dispute_pauses(client, auth):
    owner = employer(client, auth)
    item = published(client, auth, owner["id"])
    initial = client.get(f"/api/v1/listings/{item['id']}").json()
    assert initial["employer_identity_status"] == "not_checked"
    assert initial["sponsor_route_status"] == "not_reported"
    assert initial["sponsor_approval_status"] == "unknown"
    unsupported = client.post(
        f"/api/v1/admin/listings/{item['id']}/sponsor",
        headers=auth,
        json={
            "expected_version": item["version"],
            "reason": "assessment",
            "route_status": "reported",
            "approval_status": "confirmed",
        },
    )
    assert unsupported.status_code == 422
    verified = client.put(
        f"/api/v1/admin/employers/{owner['id']}",
        headers=auth,
        json={
            "expected_version": owner["version"],
            "legal_name": owner["legal_name"],
            "official_website_url": owner["official_website_url"],
            "identity_status": "checked",
            "identity_source_url": "https://registry.example.org/employers/example",
        },
    )
    assert verified.status_code == 200
    still_unknown = client.get(f"/api/v1/listings/{item['id']}").json()
    assert still_unknown["sponsor_approval_status"] == "unknown"
    disputed = client.put(
        f"/api/v1/admin/employers/{owner['id']}",
        headers=auth,
        json={
            "expected_version": verified.json()["version"],
            "legal_name": owner["legal_name"],
            "official_website_url": owner["official_website_url"],
            "identity_status": "disputed",
            "identity_source_url": "https://registry.example.org/employers/conflict",
        },
    )
    assert disputed.status_code == 200
    assert client.get("/api/v1/listings").json()["items"] == []
    assert (
        client.get(f"/api/v1/admin/listings/{item['id']}", headers=auth).json()["status"]
        == "paused"
    )


def test_write_size_and_review_rate_limits(client, auth):
    assert (
        client.post(
            "/api/v1/reviews",
            content=b"x" * 16_385,
            headers={"Content-Type": "application/json"},
        ).status_code
        == 413
    )
    owner = employer(client, auth)
    item = published(client, auth, owner["id"])
    payload = {
        "listing_id": item["id"],
        "season_year": 2027,
        "role": "Front desk",
        "pay_match": "unknown",
        "pay_clarity": "unknown",
        "hours_match": "unknown",
        "housing_match": "unknown",
        "transport_match": "unknown",
        "self_report_consent": True,
    }
    for number in range(5):
        request_id = f"00000000-0000-4000-8000-{number:012d}"
        assert (
            client.post("/api/v1/reviews", json={**payload, "request_id": request_id}).status_code
            == 202
        )
    assert (
        client.post("/api/v1/reviews", json={**payload, "request_id": request_id}).status_code
        == 202
    )
    assert (
        client.post(
            "/api/v1/reviews",
            json={**payload, "request_id": "00000000-0000-4000-8000-000000000005"},
        ).status_code
        == 429
    )


def test_past_seasons_and_ended_work_are_not_current(client, auth, database_url):
    owner = employer(client, auth)
    year = datetime.now(UTC).year
    for identifier, season, end_date in (
        ("old-season", year - 1, f"{year - 1}-08-30"),
        ("ended-work", year, f"{year}-02-01"),
    ):
        item = draft(
            client,
            auth,
            owner["id"],
            identifier,
            season_year=season,
            work_start_date=f"{season}-01-01",
            work_end_date=end_date,
        )
        confirmation = client.post(
            f"/api/v1/admin/listings/{item['id']}/confirm",
            headers=auth,
            json={
                "expected_version": item["version"],
                "reason": "source checked",
                "confirmation_source_url": "https://example.com/job",
            },
        ).json()
        assert (
            action(client, auth, item["id"], "publish", confirmation["version"]).status_code == 409
        )

    current = published(
        client, auth, owner["id"], "current-season", work_start_date=None, work_end_date=None
    )
    previous_season = published(
        client, auth, owner["id"], "previous-season", work_start_date=None, work_end_date=None
    )
    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            text("UPDATE listings SET work_end_date=:past WHERE id=:listing_id"),
            {"past": datetime.now(UTC).date() - timedelta(days=1), "listing_id": current["id"]},
        )
        connection.execute(
            text("UPDATE listings SET season_year=:past WHERE id=:listing_id"),
            {"past": year - 1, "listing_id": previous_season["id"]},
        )
    engine.dispose()
    assert client.get("/api/v1/listings").json()["items"] == []
    assert client.get(f"/api/v1/listings/{current['id']}").status_code == 410
    assert client.get(f"/api/v1/listings/{previous_season['id']}").status_code == 410


def test_concurrent_exact_review_retries_return_one_receipt(client, auth):
    owner = employer(client, auth)
    item = published(client, auth, owner["id"])
    payload = {
        "request_id": "a7ae1435-17fc-4454-8a3b-3e662e77f81a",
        "listing_id": item["id"],
        "season_year": 2027,
        "role": "Front desk",
        "pay_match": "unknown",
        "pay_clarity": "unknown",
        "hours_match": "unknown",
        "housing_match": "unknown",
        "transport_match": "unknown",
        "self_report_consent": True,
    }
    barrier = Barrier(2)
    limiter = client.app.state.write_limiter
    allow = limiter.allow

    def synchronized_allow(address, scope, limit, window):
        if scope == "new_reviews":
            barrier.wait(timeout=5)
        return allow(address, scope, limit, window)

    limiter.allow = synchronized_allow
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: client.post("/api/v1/reviews", json=payload), range(2)))
    assert [response.status_code for response in responses] == [202, 202]
    assert responses[0].json() == responses[1].json()


def test_concurrent_exact_report_retries_return_one_receipt(client, auth):
    owner = employer(client, auth)
    item = published(client, auth, owner["id"])
    payload = {
        "request_id": "03926060-a8a5-4fb9-a185-ea347710d19f",
        "item_type": "listing",
        "item_id": item["id"],
        "reason": "inaccurate",
    }
    barrier = Barrier(2)
    limiter = client.app.state.write_limiter
    allow = limiter.allow

    def synchronized_allow(address, scope, limit, window):
        if scope == "new_reports":
            barrier.wait(timeout=5)
        return allow(address, scope, limit, window)

    limiter.allow = synchronized_allow
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: client.post("/api/v1/reports", json=payload), range(2)))
    assert [response.status_code for response in responses] == [202, 202]
    assert responses[0].json() == responses[1].json()


def test_environment_cannot_enable_telemetry_export(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://127.0.0.1:4318")
    app = create_app(
        "postgresql+psycopg://iter:unused@127.0.0.1:1/iter",
        {"operator": "telemetry-test-token-with-at-least-32-chars"},
        feedback_enabled=False,
    )
    with caplog.at_level("DEBUG", logger="fastapi"), TestClient(app):
        pass
    assert "automatic telemetry" not in caplog.text


def test_report_reason_upgrade_keeps_existing_reports(database_url):
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    config.set_main_option("script_location", str(Path(__file__).parents[1] / "alembic"))
    engine = create_engine(database_url)
    old = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = database_url
    try:
        with engine.begin() as connection:
            connection.execute(text("TRUNCATE reports, listings, employers CASCADE"))
        command.downgrade(config, "c4f20690e0aa")
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO employers (id, legal_name, official_website_url, "
                    "identity_status, version) VALUES ('e-upgrade', 'Upgrade Employer', "
                    "'https://example.com', 'not_checked', 1)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO listings (id, employer_id, source_identifier, season_year, "
                    "status, state, city, location_timezone, category, role, official_source_url, "
                    "contact_url, sponsor_route_status, sponsor_approval_status, state_changed_at, "
                    "version) VALUES ('l-upgrade', 'e-upgrade', 'upgrade-role', 2027, 'draft', "
                    "'New York', 'Albany', 'America/New_York', 'Hospitality', 'Desk assistant', "
                    "'https://example.com/jobs/upgrade', 'https://example.com/apply', "
                    "'not_reported', 'unknown', now(), 1)"
                )
            )
            connection.execute(
                text(
                    "INSERT INTO reports (id, request_id, content_hash, item_type, item_id, "
                    "reason, status, submitted_at, version) VALUES ('r-old', 'q-old', 'h', "
                    "'listing', 'listing-id', 'harmful', 'pending', now(), 1)"
                )
            )
        command.upgrade(config, "head")
        with engine.begin() as connection:
            assert (
                connection.execute(
                    text("SELECT reason FROM reports WHERE id = 'r-old'")
                ).scalar_one()
                == "harmful"
            )
            connection.execute(
                text(
                    "INSERT INTO reports (id, request_id, content_hash, item_type, item_id, "
                    "reason, status, submitted_at, version) VALUES ('r-new', 'q-new', 'h', "
                    "'listing', 'listing-id', 'closed', 'pending', now(), 1)"
                )
            )
            upgraded = connection.execute(
                text(
                    "SELECT organization_id, submission_status FROM listings WHERE id = 'l-upgrade'"
                )
            ).one()
            assert upgraded.organization_id is None
            assert upgraded.submission_status == "draft"
            connection.execute(text("TRUNCATE reports"))
    finally:
        command.upgrade(config, "head")
        engine.dispose()
        if old is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = old
