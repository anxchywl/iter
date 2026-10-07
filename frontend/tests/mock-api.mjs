import { createServer } from "node:http";

const id = "11111111-1111-4111-8111-111111111111";
const listing = {
  id,
  season_year: 2027,
  employer_legal_name: "DEMO Seabrook Hospitality LLC",
  employer_official_website_url: "https://example.com",
  employer_identity_status: "not_checked",
  employer_identity_checked_at: null,
  employer_identity_public_source_url: null,
  state: "New York",
  city: "Albany",
  location_timezone: "America/New_York",
  category: "Hospitality",
  role: "Front desk assistant",
  duties: "Welcome guests and help with check-in.",
  official_source_url: "https://example.com/jobs/front-desk",
  contact_url: "https://example.com/jobs/apply",
  work_start_date: "2027-06-01",
  work_end_date: "2027-08-30",
  wage_amount: "16.50",
  wage_currency: "USD",
  wage_basis: "hour",
  expected_hours_per_week: "35",
  housing_description: "Shared room",
  housing_cost_amount: "120",
  housing_cost_currency: "USD",
  housing_cost_basis: "week",
  transport_description: null,
  sponsor_route_status: "reported",
  sponsor_route_source_url: "https://example.com/jobs/front-desk",
  sponsor_approval_status: "unknown",
  sponsor_name: null,
  sponsor_decision_url: null,
  sponsor_decision_at: null,
  last_confirmed_at: "2026-09-27T10:00:00Z",
};

const employer = {
  id: "employer-1",
  legal_name: "Example Employer (fictional)",
};
let portalListings = [];
const organizations = [];

async function jsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1:18017");
  let status = 200;
  let body;
  if (url.pathname === "/api/v1/portal/me") {
    // the real backend verifies the signature; the mock only reads the user id
    const raw = request.headers.authorization?.replace(/^tma /, "") ?? "";
    const user = JSON.parse(new URLSearchParams(raw).get("user") || "{}");
    const role = { 1: "operator", 2: "provider" }[user.id] ?? null;
    status = user.id ? 200 : 401;
    body = user.id
      ? {
          telegram_user_id: user.id,
          role,
          organization_name: role === "provider" ? "Example Provider" : null,
        }
      : { detail: "Unauthorized" };
  } else if (
    url.pathname === "/api/v1/admin/organizations" &&
    request.method === "GET"
  ) {
    body = { items: organizations };
  } else if (
    url.pathname === "/api/v1/admin/organizations" &&
    request.method === "POST"
  ) {
    const payload = await jsonBody(request);
    organizations.push({
      id: `org-${organizations.length + 1}`,
      ...payload,
      status: "active",
      member_telegram_ids: [],
    });
    status = 201;
    body = organizations.at(-1);
  } else if (
    /^\/api\/v1\/admin\/organizations\/[^/]+\/members(\/\d+)?$/.test(
      url.pathname,
    )
  ) {
    const [, , , , , key, , member] = url.pathname.split("/");
    const organization = organizations.find((item) => item.key === key);
    if (request.method === "POST") {
      const payload = await jsonBody(request);
      organization.member_telegram_ids.push(payload.telegram_user_id);
      status = 201;
      body = {
        organization_key: key,
        telegram_user_id: payload.telegram_user_id,
      };
    } else {
      organization.member_telegram_ids =
        organization.member_telegram_ids.filter((id) => id !== Number(member));
      status = 204;
    }
  } else if (url.pathname === "/api/v1/portal/employers") {
    body = { items: [employer] };
  } else if (
    url.pathname === "/api/v1/provider/listings" &&
    request.method === "GET"
  ) {
    body = { items: portalListings };
  } else if (
    url.pathname === "/api/v1/provider/listings" &&
    request.method === "POST"
  ) {
    const payload = await jsonBody(request);
    const created = {
      ...payload,
      id: "provider-listing-1",
      status: "draft",
      submission_status: "draft",
      submission_note: null,
      version: 1,
    };
    portalListings = [created];
    status = 201;
    body = created;
  } else if (
    request.method === "POST" &&
    /^\/api\/v1\/provider\/listings\/[^/]+\/submit$/.test(url.pathname)
  ) {
    portalListings = portalListings.map((item) => ({
      ...item,
      submission_status: "pending",
      version: item.version + 1,
    }));
    body = portalListings[0];
  } else if (url.pathname === "/api/v1/portal/submissions") {
    body = {
      items: portalListings.filter(
        (item) => item.submission_status === "pending",
      ),
    };
  } else if (
    request.method === "GET" &&
    (url.pathname === "/api/v1/admin/reviews" ||
      url.pathname === "/api/v1/admin/reports")
  ) {
    body = { items: [], next_cursor: null };
  } else if (
    request.method === "POST" &&
    /^\/api\/v1\/admin\/(reviews|reports)\/[^/]+\/[^/]+$/.test(url.pathname)
  ) {
    body = { status: "complete" };
  } else if (
    request.method === "POST" &&
    /\/api\/v1\/portal\/submissions\/[^/]+\/(approve|changes)$/.test(
      url.pathname,
    )
  ) {
    portalListings = [];
    body = { status: "published" };
  } else if (url.pathname === "/api/v1/listings") {
    status = url.searchParams.get("q") === "error" ? 503 : 200;
    const match =
      !url.searchParams.has("city") ||
      url.searchParams.get("city") === "Albany";
    body = {
      items: match ? [listing] : [],
      page: 1,
      page_size: 12,
      has_more: false,
    };
  } else if (url.pathname === `/api/v1/listings/${id}`) {
    body = listing;
  } else if (url.pathname === `/api/v1/listings/${id}/reviews`) {
    body = { items: [], count: 0 };
  } else if (request.method === "POST" && url.pathname === "/api/v1/reviews") {
    status = 202;
    body = {
      receipt_id: "22222222-2222-4222-8222-222222222222",
      status: "pending",
    };
  } else if (request.method === "POST" && url.pathname === "/api/v1/reports") {
    status = 202;
    body = {
      receipt_id: "33333333-3333-4333-8333-333333333333",
      status: "received",
    };
  } else if (url.pathname.endsWith("/stale")) {
    status = 410;
    body = { detail: "Unavailable", reason: "stale" };
  } else if (url.pathname.endsWith("/paused")) {
    status = 410;
    body = { detail: "Unavailable", reason: "unavailable" };
  } else {
    status = 404;
    body = { detail: "Not found" };
  }
  response.writeHead(status, { "content-type": "application/json" });
  response.end(status === 204 ? undefined : JSON.stringify(body));
}).listen(18017, "127.0.0.1");
