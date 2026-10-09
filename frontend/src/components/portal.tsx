"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ListingFields } from "@/components/listing-fields";
import { CompaniesSection } from "@/components/operator-companies";
import { VacanciesSection } from "@/components/operator-vacancies";
import {
  identityLabels,
  listingPayload,
  PortalAccessError,
  portalFetch,
  reasonText,
  type Employer,
  type IdentityStatus,
  type ModerationReport,
  type ModerationReview,
  type OperatorSection,
  type Organization,
  type PortalIdentity,
  type PortalListing,
  type Role,
} from "@/lib/portal-client";

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
          <ListingFields
            listing={editing}
            employers={employers}
            idPrefix="provider"
          />
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
  const [vacancyCompany, setVacancyCompany] = useState("");
  const [createVacancyFor, setCreateVacancyFor] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

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
    if (sectionIds.includes(hash)) setActiveSection(hash);
  }, []);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 5000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const notify = useCallback((text: string) => {
    setError("");
    setMessage(text);
  }, []);
  const clearCreateVacancy = useCallback(() => setCreateVacancyFor(null), []);

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
    { id: "vacancies", label: "Vacancies" },
    { id: "employers", label: "Employers" },
    { id: "companies", label: "Companies" },
  ];
  const navLink = (section: (typeof sectionLinks)[number]) => (
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
      {section.count !== undefined && (
        <strong aria-label={`${section.count} pending`}>{section.count}</strong>
      )}
    </a>
  );
  return (
    <div className="portal-page operator-page">
      <div className="operator-head">
        <h1>Operator console</h1>
        <button
          type="button"
          className="button-secondary portal-refresh"
          onClick={() => void refresh()}
          disabled={refreshing}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <div className="operator-layout">
        <nav className="portal-section-nav" aria-label="Operator sections">
          <p className="portal-nav-label">Review</p>
          {sectionLinks.slice(0, 3).map(navLink)}
          <p className="portal-nav-label">Directory</p>
          {sectionLinks.slice(3).map(navLink)}
          <a className="operator-sidebar-back" href="/">
            Back to vacancies
          </a>
        </nav>
        <div
          className="operator-workspace"
          id="operator-workspace"
          tabIndex={-1}
        >
          {error && (
            <p className="form-error operator-error" role="alert">
              {error}
              <button
                type="button"
                className="text-action"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                Dismiss
              </button>
            </p>
          )}
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
          {activeSection === "vacancies" && (
            <VacanciesSection
              employers={employers}
              organizations={organizations}
              company={vacancyCompany}
              onCompanyChange={setVacancyCompany}
              createFor={createVacancyFor}
              onCreateHandled={clearCreateVacancy}
              onOpenReview={() => showSection("offer-review")}
              notify={notify}
              onChanged={() => void load()}
            />
          )}
          {activeSection === "companies" && (
            <CompaniesSection
              organizations={organizations}
              notify={notify}
              onChanged={load}
              onShowVacancies={(organizationId) => {
                setVacancyCompany(organizationId);
                showSection("vacancies");
              }}
              onCreateVacancy={(organizationId) => {
                setVacancyCompany(organizationId);
                setCreateVacancyFor(organizationId);
                showSection("vacancies");
              }}
            />
          )}
        </div>
      </div>
      <p
        className="operator-toast"
        role="status"
        data-visible={message ? "" : undefined}
      >
        {message}
      </p>
    </div>
  );
}

const sectionIds: OperatorSection[] = [
  "offer-review",
  "experience-review",
  "issue-reports",
  "vacancies",
  "employers",
  "companies",
];

const reasonPrompt = "Record the reason for this decision.";
