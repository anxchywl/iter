import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import UTC, datetime

API = "http://127.0.0.1:8000/api/v1"
MARKER = "(fictional)"
SEASON = datetime.now(UTC).year + 1
TOKEN = next(iter(json.loads(os.environ["ADMIN_CREDENTIALS_JSON"]).values()))
# matches scripts/local-portal-link.py; only the local bot token can sign for it
LOCAL_PROVIDER_TELEGRAM_ID = 1000002


def call(
    method: str,
    path: str,
    payload: dict | None = None,
    admin: bool = True,
    allow_not_found: bool = False,
) -> dict | None:
    headers = {"Content-Type": "application/json"}
    if admin:
        headers["Authorization"] = f"Bearer {TOKEN}"
    body = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(API + path, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as exc:
        if allow_not_found and exc.code == 404:
            return None
        sys.exit(f"{method} {path} failed with {exc.code}: {exc.read().decode()[:300]}")


EMPLOYERS = [
    {
        "key": "harbor",
        "legal_name": f"Example Harbor Resort LLC {MARKER}",
        "site": "https://harbor-resort.example.com",
        "identity_source_url": "https://registry.example.org/harbor-resort",
    },
    {
        "key": "pines",
        "legal_name": f"Example Pines Lodge Inc {MARKER}",
        "site": "https://pines-lodge.example.com",
    },
    {
        "key": "summit",
        "legal_name": f"Example Summit Park Co {MARKER}",
        "site": "https://summit-park.example.net",
    },
    {
        "key": "cape",
        "legal_name": f"Example Cape Market LLC {MARKER}",
        "site": "https://cape-market.example.com",
    },
    {
        "key": "glacier",
        "legal_name": f"Example Glacier Outfitters {MARKER}",
        "site": "https://glacier-outfitters.example.org",
    },
]

LISTINGS = [
    {
        "employer": "harbor",
        "slug": "lifeguard",
        "state": "Maryland",
        "city": "Ocean City",
        "location_timezone": "America/New_York",
        "category": "Recreation",
        "role": "Beach lifeguard",
        "duties": "Watch the guarded beach, respond to swimmers, and keep the stand tidy.",
        "work_start_date": f"{SEASON}-06-01",
        "work_end_date": f"{SEASON}-09-05",
        "wage_amount": "16.50",
        "wage_currency": "USD",
        "wage_basis": "hour",
        "expected_hours_per_week": "32",
        "housing_description": "Shared staff apartment near the boardwalk.",
        "housing_cost_amount": "150",
        "housing_cost_currency": "USD",
        "housing_cost_basis": "week",
        "transport_description": "Walk or bike to the beach.",
        "sponsor": "pending",
        "reviews": [
            {
                "role": "Lifeguard",
                "text": "Shifts matched the schedule we were shown. The apartment was crowded but clean.",
                "housing_match": "yes",
            },
            {"role": "Lifeguard", "text": None, "housing_match": "no"},
        ],
    },
    {
        "employer": "harbor",
        "slug": "housekeeping",
        "state": "Maryland",
        "city": "Ocean City",
        "location_timezone": "America/New_York",
        "category": "Hospitality",
        "role": "Housekeeping attendant",
        "duties": "Clean guest rooms and restock linens.",
        "work_start_date": f"{SEASON}-05-25",
        "work_end_date": f"{SEASON}-09-10",
        "wage_amount": "15.00",
        "wage_currency": "USD",
        "wage_basis": "hour",
        "expected_hours_per_week": "35",
        "sponsor": "route",
    },
    {
        "employer": "pines",
        "slug": "line-cook",
        "state": "Wisconsin",
        "city": "Wisconsin Dells",
        "location_timezone": "America/Chicago",
        "category": "Food service",
        "role": "Line cook",
        "duties": "Prepare grill and fryer orders during lunch and dinner service.",
        "work_start_date": f"{SEASON}-06-10",
        "work_end_date": f"{SEASON}-08-30",
        "wage_amount": "17.00",
        "wage_currency": "USD",
        "wage_basis": "hour",
        "expected_hours_per_week": "40",
        "housing_description": "Employer dormitory, two people per room.",
        "housing_cost_amount": "120",
        "housing_cost_currency": "USD",
        "housing_cost_basis": "week",
        "transport_description": "Employer shuttle between the dormitory and the lodge.",
        "reviews": [
            {
                "role": "Line cook",
                "text": "Busy kitchen and fair supervisors. Overtime was optional.",
                "housing_match": "yes",
            }
        ],
    },
    {
        "employer": "pines",
        "slug": "waterpark",
        "state": "Wisconsin",
        "city": "Wisconsin Dells",
        "location_timezone": "America/Chicago",
        "category": "Recreation",
        "role": "Waterpark attendant",
        "duties": "Guide guests at ride entrances and check height requirements.",
    },
    {
        "employer": "summit",
        "slug": "gift-shop",
        "state": "Montana",
        "city": "West Yellowstone",
        "location_timezone": "America/Denver",
        "category": "Retail",
        "role": "Gift shop associate",
        "duties": "Help visitors, run the register, and stock shelves.",
        "work_start_date": f"{SEASON}-05-20",
        "work_end_date": f"{SEASON}-09-25",
        "wage_amount": "15.25",
        "wage_currency": "USD",
        "wage_basis": "hour",
        "expected_hours_per_week": "36",
        "housing_description": "Seasonal staff dormitory with shared kitchen.",
        "housing_cost_amount": "95",
        "housing_cost_currency": "USD",
        "housing_cost_basis": "week",
        "sponsor": "no-route",
    },
    {
        "employer": "cape",
        "slug": "cashier",
        "state": "New Jersey",
        "city": "Cape May",
        "location_timezone": "America/New_York",
        "category": "Retail",
        "role": "Cashier",
        "work_start_date": f"{SEASON}-06-15",
        "work_end_date": f"{SEASON}-09-01",
        "wage_amount": "15.49",
        "wage_currency": "USD",
        "wage_basis": "hour",
        "expected_hours_per_week": "30",
        "transport_description": "Public bus stop next to the store.",
    },
    {
        "employer": "glacier",
        "slug": "tour-desk",
        "state": "Alaska",
        "city": "Juneau",
        "location_timezone": "America/Juneau",
        "category": "Tourism",
        "role": "Tour desk assistant",
        "duties": "Book excursions for cruise visitors and answer questions.",
        "work_start_date": f"{SEASON}-05-15",
        "work_end_date": f"{SEASON}-09-15",
        "wage_amount": "720",
        "wage_currency": "USD",
        "wage_basis": "week",
        "expected_hours_per_week": "40",
    },
]


def sponsor_payload(kind: str, site: str, version: int) -> dict:
    payload = {
        "expected_version": version,
        "reason": "fictional fixture",
        "route_status": "reported",
        "route_source_url": f"{site}/summer-work-travel",
        "approval_status": "unknown",
    }
    if kind == "pending":
        payload |= {
            "approval_status": "pending",
            "sponsor_name": f"Example Sponsor {MARKER}",
            "decision_url": "https://sponsor.example.org/reviews/harbor",
        }
    elif kind == "no-route":
        payload["route_status"] = "reported_no_route"
    return payload


def add_review(listing_id: str, review: dict) -> None:
    receipt = call(
        "POST",
        "/reviews",
        {
            "request_id": str(uuid.uuid4()),
            "listing_id": listing_id,
            "season_year": SEASON,
            "role": review["role"],
            "pay_match": "yes",
            "pay_clarity": "clear",
            "hours_match": "yes",
            "housing_match": review["housing_match"],
            "transport_match": "not_applicable",
            "text": review["text"],
            "self_report_consent": True,
        },
        admin=False,
    )
    stored = call("GET", f"/admin/reviews/{receipt['receipt_id']}")
    call(
        "POST",
        f"/admin/reviews/{stored['id']}/approve",
        {"expected_version": stored["version"], "reason": "fictional fixture"},
    )


def main() -> None:
    if call("GET", "/admin/organizations/demo-provider", allow_not_found=True) is None:
        call(
            "POST",
            "/admin/organizations",
            {"key": "demo-provider", "name": f"Example Offer Provider {MARKER}"},
        )
    members = next(
        item["member_telegram_ids"]
        for item in call("GET", "/admin/organizations")["items"]
        if item["key"] == "demo-provider"
    )
    if LOCAL_PROVIDER_TELEGRAM_ID not in members:
        call(
            "POST",
            "/admin/organizations/demo-provider/members",
            {"telegram_user_id": LOCAL_PROVIDER_TELEGRAM_ID},
        )
    existing = call("GET", f"/listings?q={urllib.parse.quote(MARKER)}&page_size=50", admin=False)
    if len(existing["items"]) == len(LISTINGS):
        print("Fictional listings are already current; nothing to add.")
        return
    for item in existing["items"]:
        stale = call("GET", f"/admin/listings/{item['id']}")
        call(
            "POST",
            f"/admin/listings/{item['id']}/close",
            {"expected_version": stale["version"], "reason": "replaced fictional fixture"},
        )
    employers = {}
    for spec in EMPLOYERS:
        employer = call(
            "POST",
            "/admin/employers",
            {"legal_name": spec["legal_name"], "official_website_url": spec["site"]},
        )
        if "identity_source_url" in spec:
            employer = call(
                "PUT",
                f"/admin/employers/{employer['id']}",
                {
                    "expected_version": employer["version"],
                    "legal_name": spec["legal_name"],
                    "official_website_url": spec["site"],
                    "identity_status": "checked",
                    "identity_source_url": spec["identity_source_url"],
                },
            )
        employers[spec["key"]] = (employer["id"], spec["site"])
    for spec in LISTINGS:
        content = {
            key: value
            for key, value in spec.items()
            if key not in {"employer", "slug", "sponsor", "reviews"}
        }
        employer_id, site = employers[spec["employer"]]
        content |= {
            "employer_id": employer_id,
            "source_identifier": f"fixture-{spec['slug']}-{uuid.uuid4().hex[:8]}",
            "season_year": SEASON,
            "official_source_url": f"{site}/jobs/{spec['slug']}",
            "contact_url": f"{site}/apply/{spec['slug']}",
        }
        listing = call("POST", "/admin/listings", content)
        listing = call(
            "POST",
            f"/admin/listings/{listing['id']}/confirm",
            {
                "expected_version": listing["version"],
                "reason": "fictional fixture",
                "confirmation_source_url": content["official_source_url"],
            },
        )
        if "sponsor" in spec:
            listing = call(
                "POST",
                f"/admin/listings/{listing['id']}/sponsor",
                sponsor_payload(spec["sponsor"], site, listing["version"]),
            )
        call(
            "POST",
            f"/admin/listings/{listing['id']}/publish",
            {"expected_version": listing["version"], "reason": "fictional fixture"},
        )
        for review in spec.get("reviews", []):
            add_review(listing["id"], review)
    current = call("GET", f"/listings?q={urllib.parse.quote(MARKER)}&page_size=50", admin=False)
    if len(current["items"]) != len(LISTINGS):
        sys.exit("Fictional listings were created but are not all current")
    print(f"Published {len(LISTINGS)} fictional listings for season {SEASON}.")


if __name__ == "__main__":
    main()
