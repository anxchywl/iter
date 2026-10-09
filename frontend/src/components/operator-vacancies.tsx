"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ListingFields } from "@/components/listing-fields";
import { Sheet, useSheet } from "@/components/sheet";
import {
  isConflict,
  listingErrors,
  listingPayload,
  listingStateLabels,
  portalFetch,
  reasonText,
  urlProblem,
  type AdminListing,
  type Employer,
  type FieldErrors,
  type ListingState,
  type Organization,
} from "@/lib/portal-client";

type StatusFilter = "open" | ListingState | "all";
type ActionKind = "hide" | "close" | "delete" | "republish";

const filters: Array<[StatusFilter, string]> = [
  ["open", "Open"],
  ["published", "Live"],
  ["paused", "Hidden"],
  ["expired", "Expired"],
  ["pending", "In review"],
  ["draft", "Drafts"],
  ["closed", "Closed"],
  ["all", "All"],
];

const actions: Record<
  ActionKind,
  {
    title: string;
    text: string;
    button: string;
    path: string;
    done: string;
    danger?: boolean;
  }
> = {
  hide: {
    title: "Hide vacancy",
    text: "It leaves the public list straight away. Showing it again needs a fresh confirmation.",
    button: "Hide vacancy",
    path: "pause",
    done: "Vacancy hidden.",
  },
  republish: {
    title: "Confirm and republish",
    text: "Record where you checked that the job is still open. It goes live straight away.",
    button: "Republish",
    path: "republish",
    done: "Vacancy confirmed and live again.",
  },
  close: {
    title: "Close vacancy",
    text: "Closing is permanent. A new season needs a new vacancy.",
    button: "Close vacancy",
    path: "close",
    done: "Vacancy closed.",
    danger: true,
  },
  delete: {
    title: "Delete draft",
    text: "The draft is removed for good. The audit log keeps a record of the deletion.",
    button: "Delete draft",
    path: "delete",
    done: "Draft deleted.",
    danger: true,
  },
};

function shortDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function focusFirstInvalid(form: HTMLFormElement | null) {
  requestAnimationFrame(() =>
    form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
  );
}

export function VacanciesSection({
  employers,
  organizations,
  company,
  onCompanyChange,
  createFor,
  onCreateHandled,
  onOpenReview,
  notify,
  onChanged,
}: {
  employers: Employer[];
  organizations: Organization[];
  company: string;
  onCompanyChange: (company: string) => void;
  createFor: string | null;
  onCreateHandled: () => void;
  onOpenReview: () => void;
  notify: (message: string) => void;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState<StatusFilter>("open");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<AdminListing[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<AdminListing | "new" | null>(null);
  const [presetCompany, setPresetCompany] = useState("");
  const [acting, setActing] = useState<{
    kind: ActionKind;
    listing: AdminListing;
  } | null>(null);
  const request = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useCallback(
    async (after: string | null = null) => {
      const id = ++request.current;
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ status });
      if (search) params.set("q", search);
      if (company) params.set("organization_id", company);
      if (after) params.set("cursor", after);
      try {
        const result = await portalFetch(`admin/listings?${params}`);
        if (id !== request.current) return;
        setItems((current) =>
          after
            ? [
                ...current,
                ...result.items.filter(
                  (item: AdminListing) =>
                    !current.some((known) => known.id === item.id),
                ),
              ]
            : result.items,
        );
        setCursor(result.next_cursor);
      } catch (reason) {
        if (id === request.current) setError(reasonText(reason));
      } finally {
        if (id === request.current) setLoading(false);
      }
    },
    [status, search, company],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!createFor) return;
    setPresetCompany(createFor);
    setEditing("new");
    onCreateHandled();
  }, [createFor, onCreateHandled]);

  function changed(message: string) {
    notify(message);
    onChanged();
    void load();
  }

  return (
    <section
      className="portal-panel operator-vacancies"
      id="vacancies"
      aria-labelledby="vacancies-title"
    >
      <div className="operator-panel-head">
        <div>
          <h2 id="vacancies-title">Vacancies</h2>
          <p>
            Edit, hide, republish, close, or delete vacancies from every
            company.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setPresetCompany(company);
            setEditing("new");
          }}
        >
          Add vacancy
        </button>
      </div>
      <div className="operator-filters">
        <div className="operator-chips" role="group" aria-label="Vacancy state">
          {filters.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="operator-filter-fields">
          <label>
            <span className="sr-only">Search vacancies</span>
            <input
              type="search"
              value={query}
              maxLength={80}
              placeholder="Search role, employer, company, city"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label>
            <span className="sr-only">Company</span>
            <select
              value={company}
              onChange={(event) => onCompanyChange(event.target.value)}
            >
              <option value="">All companies</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}{" "}
          <button
            type="button"
            className="text-action"
            onClick={() => void load()}
          >
            Try again
          </button>
        </p>
      )}
      <div className="portal-list" aria-busy={loading}>
        {!loading && !error && items.length === 0 && (
          <p className="portal-empty">
            {search || company || status !== "open"
              ? "No vacancies match these filters."
              : "No open vacancies yet."}
          </p>
        )}
        {items.map((listing) => (
          <VacancyRow
            key={listing.id}
            listing={listing}
            onEdit={() => setEditing(listing)}
            onAct={(kind) => setActing({ kind, listing })}
            onOpenReview={onOpenReview}
          />
        ))}
        {loading && items.length === 0 && (
          <p className="portal-empty">Loading vacancies…</p>
        )}
      </div>
      {cursor && (
        <button
          type="button"
          className="button-secondary portal-load-more"
          disabled={loading}
          onClick={() => void load(cursor)}
        >
          {loading ? "Loading…" : "Load more vacancies"}
        </button>
      )}
      <VacancyEditor
        target={editing}
        presetCompany={presetCompany}
        employers={employers}
        organizations={organizations}
        onClosed={() => setEditing(null)}
        onSaved={(message) => changed(message)}
      />
      <VacancyAction
        target={acting}
        onClosed={() => setActing(null)}
        onDone={(message) => changed(message)}
        onStale={() => void load()}
      />
    </section>
  );
}

