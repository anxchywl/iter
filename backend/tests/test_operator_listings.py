from datetime import UTC, datetime, timedelta

from sqlalchemy import create_engine, text

from tests.conftest import OPERATOR_TELEGRAM_ID
from tests.test_directory import (
    action,
    draft,
    employer,
    listing_content,
    provider_organizations,
    published,
    submitted_offer,
    telegram,
)


def edit(client, auth, item, reason=None, **changes):
    content = {
        name: item[name]
        for name in listing_content(item["employer_id"])
        if name in item and name != "employer_id"
    }
    body = {
        "expected_version": item["version"],
        "content": {"employer_id": item["employer_id"], **content, **changes},
    }
    if reason:
        body["reason"] = reason
    return client.put(f"/api/v1/admin/listings/{item['id']}", headers=auth, json=body)


def republish(client, auth, item, url="https://example.com/jobs/role-1"):
    return client.post(
        f"/api/v1/admin/listings/{item['id']}/republish",
        headers=auth,
        json={
            "expected_version": item["version"],
            "reason": "employer confirmed again",
            "confirmation_source_url": url,
        },
    )


def audit_events(client, auth, entity_id):
    response = client.get("/api/v1/admin/audit", headers=auth, params={"entity_id": entity_id})
    assert response.status_code == 200, response.text
    return response.json()["items"]


def audit_actions(client, auth, entity_id):
    return [event["action"] for event in audit_events(client, auth, entity_id)]


def test_operator_listing_list_requires_an_operator(client, auth):
    [(_, provider), _] = provider_organizations(client, auth)
    assert client.get("/api/v1/admin/listings").status_code == 401
    assert client.get("/api/v1/admin/listings", headers=provider).status_code == 403
    assert client.get("/api/v1/admin/listings", headers=telegram(9999)).status_code == 403
    operator = client.get("/api/v1/admin/listings", headers=telegram(OPERATOR_TELEGRAM_ID))
    assert operator.status_code == 200


def test_operator_listing_list_filters_by_state_company_and_text(client, auth):
    [(organization, provider), _] = provider_organizations(client, auth)
    owner = employer(client, auth)
    live = published(client, auth, owner["id"])
    hidden = published(client, auth, owner["id"], "role-2", role="Cashier")
    hidden = action(client, auth, hidden["id"], "pause", hidden["version"]).json()
    closed = published(client, auth, owner["id"], "role-3", role="Cook")
    action(client, auth, closed["id"], "close", closed["version"])
    pending = submitted_offer(client, provider, owner["id"], role="Lifeguard")
    plain = draft(client, auth, owner["id"], "role-4", role="Housekeeper")

    def ids(**params):
        response = client.get("/api/v1/admin/listings", headers=auth, params=params)
        assert response.status_code == 200, response.text
        return {item["id"] for item in response.json()["items"]}

    assert ids() == {live["id"], hidden["id"], pending["id"], plain["id"]}
    assert ids(status="all") == {
        live["id"],
        hidden["id"],
        closed["id"],
        pending["id"],
        plain["id"],
    }
    assert ids(status="published") == {live["id"]}
    assert ids(status="paused") == {hidden["id"]}
    assert ids(status="closed") == {closed["id"]}
    assert ids(status="pending") == {pending["id"]}
    assert ids(status="draft") == {plain["id"]}
    assert ids(organization_id=organization["id"]) == {pending["id"]}
    assert ids(q="cash") == {hidden["id"]}
    assert ids(q="Example Hospitality") == {
        live["id"],
        hidden["id"],
        pending["id"],
        plain["id"],
    }
    assert ids(q="100%_") == set()
    item = next(
        item
        for item in client.get("/api/v1/admin/listings", headers=auth).json()["items"]
        if item["id"] == pending["id"]
    )
    assert item["effective_status"] == "pending"
    assert item["organization_name"] == organization["name"]
    assert item["employer_name"] == owner["legal_name"]
    assert (
        client.get("/api/v1/admin/listings", headers=auth, params={"status": "x"}).status_code
        == 422
    )


