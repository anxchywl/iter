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

createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1:18017");
  let status = 200;
  let body;
  if (url.pathname === "/api/v1/listings") {
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
  response.end(JSON.stringify(body));
}).listen(18017, "127.0.0.1");
