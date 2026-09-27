export type Listing = {
  id: string;
  season_year: number;
  employer_legal_name: string;
  employer_official_website_url: string;
  employer_identity_status: "not_checked" | "checked" | "disputed";
  employer_identity_checked_at: string | null;
  employer_identity_public_source_url: string | null;
  state: string;
  city: string;
  location_timezone: string;
  category: string;
  role: string;
  duties: string | null;
  official_source_url: string;
  contact_url: string;
  work_start_date: string | null;
  work_end_date: string | null;
  wage_amount: string | null;
  wage_currency: string | null;
  wage_basis: "hour" | "day" | "week" | "month" | null;
  expected_hours_per_week: string | null;
  housing_description: string | null;
  housing_cost_amount: string | null;
  housing_cost_currency: string | null;
  housing_cost_basis: "day" | "week" | "month" | "season" | null;
  transport_description: string | null;
  sponsor_route_status: "not_reported" | "reported" | "reported_no_route";
  sponsor_route_source_url: string | null;
  sponsor_approval_status: "unknown" | "pending" | "confirmed" | "not_approved";
  sponsor_name: string | null;
  sponsor_decision_url: string | null;
  sponsor_decision_at: string | null;
  last_confirmed_at: string | null;
};

export type Review = {
  id: string;
  season_year: number;
  role: string;
  submitted_at: string;
  pay_match: Answer;
  pay_clarity: "clear" | "unclear" | "unknown";
  hours_match: Answer;
  housing_match: Answer;
  transport_match: Answer;
  text: string | null;
  label: "self-reported experience";
};

type Answer = "yes" | "no" | "unknown" | "not_applicable";
export type SearchInput = Record<string, string | string[] | undefined>;
export type SearchFilters = {
  q: string;
  season: string;
  state: string;
  city: string;
  category: string;
  start_from: string;
  end_by: string;
  min_wage: string;
  wage_currency: string;
  wage_basis: string;
  min_hours: string;
  housing_known: string;
  confirmed_within_days: string;
  page: string;
};

const limits: Record<keyof SearchFilters, number> = {
  q: 80,
  season: 4,
  state: 80,
  city: 120,
  category: 80,
  start_from: 10,
  end_by: 10,
  min_wage: 12,
  wage_currency: 3,
  wage_basis: 5,
  min_hours: 6,
  housing_known: 5,
  confirmed_within_days: 2,
  page: 3,
};

export function parseFilters(input: SearchInput): SearchFilters {
  const result = {} as SearchFilters;
  for (const key of Object.keys(limits) as (keyof SearchFilters)[]) {
    const value = input[key];
    result[key] =
      typeof value === "string" ? value.trim().slice(0, limits[key]) : "";
  }
  for (const key of ["start_from", "end_by"] as const) {
    if (result[key] && !/^\d{4}-\d{2}-\d{2}$/.test(result[key]))
      result[key] = "";
  }
  if (!/^(202\d|20[3-9]\d|2100)$/.test(result.season)) result.season = "";
  if (!/^(hour|day|week|month)$/.test(result.wage_basis))
    result.wage_basis = "hour";
  if (!/^[A-Z]{3}$/.test(result.wage_currency)) result.wage_currency = "USD";
  if (!/^\d+(\.\d{1,2})?$/.test(result.min_wage)) result.min_wage = "";
  if (!/^\d+(\.\d{1,2})?$/.test(result.min_hours)) result.min_hours = "";
  if (!/^(true|false)$/.test(result.housing_known)) result.housing_known = "";
  if (!["3", "7", "14"].includes(result.confirmed_within_days)) {
    result.confirmed_within_days = "";
  }
  if (!/^[1-9]\d{0,2}$/.test(result.page) || Number(result.page) > 100)
    result.page = "1";
  return result;
}

export function searchQuery(filters: SearchFilters): URLSearchParams {
  const params = new URLSearchParams();
  const keys: (keyof SearchFilters)[] = [
    "q",
    "season",
    "state",
    "city",
    "category",
    "start_from",
    "end_by",
    "min_hours",
    "housing_known",
    "confirmed_within_days",
  ];
  for (const key of keys) if (filters[key]) params.set(key, filters[key]);
  if (filters.min_wage) {
    params.set("min_wage", filters.min_wage);
    params.set("wage_currency", filters.wage_currency);
    params.set("wage_basis", filters.wage_basis);
  }
  params.set("page", filters.page);
  params.set("page_size", "12");
  return params;
}

export function pageQuery(filters: SearchFilters, page: number): string {
  const params = searchQuery({ ...filters, page: String(page) });
  params.delete("page_size");
  return params.toString();
}

type Result<T> =
  | { kind: "ok"; data: T }
  | { kind: "missing" | "stale" | "unavailable" | "invalid" | "error" };

async function api<T>(path: string): Promise<Result<T>> {
  const base = process.env.DIRECTORY_API_URL ?? "http://127.0.0.1:8000";
  try {
    const response = await fetch(new URL(path, base), {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (response.status === 404) return { kind: "missing" };
    if (response.status === 422) return { kind: "invalid" };
    if (response.status === 410) {
      const body = await response.json().catch(() => ({}));
      return { kind: body.reason === "stale" ? "stale" : "unavailable" };
    }
    if (!response.ok) return { kind: "error" };
    return { kind: "ok", data: (await response.json()) as T };
  } catch {
    return { kind: "error" };
  }
}

export function listListings(filters: SearchFilters) {
  return api<{
    items: Listing[];
    page: number;
    page_size: number;
    has_more: boolean;
  }>(`/api/v1/listings?${searchQuery(filters)}`);
}

export function getListing(id: string) {
  return api<Listing>(`/api/v1/listings/${encodeURIComponent(id)}`);
}

export function getReviews(id: string) {
  return api<{ items: Review[]; count: number }>(
    `/api/v1/listings/${encodeURIComponent(id)}/reviews`,
  );
}

export function plainText(value: string | null | undefined): string | null {
  if (value == null) return null;
  return value.replace(/&(?:amp|lt|gt|quot|#x27);/g, (entity) => {
    const decoded: Record<string, string> = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&#x27;": "'",
    };
    return decoded[entity];
  });
}
