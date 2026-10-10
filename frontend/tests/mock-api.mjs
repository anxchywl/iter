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

const employers = [
  {
    id: "employer-1",
    legal_name: "Example Employer (fictional)",
    official_website_url: "https://example.com",
    identity_status: "not_checked",
    identity_source_url: null,
    version: 1,
  },
];
// tests switch the public feed to empty through this flag
let emptyFeed = false;
let portalListings = [];
const organizations = [];

function seedAdminListings() {
  const base = {
    employer_id: "employer-1",
    employer_name: "Example Employer (fictional)",
    organization_id: null,
    organization_name: null,
    season_year: 2027,
    state: "New York",
    city: "Albany",
    location_timezone: "America/New_York",
    category: "Hospitality",
    duties: null,
    official_source_url: "https://example.com/jobs/front-desk",
    contact_url: "https://example.com/jobs/apply",
    work_start_date: "2027-06-01",
    work_end_date: "2027-08-30",
    wage_amount: null,
    wage_currency: null,
    wage_basis: null,
    expected_hours_per_week: null,
    housing_description: null,
    housing_cost_amount: null,
    housing_cost_currency: null,
    housing_cost_basis: null,
    transport_description: null,
    submission_note: null,
    last_confirmed_at: "2026-09-27T10:00:00Z",
    version: 1,
  };
  return [
    {
      ...base,
      id: "admin-live",
      source_identifier: "live-1",
      role: "Front desk assistant",
      status: "published",
      submission_status: "approved",
      effective_status: "published",
      published_at: "2026-09-27T10:00:00Z",
    },
    {
      ...base,
      id: "admin-draft",
      source_identifier: "draft-1",
      role: "Night auditor",
      status: "draft",
      submission_status: "draft",
      effective_status: "draft",
      published_at: null,
    },
  ];
}
let adminListings = seedAdminListings();

