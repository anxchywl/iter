"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { telegramInitData, type TelegramWindow } from "@/lib/telegram";

type Role = "operator" | "provider";

type OperatorSection =
  | "offer-review"
  | "experience-review"
  | "issue-reports"
  | "employers"
  | "companies";

type PortalIdentity = {
  telegram_user_id: number | null;
  role: Role | null;
  organization_name: string | null;
  organization_address: string | null;
  organization_website_url: string | null;
};

type Organization = {
  id: string;
  key: string;
  name: string;
  website_url: string | null;
  address: string | null;
  status: string;
  access_key_hint: string | null;
  access_key_created_at: string | null;
  version: number;
};

type IssuedAccessKey = { organizationName: string; accessKey: string };

type IdentityStatus = "not_checked" | "checked" | "disputed";

type Employer = {
  id: string;
  legal_name: string;
  official_website_url: string;
  identity_status: IdentityStatus;
  identity_source_url: string | null;
  version: number;
};

const identityLabels: Record<IdentityStatus, string> = {
  not_checked: "Identity not checked",
  checked: "Identity checked",
  disputed: "Identity disputed",
};

type PortalListing = {
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

type ModerationReview = {
  id: string;
  role: string;
  season_year: number;
  text: string | null;
  version: number;
};

type ModerationReport = {
  id: string;
  item_type: "listing" | "review";
  item_id: string;
  reason: string;
  explanation: string | null;
  version: number;
};

class PortalAccessError extends Error {}

function failure(status: number) {
  if (status === 409)
    return "This item changed or does not allow that action now. Reload and try again.";
  if (status === 422)
    return "Some fields are invalid. Check them and try again.";
  if (status === 403) return "Your account cannot do this.";
  if (status === 429) return "Too many requests. Wait a minute and try again.";
  return "The request failed. Try again later.";
}

async function portalFetch(path: string, init?: RequestInit) {
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

function reasonText(reason: unknown) {
  return reason instanceof Error ? reason.message : failure(0);
}

type Access =
  | { state: "loading" | "expired" | "error" }
  | { state: "none"; telegramId: number }
  | { state: "ready"; identity: PortalIdentity };

function usePortalAccess(expected: Role): Access {
  const [access, setAccess] = useState<Access>({ state: "loading" });
  useEffect(() => {
    portalFetch("portal/me")
      .then((identity: PortalIdentity) => {
        if (!identity.role && identity.telegram_user_id)
          setAccess({ state: "none", telegramId: identity.telegram_user_id });
        else if (!identity.role) setAccess({ state: "expired" });
        else if (identity.role !== expected)
          window.location.assign(
            identity.role === "operator" ? "/admin" : "/manage",
          );
        else setAccess({ state: "ready", identity });
      })
      .catch((reason) =>
        setAccess({
          state:
            reason instanceof PortalAccessError && reason.message === "expired"
              ? reason.message
              : "error",
        }),
      );
  }, [expected]);
  return access;
}

function AccessNotice({
  access,
  openLink,
  expected,
}: {
  access: Exclude<Access, { state: "ready" }>;
  openLink: string | null;
  expected: Role;
}) {
  if (access.state === "loading")
    return <p className="portal-loading">Loading workspace…</p>;
  return (
    <section className="portal-login" aria-labelledby="portal-access-title">
      <p className="portal-kicker">Offer management</p>
      {access.state === "expired" && (
        <>
          <h1 id="portal-access-title">
            {expected === "provider" ? "Company sign in" : "Open in Telegram"}
          </h1>
          <p>
            {expected === "provider"
              ? "Use the private access key issued to your company. No Telegram account is required."
              : "The operator console opens inside the iter Mini App."}
          </p>
          {expected === "provider" ? (
            <a className="primary-button" href="/portal/login">
              Sign in with access key
            </a>
          ) : (
            openLink && (
              <a className="primary-button" href={openLink}>
                Open the Mini App
              </a>
            )
          )}
        </>
      )}
      {access.state === "none" && (
        <>
          <h1 id="portal-access-title">No access yet</h1>
          <p>
            Send this Telegram ID to the iter team. They will add it to your
            organization.
          </p>
          <p className="portal-id">
            <span>Telegram ID</span>
            <strong>{access.telegramId}</strong>
          </p>
        </>
      )}
      {access.state === "error" && (
        <>
          <h1 id="portal-access-title">Workspace unavailable</h1>
          <p>Try again in a few minutes.</p>
        </>
      )}
    </section>
  );
}

function PortalHeader({ title, label }: { title: string; label: string }) {
  async function signOut() {
    await fetch("/api/portal/session", { method: "DELETE" });
    window.location.assign("/portal/login");
  }
  return (
    <div className="portal-heading">
      <div>
        <p className="portal-kicker">{label}</p>
        <h1>{title}</h1>
      </div>
      {title === "Provider workspace" && (
        <button type="button" className="button-secondary" onClick={signOut}>
          Sign out
        </button>
      )}
    </div>
  );
}

export function PortalLogin() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    fetch("/api/portal/session", { cache: "no-store" }).then((response) => {
      if (response.ok) window.location.replace("/manage");
    });
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const accessKey = String(
      new FormData(event.currentTarget).get("access_key") || "",
    ).trim();
    try {
      const response = await fetch("/api/portal/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_key: accessKey }),
      });
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? "That access key is not valid. Check the full key and try again."
            : response.status === 429
              ? "Too many sign-in attempts. Wait one minute and try again."
              : "Sign in is unavailable right now. Try again shortly.",
        );
      window.location.assign("/manage");
    } catch (reason) {
      setError(reasonText(reason));
      setPending(false);
    }
  }

  return (
    <section className="portal-login" aria-labelledby="portal-login-title">
      <h1 id="portal-login-title">Company sign in</h1>
      <form className="portal-form" onSubmit={submit}>
        <label>
          Company access key
          <input
            name="access_key"
            type="password"
            autoComplete="current-password"
            spellCheck={false}
            required
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="portal-hint">
        Use the access key issued to your company. Keep this key private. Ask
        the Iter team to issue or replace a key.
      </p>
      <a className="portal-contact" href="mailto:anxchywl@gmail.com">
        anxchywl@gmail.com
      </a>
    </section>
  );
}