function VacancyRow({
  listing,
  onEdit,
  onAct,
  onOpenReview,
}: {
  listing: AdminListing;
  onEdit: () => void;
  onAct: (kind: ActionKind) => void;
  onOpenReview: () => void;
}) {
  const state = listing.effective_status;
  const confirmed = shortDate(listing.last_confirmed_at);
  return (
    <article className="portal-item operator-vacancy" data-state={state}>
      <div className="operator-vacancy-main">
        <span className="status-chip" data-state={state}>
          {listingStateLabels[state]}
        </span>
        <h3>{listing.role}</h3>
        <p>
          {listing.employer_name} · {listing.city}, {listing.state} · Season{" "}
          {listing.season_year}
        </p>
        <p className="portal-hint">
          {listing.organization_name || "Added by an operator"}
          {state === "published" && confirmed && ` · Confirmed ${confirmed}`}
          {state === "expired" && " · Confirmation is older than 14 days"}
          {state === "pending" && " · Waiting in Offers review"}
          {listing.submission_status === "changes_requested" &&
            " · Changes requested from the company"}
        </p>
      </div>
      <div className="portal-actions">
        {state === "pending" && (
          <button
            type="button"
            className="button-secondary"
            onClick={onOpenReview}
          >
            Open review
          </button>
        )}
        {state !== "pending" && state !== "closed" && (
          <button
            type="button"
            className="button-secondary"
            aria-label={`Edit ${listing.role}`}
            onClick={onEdit}
          >
            Edit
          </button>
        )}
        {state === "published" && (
          <>
            <a
              className="button-secondary portal-link-button"
              href={`/jobs/${listing.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View
            </a>
            <button
              type="button"
              className="button-secondary"
              aria-label={`Hide ${listing.role}`}
              onClick={() => onAct("hide")}
            >
              Hide
            </button>
          </>
        )}
        {(state === "paused" || state === "expired") && (
          <button
            type="button"
            aria-label={`Republish ${listing.role}`}
            onClick={() => onAct("republish")}
          >
            Republish
          </button>
        )}
        {(state === "published" ||
          state === "paused" ||
          state === "expired") && (
          <button
            type="button"
            className="button-danger"
            aria-label={`Close ${listing.role}`}
            onClick={() => onAct("close")}
          >
            Close
          </button>
        )}
        {state === "draft" && !listing.published_at && (
          <button
            type="button"
            className="button-danger"
            aria-label={`Delete ${listing.role}`}
            onClick={() => onAct("delete")}
          >
            Delete
          </button>
        )}
      </div>
    </article>
  );
}

function DiscardBar({
  onKeep,
  onDiscard,
}: {
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      className="operator-discard"
      role="alertdialog"
      aria-label="Unsaved changes"
    >
      <p>Discard your unsaved changes?</p>
      <div className="portal-actions">
        <button type="button" className="button-secondary" onClick={onKeep}>
          Keep editing
        </button>
        <button type="button" className="button-danger" onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  );
}

function VacancyEditor({
  target,
  presetCompany,
  employers,
  organizations,
  onClosed,
  onSaved,
}: {
  target: AdminListing | "new" | null;
  presetCompany: string;
  employers: Employer[];
  organizations: Organization[];
  onClosed: () => void;
  onSaved: (message: string) => void;
}) {
  const sheet = useSheet();
  const openSheet = sheet.open;
  const form = useRef<HTMLFormElement>(null);
  const [listing, setListing] = useState<AdminListing | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [revision, setRevision] = useState(0);
  const [shown, setShown] = useState(false);
  const creating = target === "new";
  const live = listing?.status === "published";

  useEffect(() => {
    if (!target) return;
    setListing(target === "new" ? null : target);
    setErrors({});
    setError("");
    setStale(false);
    setDirty(false);
    setAsking(false);
    setRevision((value) => value + 1);
    setShown(true);
    openSheet();
  }, [target, openSheet]);

  async function reload() {
    if (!listing) return;
    try {
      const fresh = await portalFetch(`admin/listings/${listing.id}`);
      setListing({ ...listing, ...fresh });
      setStale(false);
      setError("");
      setErrors({});
      setDirty(false);
      setRevision((value) => value + 1);
    } catch (reason) {
      setError(reasonText(reason));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const found = listingErrors(data);
    const reason = String(data.get("reason") || "").trim();
    if (
      live &&
      listing &&
      !reason &&
      (String(data.get("official_source_url")).trim() !==
        listing.official_source_url ||
        String(data.get("contact_url")).trim() !== listing.contact_url)
    )
      found.reason = "Say why the source or contact link changed.";
    setErrors(found);
    if (Object.keys(found).length) {
      focusFirstInvalid(form.current);
      return;
    }
    setPending(true);
    setError("");
    try {
      if (creating) {
        const organization = String(data.get("organization_id") || "");
        await portalFetch("admin/listings", {
          method: "POST",
          body: JSON.stringify({
            ...listingPayload(data),
            organization_id: organization || null,
          }),
        });
        setDirty(false);
        sheet.close();
        onSaved(
          organization
            ? "Draft created. The company can now edit and submit it."
            : "Draft created.",
        );
      } else if (listing) {
        await portalFetch(`admin/listings/${listing.id}`, {
          method: "PUT",
          body: JSON.stringify({
            expected_version: listing.version,
            content: listingPayload(data),
            ...(reason ? { reason } : {}),
          }),
        });
        setDirty(false);
        sheet.close();
        onSaved(live ? "Changes are live." : "Vacancy saved.");
      }
    } catch (reason) {
      if (isConflict(reason) && listing) {
        setStale(true);
        setError(
          live
            ? "This vacancy changed since you opened it, or the new dates would end it. Reload to see the latest version."
            : "This vacancy changed since you opened it. Reload to see the latest version.",
        );
      } else setError(reasonText(reason));
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet
      sheet={sheet}
      title={creating ? "Add vacancy" : "Edit vacancy"}
      titleId="vacancy-editor-title"
      className="operator-sheet"
      onRequestClose={() => {
        if (!dirty) return true;
        setAsking(true);
        return false;
      }}
      onClosed={() => {
        setShown(false);
        onClosed();
      }}
    >
      {shown && (
        <form
          ref={form}
          key={revision}
          className="portal-form operator-sheet-body"
          noValidate
          onSubmit={submit}
          onInput={() => setDirty(true)}
        >
          {asking && (
            <DiscardBar
              onKeep={() => setAsking(false)}
              onDiscard={() => {
                setDirty(false);
                setAsking(false);
                sheet.close();
              }}
            />
          )}
          {live && (
            <p className="portal-notice">
              This vacancy is live. Saved changes appear on the public page
              straight away.
            </p>
          )}
          {creating && (
            <label>
              Company
              <select name="organization_id" defaultValue={presetCompany}>
                <option value="">No company (operator vacancy)</option>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <ListingFields
            listing={listing}
            employers={employers}
            idPrefix="operator-vacancy"
            errors={errors}
            lockIdentity={!creating}
          />
          {live && (
            <label>
              Reason for this change
              <textarea
                name="reason"
                maxLength={300}
                rows={2}
                aria-invalid={errors.reason ? true : undefined}
                aria-describedby={
                  errors.reason ? "vacancy-reason-error" : undefined
                }
              />
              {errors.reason ? (
                <span className="field-error" id="vacancy-reason-error">
                  {errors.reason}
                </span>
              ) : (
                <span className="portal-hint">
                  Required when you change the official source or contact link.
                </span>
              )}
            </label>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}{" "}
              {stale && (
                <button
                  type="button"
                  className="text-action"
                  onClick={() => void reload()}
                >
                  Reload latest
                </button>
              )}
            </p>
          )}
          <div className="portal-actions operator-sheet-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                if (dirty) setAsking(true);
                else sheet.close();
              }}
            >
              Cancel
            </button>
            <button type="submit" disabled={pending}>
              {pending ? "Saving…" : creating ? "Create draft" : "Save changes"}
            </button>
          </div>
        </form>
      )}
    </Sheet>
  );
}

function VacancyAction({
  target,
  onClosed,
  onDone,
  onStale,
}: {
  target: { kind: ActionKind; listing: AdminListing } | null;
  onClosed: () => void;
  onDone: (message: string) => void;
  onStale: () => void;
}) {
  const sheet = useSheet();
  const openSheet = sheet.open;
  const [current, setCurrent] = useState(target);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!target) return;
    setCurrent(target);
    setErrors({});
    setError("");
    openSheet();
  }, [target, openSheet]);

  const action = current ? actions[current.kind] : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current || !action) return;
    const data = new FormData(event.currentTarget);
    const reason = String(data.get("reason") || "").trim();
    const source = String(data.get("confirmation_source_url") || "").trim();
    const found: FieldErrors = {};
    if (!reason) found.reason = "Record the reason for this decision.";
    if (current.kind === "republish") {
      const problem = urlProblem(source);
      if (problem) found.confirmation_source_url = problem;
    }
    setErrors(found);
    if (Object.keys(found).length) {
      focusFirstInvalid(event.currentTarget);
      return;
    }
    setPending(true);
    setError("");
    try {
      await portalFetch(`admin/listings/${current.listing.id}/${action.path}`, {
        method: "POST",
        body: JSON.stringify({
          expected_version: current.listing.version,
          reason,
          ...(current.kind === "republish"
            ? { confirmation_source_url: source }
            : {}),
        }),
      });
      sheet.close();
      onDone(action.done);
    } catch (reason) {
      if (isConflict(reason)) {
        setError(
          current.kind === "republish"
            ? "It cannot go live now: it changed since you opened it, its season or end date has passed, or the employer's identity is disputed."
            : current.kind === "delete"
              ? "Only drafts that were never published, are not in review, and have no reports can be deleted. It may also have changed; the list was reloaded."
              : "This vacancy changed since you opened it. The list was reloaded.",
        );
        onStale();
      } else setError(reasonText(reason));
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet
      sheet={sheet}
      title={action?.title || ""}
      titleId="vacancy-action-title"
      onClosed={() => {
        setCurrent(null);
        onClosed();
      }}
    >
      {current && action && (
        <form
          key={`${current.kind}:${current.listing.id}`}
          className="portal-form operator-sheet-body"
          noValidate
          onSubmit={submit}
        >
          <p className="operator-action-target">
            <strong>{current.listing.role}</strong>
            <span>
              {current.listing.employer_name} · {current.listing.city},{" "}
              {current.listing.state}
            </span>
          </p>
          <p className="portal-hint">{action.text}</p>
          {current.kind === "republish" && (
            <label>
              Where you confirmed it
              <input
                name="confirmation_source_url"
                type="url"
                defaultValue={current.listing.official_source_url}
                aria-invalid={errors.confirmation_source_url ? true : undefined}
                aria-describedby={
                  errors.confirmation_source_url
                    ? "vacancy-source-error"
                    : undefined
                }
              />
              {errors.confirmation_source_url && (
                <span className="field-error" id="vacancy-source-error">
                  {errors.confirmation_source_url}
                </span>
              )}
            </label>
          )}
          <label>
            Reason
            <textarea
              name="reason"
              maxLength={300}
              rows={3}
              aria-invalid={errors.reason ? true : undefined}
              aria-describedby={
                errors.reason ? "vacancy-action-error" : undefined
              }
            />
            {errors.reason && (
              <span className="field-error" id="vacancy-action-error">
                {errors.reason}
              </span>
            )}
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="portal-actions operator-sheet-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={sheet.close}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={action.danger ? "button-danger-solid" : undefined}
              disabled={pending}
            >
              {pending ? "Working…" : action.button}
            </button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
