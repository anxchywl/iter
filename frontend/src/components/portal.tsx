"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { telegramInitData, type TelegramWindow } from "@/lib/telegram";

type Role = "operator" | "provider";

type PortalIdentity = {
  telegram_user_id: number;
  role: Role | null;
  organization_name: string | null;
};

type Organization = {
  id: string;
  key: string;
  name: string;
  status: string;
  member_telegram_ids: number[];
};

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
  if (!initData) throw new PortalAccessError("outside");
  const response = await fetch(`/api/portal/${path}`, {
    ...init,
    headers: {
      Authorization: `tma ${initData}`,
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
  | { state: "loading" | "outside" | "expired" | "error" }
  | { state: "none"; telegramId: number }
  | { state: "ready"; identity: PortalIdentity };

function usePortalAccess(expected: Role): Access {
  const [access, setAccess] = useState<Access>({ state: "loading" });
  useEffect(() => {
    portalFetch("portal/me")
      .then((identity: PortalIdentity) => {
        if (!identity.role)
          setAccess({ state: "none", telegramId: identity.telegram_user_id });
        else if (identity.role !== expected)
          window.location.assign(
            identity.role === "operator" ? "/admin" : "/manage",
          );
        else setAccess({ state: "ready", identity });
      })
      .catch((reason) =>
        setAccess({
          state:
            reason instanceof PortalAccessError &&
            (reason.message === "outside" || reason.message === "expired")
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
}: {
  access: Exclude<Access, { state: "ready" }>;
  openLink: string | null;
}) {
  if (access.state === "loading")
    return <p className="portal-loading">Loading workspace…</p>;
  return (
    <section className="portal-login" aria-labelledby="portal-access-title">
      <p className="portal-kicker">Offer management</p>
      {access.state === "outside" && (
        <>
          <h1 id="portal-access-title">Open in Telegram</h1>
          <p>
            Offer management signs you in with your Telegram account, so it
            opens only inside the iter Mini App.
          </p>
          {openLink && (
            <a className="primary-button" href={openLink}>
              Open the Mini App
            </a>
          )}
        </>
      )}
      {access.state === "expired" && (
        <>
          <h1 id="portal-access-title">Sign-in expired</h1>
          <p>Close the Mini App and open it again from the bot.</p>
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
  return (
    <div className="portal-heading">
      <div>
        <p className="portal-kicker">{label}</p>
        <h1>{title}</h1>
      </div>
    </div>
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

export function ProviderWorkspace({ openLink }: { openLink: string | null }) {
  const access = usePortalAccess("provider");
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [listings, setListings] = useState<PortalListing[]>([]);
  const [editing, setEditing] = useState<PortalListing | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
    return <AccessNotice access={access} openLink={openLink} />;
  return (
    <div className="portal-page">
      <PortalHeader
        title="Provider workspace"
        label={access.identity.organization_name || "Provider"}
      />
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
          className="portal-form portal-form-grid"
          onSubmit={save}
          key={editing?.id || "new"}
        >
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
          <div className="portal-actions portal-span">
            <button type="submit">
              {editing ? "Save changes" : "Create draft"}
            </button>
            {editing && (
              <button
                type="button"
                className="button-secondary"
                onClick={() => setEditing(null)}
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
                        onClick={() => setEditing(listing)}
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
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [submissions, setSubmissions] = useState<PortalListing[]>([]);
  const [reviews, setReviews] = useState<ModerationReview[]>([]);
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [editingEmployer, setEditingEmployer] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
      setOrganizations(organizationList.items);
    } catch (reason) {
      setError(reasonText(reason));
    }
  }, []);
  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

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

  function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run(
      () =>
        portalFetch("admin/organizations", {
          method: "POST",
          body: JSON.stringify({
            name: String(data.get("name") || "").trim(),
            key: String(data.get("key") || "").trim(),
          }),
        }),
      "Organization added.",
    ).then((done) => done && form.reset());
  }

  function addMember(
    organization: Organization,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const id = Number(new FormData(form).get("telegram_user_id"));
    void run(
      () =>
        portalFetch(`admin/organizations/${organization.key}/members`, {
          method: "POST",
          body: JSON.stringify({ telegram_user_id: id }),
        }),
      "Member added.",
    ).then((done) => done && form.reset());
  }

  function removeMember(organization: Organization, id: number) {
    void run(
      () =>
        portalFetch(`admin/organizations/${organization.key}/members/${id}`, {
          method: "DELETE",
        }),
      "Member removed.",
    );
  }

  if (access.state !== "ready")
    return <AccessNotice access={access} openLink={openLink} />;
  const employerName = (id: string) =>
    employers.find((item) => item.id === id)?.legal_name || "Unknown employer";
  return (
    <div className="portal-page">
      <PortalHeader title="Operator console" label="iter operator" />
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
        <h2>Offers awaiting review</h2>
        <p>
          Check the employer-controlled source and every field before
          publishing.
        </p>
        <div className="portal-list">
          {submissions.length === 0 && <p>No pending offers.</p>}
          {submissions.map((listing) => (
            <article key={listing.id} className="portal-item portal-review">
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
      <section className="portal-panel">
        <h2>Experiences awaiting moderation</h2>
        <div className="portal-list">
          {reviews.length === 0 && <p>No pending experiences.</p>}
          {reviews.map((review) => (
            <article key={review.id} className="portal-item portal-review">
              <div>
                <span className="status-chip">pending</span>
                <h3>{review.role}</h3>
                <p>Season {review.season_year}</p>
                {review.text && <p>{review.text}</p>}
              </div>
              <DecisionActions
                decisions={[
                  { key: "reject", label: "Reject", prompt: reasonPrompt },
                  {
                    key: "approve",
                    label: "Approve",
                    prompt: reasonPrompt,
                    primary: true,
                  },
                ]}
                onDecide={(key, note) => moderate("reviews", review, key, note)}
              />
            </article>
          ))}
        </div>
      </section>
      <section className="portal-panel">
        <h2>Issue reports</h2>
        <div className="portal-list">
          {reports.length === 0 && <p>No pending reports.</p>}
          {reports.map((report) => (
            <article key={report.id} className="portal-item portal-review">
              <div>
                <span className="status-chip">{report.item_type}</span>
                <h3>{report.reason.replaceAll("_", " ")}</h3>
                <p>Item {report.item_id}</p>
                {report.explanation && <p>{report.explanation}</p>}
              </div>
              <DecisionActions
                decisions={[
                  { key: "dismiss", label: "Dismiss", prompt: reasonPrompt },
                  {
                    key: "resolve",
                    label: "Resolve",
                    prompt: reasonPrompt,
                    primary: true,
                  },
                ]}
                onDecide={(key, note) => moderate("reports", report, key, note)}
              />
            </article>
          ))}
        </div>
      </section>
      <section className="portal-panel">
        <h2>Employers</h2>
        <p>
          Providers choose the US employer for each offer from this list. Add
          the legal name and the employer&apos;s own website, then record the
          identity check.
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
            <article key={employer.id} className="portal-item portal-employer">
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
      <section className="portal-panel">
        <h2>Provider organizations</h2>
        <p>
          A provider sees a Telegram ID when they open the workspace without
          access. Add it to their organization. Removing a member ends their
          access immediately.
        </p>
        <form
          className="portal-form portal-form-grid"
          onSubmit={createOrganization}
        >
          <label>
            Organization name
            <input name="name" required maxLength={160} />
          </label>
          <label>
            Short key
            <input
              name="key"
              required
              maxLength={80}
              pattern="[a-z0-9][a-z0-9\-]*"
              title="Lowercase letters, digits, and hyphens"
            />
          </label>
          <div className="portal-actions portal-span">
            <button type="submit">Add organization</button>
          </div>
        </form>
        <div className="portal-list">
          {organizations.map((organization) => (
            <article key={organization.id} className="portal-item">
              <div>
                <span className="status-chip">{organization.status}</span>
                <h3>{organization.name}</h3>
                <p>{organization.key}</p>
                <ul className="portal-members">
                  {organization.member_telegram_ids.map((id) => (
                    <li key={id}>
                      <span>Telegram ID {id}</span>
                      <button
                        type="button"
                        className="button-danger"
                        onClick={() => removeMember(organization, id)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <form
                className="portal-form portal-member-form"
                onSubmit={(event) => addMember(organization, event)}
              >
                <label>
                  Member Telegram ID
                  <input
                    name="telegram_user_id"
                    inputMode="numeric"
                    pattern="[1-9][0-9]{0,15}"
                    required
                  />
                </label>
                <button type="submit">Add member</button>
              </form>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

const reasonPrompt = "Record the reason for this decision.";
