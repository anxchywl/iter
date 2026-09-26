import os
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import Barrier

from alembic.config import Config
from sqlalchemy import create_engine, text

from alembic import command


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