def test_operator_listing_list_pages_with_a_cursor(client, auth):
    owner = employer(client, auth)
    created = [draft(client, auth, owner["id"], f"role-{index}") for index in range(3)]
    seen = []
    cursor = None
    while True:
        params = {"limit": 2, **({"cursor": cursor} if cursor else {})}
        page = client.get("/api/v1/admin/listings", headers=auth, params=params).json()
        seen.extend(item["id"] for item in page["items"])
        cursor = page["next_cursor"]
        if not cursor:
            break
    assert sorted(seen) == sorted(item["id"] for item in created)
    assert len(seen) == len(set(seen))
    missing = client.get(
        "/api/v1/admin/listings",
        headers=auth,
        params={"cursor": "00000000-0000-4000-8000-000000000000"},
    )
    assert missing.status_code == 404


def test_operator_edits_a_live_listing_in_place(client, auth):
    owner = employer(client, auth)
    live = published(client, auth, owner["id"])

    changed = edit(client, auth, live, role="Senior front desk assistant")
    assert changed.status_code == 200, changed.text
    changed = changed.json()
    assert changed["status"] == "published"
    assert changed["role"] == "Senior front desk assistant"
    assert changed["version"] == live["version"] + 1
    assert changed["state_changed_at"] == live["state_changed_at"]
    public = client.get(f"/api/v1/listings/{live['id']}").json()
    assert public["role"] == "Senior front desk assistant"

    unchanged = edit(client, auth, changed, role="Senior front desk assistant")
    assert unchanged.json()["version"] == changed["version"]

    link = edit(client, auth, changed, contact_url="https://example.com/jobs/new-apply")
    assert link.status_code == 422
    link = edit(
        client,
        auth,
        changed,
        reason="employer moved the application page",
        contact_url="https://example.com/jobs/new-apply",
    )
    assert link.status_code == 200, link.text
    current = link.json()

    ended = edit(client, auth, current, work_end_date="2020-08-30", work_start_date="2020-06-01")
    assert ended.status_code == 409
    assert client.get(f"/api/v1/listings/{live['id']}").status_code == 200

    moved = edit(client, auth, current, season_year=2028)
    assert moved.status_code == 409
    stale = edit(client, auth, live, role="Old version")
    assert stale.status_code == 409

    edits = [
        event
        for event in audit_events(client, auth, live["id"])
        if event["action"] == "listing_edited"
    ]
    assert [event["details"]["fields"] for event in edits] == [["contact_url"], ["role"]]
    assert edits[0]["details"]["reason"] == "employer moved the application page"
    assert all(event["details"]["live"] is True for event in edits)


def test_operator_cannot_edit_pending_or_closed_listings(client, auth):
    [(_, provider), _] = provider_organizations(client, auth)
    owner = employer(client, auth)
    pending = submitted_offer(client, provider, owner["id"])
    assert edit(client, auth, pending, role="Changed").status_code == 409
    closed = published(client, auth, owner["id"], "role-2")
    closed = action(client, auth, closed["id"], "close", closed["version"]).json()
    assert edit(client, auth, closed, role="Changed").status_code == 409


def test_republish_needs_a_hidden_listing_and_fresh_evidence(client, auth, database_url):
    owner = employer(client, auth)
    live = published(client, auth, owner["id"])
    assert republish(client, auth, live).status_code == 409

    hidden = action(client, auth, live["id"], "pause", live["version"]).json()
    assert client.get(f"/api/v1/listings/{live['id']}").status_code == 410
    assert republish(client, auth, hidden, url="http://example.com/jobs").status_code == 422
    assert republish(client, auth, hidden, url="https://127.0.0.1/jobs").status_code == 422

    restored = republish(client, auth, hidden)
    assert restored.status_code == 200, restored.text
    restored = restored.json()
    assert restored["status"] == "published"
    assert restored["last_confirmed_at"] > live["last_confirmed_at"]
    assert client.get(f"/api/v1/listings/{live['id']}").status_code == 200
    assert {"listing_confirmed", "listing_published"} <= set(
        audit_actions(client, auth, live["id"])
    )

    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            text("UPDATE listings SET last_confirmed_at=:past WHERE id=:listing_id"),
            {"past": datetime.now(UTC) - timedelta(days=15), "listing_id": live["id"]},
        )
    engine.dispose()
    stale = client.get(f"/api/v1/admin/listings/{live['id']}", headers=auth).json()
    assert stale["effective_status"] == "expired"
    assert republish(client, auth, stale).status_code == 200