async function jsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1:18017");
  let status = 200;
  let body;
  if (url.pathname === "/api/v1/portal/sessions" && request.method === "POST") {
    const credential = request.headers.authorization;
    const valid = credential === "Bearer company-test-key";
    status = credential === "Bearer rate-limited" ? 429 : valid ? 201 : 401;
    body = valid
      ? {
          token: "provider-session",
          role: "provider",
          organization_id: "provider-org",
        }
      : { detail: status === 429 ? "Too many requests" : "Unauthorized" };
  } else if (url.pathname === "/api/v1/portal/session") {
    const valid = request.headers["x-portal-session"] === "provider-session";
    status = valid ? (request.method === "DELETE" ? 204 : 200) : 401;
    body = valid
      ? {
          role: "provider",
          organization_id: "provider-org",
          organization_name: "Example Provider",
          organization_address: "100 Example Street, Boston, MA",
          organization_website_url: "https://provider.example.com",
        }
      : { detail: "Unauthorized" };
  } else if (url.pathname === "/api/v1/portal/me") {
    if (request.headers["x-portal-session"] === "provider-session") {
      body = {
        telegram_user_id: null,
        role: "provider",
        organization_name: "Example Provider",
        organization_address: "100 Example Street, Boston, MA",
        organization_website_url: "https://provider.example.com",
      };
    } else {
      const raw = request.headers.authorization?.replace(/^tma /, "") ?? "";
      const user = JSON.parse(new URLSearchParams(raw).get("user") || "{}");
      const role = user.id === 1 ? "operator" : null;
      status = user.id ? 200 : 401;
      body = user.id
        ? {
            telegram_user_id: user.id,
            role,
            organization_name: null,
            organization_address: null,
            organization_website_url: null,
          }
        : { detail: "Unauthorized" };
    }
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
      key: `company-${organizations.length + 1}`,
      ...payload,
      status: "active",
      access_key_hint: "TEST1234",
      access_key_created_at: new Date().toISOString(),
      version: 1,
    });
    status = 201;
    body = { ...organizations.at(-1), access_key: "iter_company_mock-key" };
  } else if (
    request.method === "PUT" &&
    /^\/api\/v1\/admin\/organizations\/[^/]+$/.test(url.pathname)
  ) {
    const organization = organizations.find(
      (item) => item.id === url.pathname.split("/").at(-1),
    );
    const payload = await jsonBody(request);
    const { expected_version: _, ...fields } = payload;
    Object.assign(organization, fields, { version: organization.version + 1 });
    body = organization;
  } else if (
    request.method === "POST" &&
    /^\/api\/v1\/admin\/organizations\/[^/]+\/status$/.test(url.pathname)
  ) {
    const organization = organizations.find(
      (item) => item.id === url.pathname.split("/").at(-2),
    );
    const payload = await jsonBody(request);
    organization.status = payload.status;
    organization.version += 1;
    body = organization;
  } else if (
    request.method === "POST" &&
    /^\/api\/v1\/admin\/organizations\/[^/]+\/access-key$/.test(url.pathname)
  ) {
    const organization = organizations.find(
      (item) => item.id === url.pathname.split("/").at(-2),
    );
    organization.access_key_hint = "NEWK1234";
    organization.version += 1;
    body = { ...organization, access_key: "iter_company_new-mock-key" };
  } else if (url.pathname === "/api/v1/portal/employers") {
    body = { items: employers };
  } else if (
    request.method === "POST" &&
    url.pathname === "/api/v1/admin/employers"
  ) {
    const payload = await jsonBody(request);
    employers.push({
      id: `employer-${employers.length + 1}`,
      ...payload,
      identity_status: "not_checked",
      identity_source_url: null,
      version: 1,
    });
    status = 201;
    body = employers.at(-1);
  } else if (
    request.method === "PUT" &&
    /^\/api\/v1\/admin\/employers\/[^/]+$/.test(url.pathname)
  ) {
    const payload = await jsonBody(request);
    const target = employers.find(
      (item) => item.id === url.pathname.split("/").at(-1),
    );
    const { expected_version: _, ...fields } = payload;
    Object.assign(target, fields, { version: target.version + 1 });
    body = target;
  } else if (url.pathname === "/__mock/add-incomplete-company") {
    organizations.push({
      id: "org-emka",
      key: "company-emka",
      name: "Emka",
      website_url: null,
      address: null,
      status: "active",
      access_key_hint: null,
      access_key_created_at: null,
      version: 1,
      listing_counts: {},
    });
    body = { created: true };
  } else if (url.pathname === "/__mock/reset-admin") {
    adminListings = seedAdminListings();
    body = { reset: true };
  } else if (
    request.method === "GET" &&
    url.pathname === "/api/v1/admin/listings"
  ) {
    const wanted = url.searchParams.get("status") || "open";
    const query = (url.searchParams.get("q") || "").toLowerCase();
    const company = url.searchParams.get("organization_id");
    body = {
      items: adminListings.filter(
        (item) =>
          (wanted === "all" ||
            (wanted === "open"
              ? item.effective_status !== "closed"
              : item.effective_status === wanted)) &&
          (!query || item.role.toLowerCase().includes(query)) &&
          (!company || item.organization_id === company),
      ),
      next_cursor: null,
    };
  } else if (
    request.method === "POST" &&
    url.pathname === "/api/v1/admin/listings"
  ) {
    const payload = await jsonBody(request);
    const organization = organizations.find(
      (item) => item.id === payload.organization_id,
    );
    adminListings.unshift({
      ...payload,
      id: `admin-created-${adminListings.length + 1}`,
      employer_name: "Example Employer (fictional)",
      organization_name: organization?.name || null,
      status: "draft",
      submission_status: "draft",
      effective_status: "draft",
      published_at: null,
      last_confirmed_at: null,
      submission_note: null,
      version: 1,
    });
    status = 201;
    body = adminListings[0];
  } else if (
    /^\/api\/v1\/admin\/listings\/[^/]+(\/[^/]+)?$/.test(url.pathname)
  ) {
    const [, , , , , listingId, action] = url.pathname.split("/");
    const target = adminListings.find((item) => item.id === listingId);
    const payload = request.method === "GET" ? {} : await jsonBody(request);
    if (!target) {
      status = 404;
      body = { detail: "Not found" };
    } else if (request.method === "GET") {
      body = target;
    } else if (payload.expected_version !== target.version) {
      status = 409;
      body = { detail: "Conflict" };
    } else if (request.method === "PUT") {
      Object.assign(target, payload.content, { version: target.version + 1 });
      body = target;
    } else if (action === "delete") {
      if (target.status !== "draft") {
        status = 409;
        body = { detail: "Conflict" };
      } else {
        adminListings = adminListings.filter((item) => item !== target);
        body = { deleted: target.id };
      }
    } else {
      const next = { pause: "paused", republish: "published", close: "closed" }[
        action
      ];
      Object.assign(target, {
        status: next,
        effective_status: next,
        version: target.version + 1,
      });
      body = target;
    }
  } else if (url.pathname === "/__mock/empty-feed") {
    emptyFeed = url.searchParams.get("on") === "1";
    body = { emptyFeed };
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
  } else if (url.pathname === "/api/v1/listings/locations") {
    body = { items: [{ state: listing.state, city: listing.city }] };
  } else if (url.pathname === "/api/v1/listings") {
    status = url.searchParams.get("q") === "error" ? 503 : 200;
    const match =
      !emptyFeed &&
      (!url.searchParams.has("city") ||
        url.searchParams.get("city") === "Albany");
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