type Decision = {
  key: string;
  label: string;
  prompt: string;
  primary?: boolean;
};

// telegram webviews do not reliably show window.prompt, so decisions take their note inline
function DecisionActions({
  decisions,
  onDecide,
}: {
  decisions: Decision[];
  onDecide: (key: string, note: string) => Promise<boolean>;
}) {
  const [chosen, setChosen] = useState<Decision | null>(null);
  const [pending, setPending] = useState(false);
  if (!chosen)
    return (
      <div className="portal-actions">
        {decisions.map((decision) => (
          <button
            key={decision.key}
            type="button"
            className={decision.primary ? undefined : "button-secondary"}
            onClick={() => setChosen(decision)}
          >
            {decision.label}
          </button>
        ))}
      </div>
    );
  const current = chosen;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const note = String(new FormData(event.currentTarget).get("note") || "")
      .trim()
      .slice(0, 300);
    if (!note) return;
    setPending(true);
    const done = await onDecide(current.key, note);
    setPending(false);
    if (done) setChosen(null);
  }
  return (
    <form className="portal-form portal-decision" onSubmit={submit}>
      <label>
        {current.prompt}
        <textarea name="note" required maxLength={300} autoFocus />
      </label>
      <div className="portal-actions">
        <button
          type="button"
          className="button-secondary"
          onClick={() => setChosen(null)}
        >
          Cancel
        </button>
        <button type="submit" disabled={pending}>
          {current.label}
        </button>
      </div>
    </form>
  );
}

function EmployerEditor({
  employer,
  onSave,
  onCancel,
}: {
  employer: Employer;
  onSave: (employer: Employer, form: FormData) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<IdentityStatus>(
    employer.identity_status,
  );
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const done = await onSave(employer, new FormData(event.currentTarget));
    setPending(false);
    if (done) onCancel();
  }
  return (
    <form className="portal-form portal-form-grid" onSubmit={submit}>
      <label>
        Legal name
        <input
          name="legal_name"
          defaultValue={employer.legal_name}
          required
          maxLength={160}
        />
      </label>
      <label>
        Official website
        <input
          name="official_website_url"
          type="url"
          defaultValue={employer.official_website_url}
          required
        />
      </label>
      <label>
        Identity
        <select
          name="identity_status"
          value={status}
          onChange={(event) =>
            setStatus(event.currentTarget.value as IdentityStatus)
          }
        >
          <option value="not_checked">Not checked</option>
          <option value="checked">Checked</option>
          <option value="disputed">Disputed</option>
        </select>
      </label>
      {status !== "not_checked" && (
        <label>
          Public record checked
          <input
            name="identity_source_url"
            type="url"
            defaultValue={employer.identity_source_url || ""}
            required
          />
        </label>
      )}
      <p className="portal-span portal-hint">
        {status === "disputed"
          ? "Saving a dispute pauses this employer's published vacancies."
          : "Checked means the legal name and website match a cited independent public record."}
      </p>
      <div className="portal-actions portal-span">
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" disabled={pending}>
          Save employer
        </button>
      </div>
    </form>
  );
}

function nullable(form: FormData, name: string) {
  const value = String(form.get(name) || "").trim();
  return value || null;
}