def test_republish_is_blocked_while_the_employer_is_disputed(client, auth):
    owner = employer(client, auth)
    live = published(client, auth, owner["id"])
    disputed = client.put(
        f"/api/v1/admin/employers/{owner['id']}",
        headers=auth,
        json={
            "expected_version": owner["version"],
            "legal_name": owner["legal_name"],
            "official_website_url": owner["official_website_url"],
            "identity_status": "disputed",
            "identity_source_url": "https://registry.example.org/record",
        },
    )
    assert disputed.status_code == 200, disputed.text
    paused = client.get(f"/api/v1/admin/listings/{live['id']}", headers=auth).json()
    assert paused["status"] == "paused"
    assert republish(client, auth, paused).status_code == 409


def test_delete_removes_only_drafts_that_were_never_published(client, auth):
    [(_, provider), _] = provider_organizations(client, auth)
    owner = employer(client, auth)

    def delete(item, version=None):
        return client.post(
            f"/api/v1/admin/listings/{item['id']}/delete",
            headers=auth,
            json={"expected_version": version or item["version"], "reason": "duplicate draft"},
        )

    plain = draft(client, auth, owner["id"])
    assert delete(plain, version=plain["version"] + 1).status_code == 409
    assert (
        client.post(
            f"/api/v1/admin/listings/{plain['id']}/delete",
            headers=auth,
            json={"expected_version": plain["version"]},
        ).status_code
        == 422
    )
    assert delete(plain).status_code == 200
    assert client.get(f"/api/v1/admin/listings/{plain['id']}", headers=auth).status_code == 404
    deleted = audit_events(client, auth, plain["id"])[0]
    assert deleted["action"] == "listing_deleted"
    assert deleted["details"]["source_identifier"] == "role-1"
    assert deleted["details"]["reason"] == "duplicate draft"
    assert delete(plain).status_code == 404

    pending = submitted_offer(client, provider, owner["id"])
    assert delete(pending).status_code == 409

    live = published(client, auth, owner["id"], "role-2")
    assert delete(live).status_code == 409
    hidden = action(client, auth, live["id"], "pause", live["version"]).json()
    assert delete(hidden).status_code == 409
    closed = action(client, auth, hidden["id"], "close", hidden["version"]).json()
    assert delete(closed).status_code == 409

    blocked = client.post(
        f"/api/v1/admin/listings/{plain['id']}/delete",
        headers=provider,
        json={"expected_version": 1, "reason": "not mine"},
    )
    assert blocked.status_code == 403


def test_operator_creates_a_draft_for_a_company(client, auth):
    [(organization, provider), (other, other_provider)] = provider_organizations(client, auth)
    owner = employer(client, auth)
    response = client.post(
        "/api/v1/admin/listings",
        headers=auth,
        json={**listing_content(owner["id"]), "organization_id": organization["id"]},
    )
    assert response.status_code == 201, response.text
    created = response.json()
    assert created["organization_id"] == organization["id"]
    assert created["status"] == "draft"
    mine = client.get("/api/v1/provider/listings", headers=provider).json()["items"]
    assert [item["id"] for item in mine] == [created["id"]]
    assert client.get("/api/v1/provider/listings", headers=other_provider).json()["items"] == []

    unknown = client.post(
        "/api/v1/admin/listings",
        headers=auth,
        json={
            **listing_content(owner["id"], "role-2"),
            "organization_id": "00000000-0000-4000-8000-000000000000",
        },
    )
    assert unknown.status_code == 422

    companies = client.get("/api/v1/admin/organizations", headers=auth).json()["items"]
    counts = {company["id"]: company["listing_counts"] for company in companies}
    assert counts[organization["id"]] == {"draft": 1}
    assert counts[other["id"]] == {}


def test_access_keys_need_a_complete_company_profile(client, auth, database_url):
    [(organization, _), _] = provider_organizations(client, auth)
    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(
            text("UPDATE organizations SET address=NULL WHERE id=:organization_id"),
            {"organization_id": organization["id"]},
        )
    engine.dispose()
    rotated = client.post(
        f"/api/v1/admin/organizations/{organization['id']}/access-key",
        headers=auth,
        json={"expected_version": organization["version"]},
    )
    assert rotated.status_code == 409
