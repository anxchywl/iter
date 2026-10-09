import { telegramInitData, type TelegramWindow } from "@/lib/telegram";

export type Role = "operator" | "provider";

export type OperatorSection =
  | "offer-review"
  | "experience-review"
  | "issue-reports"
  | "vacancies"
  | "employers"
  | "companies";

export type PortalIdentity = {
  telegram_user_id: number | null;
  role: Role | null;
  organization_name: string | null;
  organization_address: string | null;
  organization_website_url: string | null;
};

export type Organization = {
  id: string;
  key: string;
  name: string;
  website_url: string | null;
  address: string | null;
  status: string;
  access_key_hint: string | null;
  access_key_created_at: string | null;
  version: number;
  listing_counts?: Partial<Record<ListingState, number>>;
};

export type IssuedAccessKey = { organizationName: string; accessKey: string };

export type IdentityStatus = "not_checked" | "checked" | "disputed";

export type Employer = {
  id: string;
  legal_name: string;
  official_website_url: string;
  identity_status: IdentityStatus;
  identity_source_url: string | null;
  version: number;
};

export const identityLabels: Record<IdentityStatus, string> = {
  not_checked: "Identity not checked",
  checked: "Identity checked",
  disputed: "Identity disputed",
};

export type PortalListing = {
  id: string;
  employer_id: string;
  source_identifier: string;
  season_year: number;
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
  wage_basis: string | null;
  expected_hours_per_week: string | null;
  housing_description: string | null;
  housing_cost_amount: string | null;
  housing_cost_currency: string | null;
  housing_cost_basis: string | null;
  transport_description: string | null;
  status: string;
  submission_status: string;
  submission_note: string | null;
  version: number;
};

export type ListingState =
  "draft" | "pending" | "published" | "paused" | "expired" | "closed";

export type AdminListing = PortalListing & {
  organization_id: string | null;
  published_at: string | null;
  last_confirmed_at: string | null;
  effective_status: ListingState;
  employer_name: string;
  organization_name: string | null;
};

export const listingStateLabels: Record<ListingState, string> = {
  draft: "Draft",
  pending: "In review",
  published: "Live",
  paused: "Hidden",
  expired: "Expired",
  closed: "Closed",
};

export type ModerationReview = {
  id: string;
  role: string;
  season_year: number;
  text: string | null;
  version: number;
};

export type ModerationReport = {
  id: string;
  item_type: "listing" | "review";
  item_id: string;
  reason: string;
  explanation: string | null;
  version: number;
};

export class PortalAccessError extends Error {}

export function failure(status: number) {
  if (status === 409)
    return "This item changed or does not allow that action now. Reload and try again.";
  if (status === 422)
    return "Some fields are invalid. Check them and try again.";
  if (status === 403) return "Your account cannot do this.";
  if (status === 429) return "Too many requests. Wait a minute and try again.";
  return "The request failed. Try again later.";
}

export async function portalFetch(path: string, init?: RequestInit) {
  const initData = telegramInitData(window as unknown as TelegramWindow);
  const response = await fetch(`/api/portal/${path}`, {
    ...init,
    headers: {
      ...(initData ? { Authorization: `tma ${initData}` } : {}),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (response.status === 401) throw new PortalAccessError("expired");
  if (!response.ok) throw new Error(failure(response.status));
  return response.status === 204 ? null : response.json();
}

export function reasonText(reason: unknown) {
  if (reason instanceof PortalAccessError)
    return "Your session ended. Reopen the console from Telegram; open forms keep what you typed.";
  return reason instanceof Error ? reason.message : failure(0);
}

export function isConflict(reason: unknown) {
  return reason instanceof Error && reason.message === failure(409);
}

// mirrors the server url rule so mistakes show next to the field before saving
export function urlProblem(value: string): string | null {
  const text = value.trim();
  if (!text) return "Enter a link.";
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return "Enter a full link that starts with https://.";
  }
  if (url.protocol !== "https:") return "Use a secure https:// link.";
  if (
    !url.hostname.includes(".") ||
    /\.(local|localhost)$/.test(url.hostname) ||
    /^[\d.]+$|^\[/.test(url.hostname) ||
    url.username ||
    url.password ||
    /\s/.test(text)
  )
    return "Use a public website address, not an IP address or local name.";
  return null;
}

export type FieldErrors = Record<string, string>;

export function listingErrors(form: FormData): FieldErrors {
  const errors: FieldErrors = {};
  const text = (name: string) => String(form.get(name) || "").trim();
  const required: Array<[string, string]> = [
    ["employer_id", "Choose the employer."],
    ["source_identifier", "Add an internal reference."],
    ["role", "Add the role."],
    ["state", "Add the state."],
    ["city", "Add the city."],
    ["location_timezone", "Add the time zone."],
    ["category", "Add the job type."],
  ];
  for (const [name, message] of required)
    if (!text(name)) errors[name] = message;
  const season = Number(text("season_year"));
  if (!Number.isInteger(season) || season < 2020 || season > 2100)
    errors.season_year = "Use a season year between 2020 and 2100.";
  for (const name of ["official_source_url", "contact_url"]) {
    const problem = urlProblem(text(name));
    if (problem) errors[name] = problem;
  }
  const start = text("work_start_date");
  const end = text("work_end_date");
  if (start && end && end < start)
    errors.work_end_date = "The end date is before the start date.";
  if (text("wage_amount") && !/^[A-Z]{3}$/.test(text("wage_currency")))
    errors.wage_currency = "Use a three-letter currency code, like USD.";
  if (
    text("housing_cost_amount") &&
    !/^[A-Z]{3}$/.test(text("housing_cost_currency"))
  )
    errors.housing_cost_currency =
      "Use a three-letter currency code, like USD.";
  return errors;
}

export function companyErrors(form: FormData): FieldErrors {
  const errors: FieldErrors = {};
  const name = String(form.get("name") || "").trim();
  const address = String(form.get("address") || "").trim();
  if (!name) errors.name = "Add the company name.";
  const website = urlProblem(String(form.get("website_url") || ""));
  if (website) errors.website_url = website;
  if (!address) errors.address = "Add the business address.";
  return errors;
}

export function nullable(form: FormData, name: string) {
  const value = String(form.get(name) || "").trim();
  return value || null;
}

export function listingPayload(form: FormData) {
  const wageAmount = nullable(form, "wage_amount");
  const housingAmount = nullable(form, "housing_cost_amount");
  return {
    employer_id: String(form.get("employer_id")),
    source_identifier: String(form.get("source_identifier")),
    season_year: Number(form.get("season_year")),
    state: String(form.get("state")),
    city: String(form.get("city")),
    location_timezone: String(form.get("location_timezone")),
    category: String(form.get("category")),
    role: String(form.get("role")),
    duties: nullable(form, "duties"),
    official_source_url: String(form.get("official_source_url")),
    contact_url: String(form.get("contact_url")),
    work_start_date: nullable(form, "work_start_date"),
    work_end_date: nullable(form, "work_end_date"),
    wage_amount: wageAmount,
    wage_currency: wageAmount ? String(form.get("wage_currency")) : null,
    wage_basis: wageAmount ? String(form.get("wage_basis")) : null,
    expected_hours_per_week: nullable(form, "expected_hours_per_week"),
    housing_description: nullable(form, "housing_description"),
    housing_cost_amount: housingAmount,
    housing_cost_currency: housingAmount
      ? String(form.get("housing_cost_currency"))
      : null,
    housing_cost_basis: housingAmount
      ? String(form.get("housing_cost_basis"))
      : null,
    transport_description: nullable(form, "transport_description"),
  };
}