function listingPayload(form: FormData) {
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

export function ProviderWorkspace() {
  const access = usePortalAccess("provider");
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [listings, setListings] = useState<PortalListing[]>([]);
  const [editing, setEditing] = useState<PortalListing | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const restoredDraft = useRef(false);

  const ready = access.state === "ready";
  const load = useCallback(async () => {
    try {
      const [employerResult, listingResult] = await Promise.all([
        portalFetch("portal/employers"),
        portalFetch("provider/listings"),
      ]);
      setEmployers(employerResult.items);
      setListings(listingResult.items);
    } catch (reason) {
      setError(reasonText(reason));
    }
  }, []);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  useEffect(() => {
    if (
      !ready ||
      employers.length === 0 ||
      restoredDraft.current ||
      !formRef.current
    )
      return;
    try {
      const saved = JSON.parse(
        sessionStorage.getItem("iter-provider-offer-draft") || "null",
      ) as { editingId?: string; fields?: Record<string, string> } | null;
      if (!saved?.fields) return;
      if (saved.editingId) {
        const listing = listings.find((item) => item.id === saved.editingId);
        if (!listing) return;
        setEditing(listing);
      }
      restoredDraft.current = true;
      requestAnimationFrame(() => {
        const form = formRef.current;
        if (!form) return;
        for (const [name, value] of Object.entries(saved.fields || {})) {
          const control = form.elements.namedItem(name);
          if (
            control instanceof HTMLInputElement ||
            control instanceof HTMLSelectElement ||
            control instanceof HTMLTextAreaElement
          ) {
            control.value = value;
          }
        }
        setMessage("Unsaved offer restored.");
      });
    } catch {
      sessionStorage.removeItem("iter-provider-offer-draft");
    }
  }, [ready, employers, listings]);

  function rememberDraft(form: HTMLFormElement) {
    const fields = Object.fromEntries(
      [...new FormData(form).entries()].map(([name, value]) => [
        name,
        String(value),
      ]),
    );
    sessionStorage.setItem(
      "iter-provider-offer-draft",
      JSON.stringify({ editingId: editing?.id, fields }),
    );
  }

  function discardDraft() {
    sessionStorage.removeItem("iter-provider-offer-draft");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    setMessage("");
    const content = listingPayload(new FormData(form));
    try {
      if (editing) {
        await portalFetch(`provider/listings/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify({ expected_version: editing.version, content }),
        });
        setMessage("Draft updated.");
      } else {
        await portalFetch("provider/listings", {
          method: "POST",
          body: JSON.stringify(content),
        });
        setMessage("Draft created.");
      }
      setEditing(null);
      discardDraft();
      form.reset();
      await load();
    } catch (reason) {
      setError(reasonText(reason));
    }
  }

  async function act(listing: PortalListing, action: "submit" | "close") {
    setError("");
    setMessage("");
    try {
      await portalFetch(`provider/listings/${listing.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ expected_version: listing.version }),
      });
      setMessage(
        action === "submit" ? "Offer submitted for review." : "Offer closed.",
      );
      await load();
    } catch (reason) {
      setError(reasonText(reason));
    }
  }

  if (access.state !== "ready")
    return <AccessNotice access={access} openLink={null} expected="provider" />;
  return (
    <div className="portal-page">
      <PortalHeader
        title="Provider workspace"
        label={access.identity.organization_name || "Provider"}
      />
      <p className="portal-company-profile">
        {access.identity.organization_address}
        {access.identity.organization_website_url && (
          <>
            {" · "}
            <a
              href={access.identity.organization_website_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Company website
            </a>
          </>
        )}
      </p>
      {message && (
        <p className="portal-notice" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <section className="portal-panel">
        <h2>{editing ? "Edit draft" : "Create an offer"}</h2>
        <p>
          Offers remain private until an iter operator checks the source and
          publishes them.
        </p>
        <form
          className="portal-form"
          onSubmit={save}
          onInput={(event) => rememberDraft(event.currentTarget)}
          ref={formRef}
          key={editing?.id || "new"}
        >
          <fieldset className="portal-form-section portal-form-grid">
            <legend>Offer basics</legend>
            <label>
              Employer
              <select
                name="employer_id"
                defaultValue={editing?.employer_id}
                required
              >
                <option value="">Select employer</option>
                {employers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.legal_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Internal reference
              <input
                name="source_identifier"
                defaultValue={editing?.source_identifier}
                required
                maxLength={120}
              />
            </label>
            <label>
              Season
              <input
                name="season_year"
                type="number"
                min="2020"
                max="2100"
                defaultValue={
                  editing?.season_year || new Date().getFullYear() + 1
                }
                required
              />
            </label>
            <label>
              Role
              <input
                name="role"
                defaultValue={editing?.role}
                required
                maxLength={160}
              />
            </label>
            <label>
              State
              <input
                name="state"
                defaultValue={editing?.state}
                required
                maxLength={80}
              />
            </label>
            <label>
              City
              <input
                name="city"
                defaultValue={editing?.city}
                required
                maxLength={120}
              />
            </label>
            <label>
              Time zone
              <input
                name="location_timezone"
                defaultValue={editing?.location_timezone || "America/New_York"}
                required
              />
            </label>
            <label>
              Job type
              <input
                name="category"
                defaultValue={editing?.category}
                required
                maxLength={80}
              />
            </label>
            <label className="portal-span">
              Duties
              <textarea
                name="duties"
                defaultValue={editing?.duties || ""}
                maxLength={2000}
              />
            </label>
          </fieldset>
          <fieldset className="portal-form-section portal-form-grid">
            <legend>Source and contact</legend>
            <label className="portal-span">
              Official job source
              <input
                name="official_source_url"
                type="url"
                defaultValue={editing?.official_source_url}
                required
              />
            </label>
            <label className="portal-span">
              Application or contact link
              <input
                name="contact_url"
                type="url"
                defaultValue={editing?.contact_url}
                required
              />
            </label>
          </fieldset>
          <fieldset className="portal-form-section portal-form-grid">
            <legend>Dates and pay</legend>
            <label>
              Start date
              <input
                name="work_start_date"
                type="date"
                defaultValue={editing?.work_start_date || ""}
              />
            </label>
            <label>
              End date
              <input
                name="work_end_date"
                type="date"
                defaultValue={editing?.work_end_date || ""}
              />
            </label>
            <label>
              Pay amount
              <input
                name="wage_amount"
                type="number"
                min="0"
                step="0.01"
                defaultValue={editing?.wage_amount || ""}
              />
            </label>
            <label>
              Pay currency
              <input
                name="wage_currency"
                defaultValue={editing?.wage_currency || "USD"}
                maxLength={3}
              />
            </label>
            <label>
              Pay basis
              <select
                name="wage_basis"
                defaultValue={editing?.wage_basis || "hour"}
              >
                <option value="hour">Hour</option>
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
              </select>
            </label>
            <label>
              Hours per week
              <input
                name="expected_hours_per_week"
                type="number"
                min="0"
                max="168"
                step="0.25"
                defaultValue={editing?.expected_hours_per_week || ""}
              />
            </label>
          </fieldset>
          <fieldset className="portal-form-section portal-form-grid">
            <legend>Housing and transport</legend>
            <label className="portal-span">
              Housing details
              <textarea
                name="housing_description"
                defaultValue={editing?.housing_description || ""}
                maxLength={2000}
              />
            </label>
            <label>
              Housing cost
              <input
                name="housing_cost_amount"
                type="number"
                min="0"
                step="0.01"
                defaultValue={editing?.housing_cost_amount || ""}
              />
            </label>
            <label>
              Housing currency
              <input
                name="housing_cost_currency"
                defaultValue={editing?.housing_cost_currency || "USD"}
                maxLength={3}
              />
            </label>
            <label>
              Housing basis
              <select
                name="housing_cost_basis"
                defaultValue={editing?.housing_cost_basis || "week"}
              >
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="season">Season</option>
              </select>
            </label>
            <label className="portal-span">
              Transport details
              <textarea
                name="transport_description"
                defaultValue={editing?.transport_description || ""}
                maxLength={2000}
              />
            </label>
          </fieldset>
          <div className="portal-actions portal-span">
            <button type="submit">
              {editing ? "Save changes" : "Create draft"}
            </button>
            {editing && (
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  discardDraft();
                  setEditing(null);
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>
      <section className="portal-panel">
        <h2>My offers</h2>
        <div className="portal-list">
          {listings.map((listing) => (
            <article key={listing.id} className="portal-item">
              <div>
                <span className="status-chip">
                  {listing.submission_status.replace("_", " ")}
                </span>
                <h3>{listing.role}</h3>
                <p>
                  {listing.city}, {listing.state} · {listing.status}
                </p>
                {listing.submission_note && (
                  <p className="form-error">
                    Requested change: {listing.submission_note}
                  </p>
                )}
              </div>
              <div className="portal-actions">
                {listing.status === "draft" &&
                  listing.submission_status !== "pending" && (
                    <>
                      <button
                        className="button-secondary"
                        onClick={() => {
                          discardDraft();
                          setEditing(listing);
                        }}
                      >
                        Edit
                      </button>
                      <button onClick={() => act(listing, "submit")}>
                        Submit for review
                      </button>
                    </>
                  )}
                {["published", "paused", "expired"].includes(
                  listing.status,
                ) && (
                  <button
                    className="button-danger"
                    onClick={() => act(listing, "close")}
                  >
                    Close offer
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export function OperatorConsole({ openLink }: { openLink: string | null }) {
  const access = usePortalAccess("operator");
  const [activeSection, setActiveSection] =
    useState<OperatorSection>("offer-review");
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [submissions, setSubmissions] = useState<PortalListing[]>([]);
  const [reviews, setReviews] = useState<ModerationReview[]>([]);
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [reviewCursor, setReviewCursor] = useState<string | null>(null);
  const [reportCursor, setReportCursor] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [editingEmployer, setEditingEmployer] = useState<string | null>(null);
  const [editingOrganization, setEditingOrganization] = useState<string | null>(
    null,
  );
  const [confirmingKeyId, setConfirmingKeyId] = useState<string | null>(null);
  const [confirmingStatusId, setConfirmingStatusId] = useState<string | null>(
    null,
  );
  const [issuedKey, setIssuedKey] = useState<IssuedAccessKey | null>(null);
  const [keyCopyStatus, setKeyCopyStatus] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const keyPanelRef = useRef<HTMLDivElement>(null);

  const ready = access.state === "ready";
  const load = useCallback(async () => {
    try {
      const [
        employerResult,
        queue,
        reviewQueue,
        reportQueue,
        organizationList,
      ] = await Promise.all([
        portalFetch("portal/employers"),
        portalFetch("portal/submissions"),
        portalFetch("admin/reviews"),
        portalFetch("admin/reports"),
        portalFetch("admin/organizations"),
      ]);
      setEmployers(employerResult.items);
      setSubmissions(queue.items);
      setReviews(reviewQueue.items);
      setReports(reportQueue.items);
      setReviewCursor(reviewQueue.next_cursor);
      setReportCursor(reportQueue.next_cursor);
      setOrganizations(organizationList.items);
      return true;
    } catch (reason) {
      setError(reasonText(reason));
      return false;
    }
  }, []);

  async function loadMoreQueue(kind: "reviews" | "reports", cursor: string) {
    setError("");
    try {
      const result = await portalFetch(
        `admin/${kind}?cursor=${encodeURIComponent(cursor)}`,
      );
      if (kind === "reviews") {
        setReviews((current) => [...current, ...result.items]);
        setReviewCursor(result.next_cursor);
      } else {
        setReports((current) => [...current, ...result.items]);
        setReportCursor(result.next_cursor);
      }
    } catch (reason) {
      setError(reasonText(reason));
    }
  }
  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);
  useEffect(() => {
    const hash = window.location.hash.slice(1) as OperatorSection;
    if (
      [
        "offer-review",
        "experience-review",
        "issue-reports",
        "employers",
        "companies",
      ].includes(hash)
    ) {
      setActiveSection(hash);
    }
  }, []);
  useEffect(() => {
    if (!issuedKey) return;
    setKeyCopyStatus("");
    keyPanelRef.current?.focus();
  }, [issuedKey]);

  async function run(work: () => Promise<unknown>, done: string) {
    setError("");
    setMessage("");
    try {
      await work();
      setMessage(done);
      await load();
      return true;
    } catch (reason) {
      setError(reasonText(reason));
      return false;
    }
  }

  function decide(listing: PortalListing, decision: string, note: string) {
    return run(
      () =>
        portalFetch(`portal/submissions/${listing.id}/${decision}`, {
          method: "POST",
          body: JSON.stringify({ expected_version: listing.version, note }),
        }),
      decision === "approve" ? "Offer published." : "Changes requested.",
    );
  }

  function moderate(
    kind: "reviews" | "reports",
    item: ModerationReview | ModerationReport,
    decision: string,
    reason: string,
  ) {
    return run(
      () =>
        portalFetch(`admin/${kind}/${item.id}/${decision}`, {
          method: "POST",
          body: JSON.stringify({ expected_version: item.version, reason }),
        }),
      "Decision recorded.",
    );
  }

  function createEmployer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run(
      () =>
        portalFetch("admin/employers", {
          method: "POST",
          body: JSON.stringify({
            legal_name: String(data.get("legal_name") || "").trim(),
            official_website_url: String(
              data.get("official_website_url") || "",
            ).trim(),
          }),
        }),
      "Employer added.",
    ).then((done) => done && form.reset());
  }

  function saveEmployer(employer: Employer, data: FormData) {
    const status = String(data.get("identity_status")) as IdentityStatus;
    return run(
      () =>
        portalFetch(`admin/employers/${employer.id}`, {
          method: "PUT",
          body: JSON.stringify({
            expected_version: employer.version,
            legal_name: String(data.get("legal_name") || "").trim(),
            official_website_url: String(
              data.get("official_website_url") || "",
            ).trim(),
            identity_status: status,
            identity_source_url:
              status === "not_checked"
                ? null
                : String(data.get("identity_source_url") || "").trim(),
          }),
        }),
      status === "disputed"
        ? "Employer marked disputed. Its published vacancies are paused."
        : "Employer updated.",
    );
  }

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setError("");
    setMessage("");
    try {
      const organization = await portalFetch("admin/organizations", {
        method: "POST",
        body: JSON.stringify({
          name: String(data.get("name") || "").trim(),
          website_url: String(data.get("website_url") || "").trim(),
          address: String(data.get("address") || "").trim(),
        }),
      });
      setIssuedKey({
        organizationName: organization.name,
        accessKey: organization.access_key,
      });
      setMessage("Company profile created.");
      form.reset();
      await load();
    } catch (reason) {
      setError(reasonText(reason));
    }
  }

  function saveOrganization(organization: Organization, data: FormData) {
    return run(
      () =>
        portalFetch(`admin/organizations/${organization.id}`, {
          method: "PUT",
          body: JSON.stringify({
            expected_version: organization.version,
            name: String(data.get("name") || "").trim(),
            website_url: String(data.get("website_url") || "").trim(),
            address: String(data.get("address") || "").trim(),
          }),
        }),
      "Company profile updated.",
    ).then((done) => {
      if (done) setEditingOrganization(null);
      return done;
    });
  }

  async function rotateAccessKey(organization: Organization) {
    setError("");
    setMessage("");
    try {
      const result = await portalFetch(
        `admin/organizations/${organization.id}/access-key`,
        {
          method: "POST",
          body: JSON.stringify({ expected_version: organization.version }),
        },
      );
      setIssuedKey({
        organizationName: organization.name,
        accessKey: result.access_key,
      });
      setConfirmingKeyId(null);
      setMessage(
        organization.access_key_hint
          ? "Access key replaced. Existing company sessions were signed out."
          : "Access key created.",
      );
      await load();
    } catch (reason) {
      setError(reasonText(reason));
    }
  }

  function changeOrganizationStatus(organization: Organization) {
    const status = organization.status === "active" ? "suspended" : "active";
    return run(
      () =>
        portalFetch(`admin/organizations/${organization.id}/status`, {
          method: "POST",
          body: JSON.stringify({
            expected_version: organization.version,
            status,
            reason:
              status === "suspended"
                ? "operator suspended company access"
                : "operator restored company access",
          }),
        }),
      status === "suspended"
        ? "Company suspended. Existing sessions were signed out."
        : "Company access restored.",
    ).then((done) => {
      if (done) setConfirmingStatusId(null);
      return done;
    });
  }

  async function refresh() {
    setRefreshing(true);
    setMessage("");
    setError("");
    const loaded = await load();
    setRefreshing(false);
    if (loaded) setMessage("Workspace refreshed.");
  }

  function showSection(section: OperatorSection) {
    setActiveSection(section);
    window.history.replaceState(null, "", `#${section}`);
    document
      .getElementById("operator-workspace")
      ?.focus({ preventScroll: true });
  }

  if (access.state !== "ready")
    return (
      <AccessNotice access={access} openLink={openLink} expected="operator" />
    );
  const employerName = (id: string) =>
    employers.find((item) => item.id === id)?.legal_name || "Unknown employer";
  const sectionLinks: Array<{
    id: OperatorSection;
    label: string;
    count?: number;
  }> = [
    { id: "offer-review", label: "Offers", count: submissions.length },
    {
      id: "experience-review",
      label: "Experiences",
      count: reviews.length,
    },
    { id: "issue-reports", label: "Reports", count: reports.length },
    { id: "employers", label: "Employers" },
    { id: "companies", label: "Companies" },
  ];
  return (
    <div className="portal-page">
      <div className="portal-heading portal-heading-admin">
        <div>
          <p className="portal-kicker">iter operator</p>
          <h1>Operator console</h1>
        </div>
        <button
          type="button"
          className="button-secondary portal-refresh"
          onClick={() => void refresh()}
          disabled={refreshing}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {message && (
        <p className="portal-notice" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="operator-layout">
        <nav className="portal-section-nav" aria-label="Operator sections">
          <div className="operator-sidebar-brand">
            <span className="brand-initial">i</span>ter
            <small>Operator console</small>
          </div>
          <p className="portal-nav-label">Review</p>
          {sectionLinks.slice(0, 3).map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              aria-current={activeSection === section.id ? "page" : undefined}
              onClick={(event) => {
                event.preventDefault();
                showSection(section.id);
              }}
            >
              <span>{section.label}</span>
              <strong aria-label={`${section.count} pending`}>
                {section.count}
              </strong>
            </a>
          ))}
          <p className="portal-nav-label">Directory</p>
          {sectionLinks.slice(3).map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              aria-current={activeSection === section.id ? "page" : undefined}
              onClick={(event) => {
                event.preventDefault();
                showSection(section.id);
              }}
            >
              <span>{section.label}</span>
            </a>
          ))}
          <a className="operator-sidebar-back" href="/">
            ← Back to vacancies
          </a>
        </nav>
        <div
          className="operator-workspace"
          id="operator-workspace"
          tabIndex={-1}
        >
          {activeSection === "offer-review" && (
            <section className="portal-panel" id="offer-review">
              <h2>Offers awaiting review</h2>
              <p>
                Check the employer-controlled source and every field before
                publishing.
              </p>
              <div className="portal-list">
                {submissions.length === 0 && (
                  <p className="portal-empty">No pending offers.</p>
                )}
                {submissions.map((listing) => (
                  <article
                    key={listing.id}
                    className="portal-item portal-review"
                  >
                    <div>
                      <span className="status-chip">pending</span>
                      <h3>{listing.role}</h3>
                      <p>
                        {employerName(listing.employer_id)} · {listing.city},{" "}
                        {listing.state} · Season {listing.season_year}
                      </p>
                      <a
                        href={listing.official_source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Check official source
                      </a>
                    </div>
                    <DecisionActions
                      decisions={[
                        {
                          key: "changes",
                          label: "Request changes",
                          prompt: "What must the provider change?",
                        },
                        {
                          key: "approve",
                          label: "Approve and publish",
                          prompt: "What source evidence did you check?",
                          primary: true,
                        },
                      ]}
                      onDecide={(key, note) => decide(listing, key, note)}
                    />
                  </article>
                ))}
              </div>
            </section>
          )}
          {activeSection === "experience-review" && (
            <section className="portal-panel" id="experience-review">
              <h2>Experiences awaiting moderation</h2>
              <div className="portal-list">
                {reviews.length === 0 && (
                  <p className="portal-empty">No pending experiences.</p>
                )}
                {reviews.map((review) => (
                  <article
                    key={review.id}
                    className="portal-item portal-review"
                  >
                    <div>
                      <span className="status-chip">pending</span>
                      <h3>{review.role}</h3>
                      <p>Season {review.season_year}</p>
                      {review.text && <p>{review.text}</p>}
                    </div>
                    <DecisionActions
                      decisions={[
                        {
                          key: "reject",
                          label: "Reject",
                          prompt: reasonPrompt,
                        },
                        {
                          key: "approve",
                          label: "Approve",
                          prompt: reasonPrompt,
                          primary: true,
                        },
                      ]}
                      onDecide={(key, note) =>
                        moderate("reviews", review, key, note)
                      }
                    />
                  </article>
                ))}
              </div>
              {reviewCursor && (
                <button
                  type="button"
                  className="button-secondary portal-load-more"
                  onClick={() => void loadMoreQueue("reviews", reviewCursor)}
                >
                  Load more experiences
                </button>
              )}
            </section>
          )}
          {activeSection === "issue-reports" && (
            <section className="portal-panel" id="issue-reports">
              <h2>Issue reports</h2>
              <div className="portal-list">
                {reports.length === 0 && (
                  <p className="portal-empty">No pending reports.</p>
                )}
                {reports.map((report) => (
                  <article
                    key={report.id}
                    className="portal-item portal-review"
                  >
                    <div>
                      <span className="status-chip">{report.item_type}</span>
                      <h3>{report.reason.replaceAll("_", " ")}</h3>
                      <p>Item {report.item_id}</p>
                      {report.explanation && <p>{report.explanation}</p>}
                    </div>
                    <DecisionActions
                      decisions={[
                        {
                          key: "dismiss",
                          label: "Dismiss",
                          prompt: reasonPrompt,
                        },
                        {
                          key: "resolve",
                          label: "Resolve",
                          prompt: reasonPrompt,
                          primary: true,
                        },
                      ]}
                      onDecide={(key, note) =>
                        moderate("reports", report, key, note)
                      }
                    />
                  </article>
                ))}
              </div>
              {reportCursor && (
                <button
                  type="button"
                  className="button-secondary portal-load-more"
                  onClick={() => void loadMoreQueue("reports", reportCursor)}
                >
                  Load more reports
                </button>
              )}
            </section>
          )}
          {activeSection === "employers" && (
            <section className="portal-panel" id="employers">
              <h2>Employers</h2>
              <p>
                Providers choose the US employer for each offer from this list.
                Add the legal name and the employer&apos;s own website, then
                record the identity check.
              </p>
              <form
                className="portal-form portal-form-grid"
                onSubmit={createEmployer}
              >
                <label>
                  Legal name
                  <input name="legal_name" required maxLength={160} />
                </label>
                <label>
                  Official website
                  <input
                    name="official_website_url"
                    type="url"
                    placeholder="https://"
                    required
                  />
                </label>
                <div className="portal-actions portal-span">
                  <button type="submit">Add employer</button>
                </div>
              </form>
              <div className="portal-list">
                {employers.length === 0 && <p>No employers yet.</p>}
                {employers.map((employer) => (
                  <article
                    key={employer.id}
                    className="portal-item portal-employer"
                  >
                    {editingEmployer === employer.id ? (
                      <EmployerEditor
                        employer={employer}
                        onSave={saveEmployer}
                        onCancel={() => setEditingEmployer(null)}
                      />
                    ) : (
                      <>
                        <div>
                          <span
                            className="status-chip"
                            data-identity={employer.identity_status}
                          >
                            {identityLabels[employer.identity_status]}
                          </span>
                          <h3>{employer.legal_name}</h3>
                          <p className="portal-url">
                            {employer.official_website_url}
                          </p>
                        </div>
                        <div className="portal-actions">
                          <button
                            type="button"
                            className="button-secondary"
                            aria-label={`Edit ${employer.legal_name}`}
                            onClick={() => setEditingEmployer(employer.id)}
                          >
                            Edit
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
          {activeSection === "companies" && (
            <section className="portal-panel" id="companies">
              <h2>Companies</h2>
              <p>
                Create the company profile first. A private access key is
                generated automatically so the company can manage its offers in
                any browser.
              </p>
              {issuedKey && (
                <div
                  className="portal-key"
                  role="region"
                  aria-label="New company access key"
                  tabIndex={-1}
                  ref={keyPanelRef}
                >
                  <div>
                    <strong>Access key for {issuedKey.organizationName}</strong>
                    <p>Copy it now. The full key will not be shown again.</p>
                  </div>
                  <code>{issuedKey.accessKey}</code>
                  <div className="portal-actions">
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(issuedKey.accessKey)
                          .then(
                            () => setKeyCopyStatus("Copied"),
                            () =>
                              setError(
                                "Could not copy. Select the key and copy it manually.",
                              ),
                          );
                      }}
                    >
                      {keyCopyStatus || "Copy key"}
                    </button>
                    <span className="portal-hint" aria-live="polite">
                      {keyCopyStatus && "Access key copied."}
                    </span>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => setIssuedKey(null)}
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
              <form
                className="portal-form portal-form-grid"
                onSubmit={createOrganization}
              >
                <label>
                  Company name
                  <input name="name" required maxLength={160} />
                </label>
                <label>
                  Company website
                  <input
                    name="website_url"
                    type="url"
                    placeholder="https://"
                    required
                  />
                </label>
                <label className="portal-span">
                  Business address
                  <textarea name="address" required maxLength={300} rows={2} />
                </label>
                <div className="portal-actions portal-span">
                  <button type="submit">Create company and access key</button>
                </div>
              </form>
              <div className="portal-list">
                {organizations.length === 0 && <p>No companies yet.</p>}
                {organizations.map((organization) => (
                  <article key={organization.id} className="portal-item">
                    {editingOrganization === organization.id ? (
                      <form
                        className="portal-form portal-form-grid portal-span"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void saveOrganization(
                            organization,
                            new FormData(event.currentTarget),
                          );
                        }}
                      >
                        <label>
                          Company name
                          <input
                            name="name"
                            defaultValue={organization.name}
                            required
                            maxLength={160}
                          />
                        </label>
                        <label>
                          Company website
                          <input
                            name="website_url"
                            type="url"
                            defaultValue={organization.website_url || ""}
                            required
                          />
                        </label>
                        <label className="portal-span">
                          Business address
                          <textarea
                            name="address"
                            defaultValue={organization.address || ""}
                            required
                            maxLength={300}
                            rows={2}
                          />
                        </label>
                        <div className="portal-actions portal-span">
                          <button type="submit">Save company</button>
                          <button
                            type="button"
                            className="button-secondary"
                            onClick={() => setEditingOrganization(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div>
                          <span className="status-chip">
                            {organization.status}
                          </span>
                          <h3>{organization.name}</h3>
                          <p>
                            {organization.address || "Business address needed"}
                          </p>
                          {organization.website_url ? (
                            <a
                              href={organization.website_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {organization.website_url}
                            </a>
                          ) : (
                            <p className="form-error">Company website needed</p>
                          )}
                          <p className="portal-hint">
                            {organization.access_key_hint
                              ? `Access key active · ends in ${organization.access_key_hint}`
                              : "No access key issued"}
                          </p>
                        </div>
                        <div className="portal-actions">
                          <button
                            type="button"
                            className="button-secondary"
                            onClick={() =>
                              setEditingOrganization(organization.id)
                            }
                          >
                            Edit profile
                          </button>
                          {confirmingKeyId === organization.id ? (
                            <>
                              <button
                                type="button"
                                className="button-danger"
                                onClick={() =>
                                  void rotateAccessKey(organization)
                                }
                              >
                                Confirm replacement
                              </button>
                              <button
                                type="button"
                                className="button-secondary"
                                onClick={() => setConfirmingKeyId(null)}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="button-secondary"
                              onClick={() =>
                                setConfirmingKeyId(organization.id)
                              }
                            >
                              {organization.access_key_hint
                                ? "Replace access key"
                                : "Create access key"}
                            </button>
                          )}
                          {organization.status === "active" &&
                          confirmingStatusId === organization.id ? (
                            <>
                              <button
                                type="button"
                                className="button-danger"
                                onClick={() =>
                                  void changeOrganizationStatus(organization)
                                }
                              >
                                Confirm suspension
                              </button>
                              <button
                                type="button"
                                className="button-secondary"
                                onClick={() => setConfirmingStatusId(null)}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className={
                                organization.status === "active"
                                  ? "button-danger"
                                  : "button-secondary"
                              }
                              onClick={() =>
                                organization.status === "active"
                                  ? setConfirmingStatusId(organization.id)
                                  : void changeOrganizationStatus(organization)
                              }
                            >
                              {organization.status === "active"
                                ? "Suspend access"
                                : "Restore access"}
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

const reasonPrompt = "Record the reason for this decision.";
