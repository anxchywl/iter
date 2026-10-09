"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Sheet, useSheet } from "@/components/sheet";
import {
  companyErrors,
  isConflict,
  listingStateLabels,
  portalFetch,
  reasonText,
  type FieldErrors,
  type IssuedAccessKey,
  type ListingState,
  type Organization,
} from "@/lib/portal-client";

function focusFirstInvalid(form: HTMLFormElement | null) {
  requestAnimationFrame(() =>
    form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
  );
}

function CompanyFields({
  organization,
  errors,
  idPrefix,
}: {
  organization?: Organization | null;
  errors: FieldErrors;
  idPrefix: string;
}) {
  const field = (name: string) => ({
    id: `${idPrefix}-${name}`,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${idPrefix}-${name}-error` : undefined,
  });
  const message = (name: string) =>
    errors[name] && (
      <span className="field-error" id={`${idPrefix}-${name}-error`}>
        {errors[name]}
      </span>
    );
  return (
    <>
      <label>
        Company name
        <input
          name="name"
          defaultValue={organization?.name}
          maxLength={160}
          {...field("name")}
        />
        {message("name")}
      </label>
      <label>
        Company website
        <input
          name="website_url"
          type="url"
          placeholder="https://"
          defaultValue={organization?.website_url || ""}
          {...field("website_url")}
        />
        {message("website_url")}
      </label>
      <label className="portal-span">
        Business address
        <textarea
          name="address"
          maxLength={300}
          rows={2}
          defaultValue={organization?.address || ""}
          {...field("address")}
        />
        {message("address")}
      </label>
    </>
  );
}

function payload(form: FormData) {
  return {
    name: String(form.get("name") || "").trim(),
    website_url: String(form.get("website_url") || "").trim(),
    address: String(form.get("address") || "").trim(),
  };
}

const countOrder: ListingState[] = [
  "published",
  "pending",
  "draft",
  "paused",
  "expired",
  "closed",
];

export function CompaniesSection({
  organizations,
  notify,
  onChanged,
  onShowVacancies,
  onCreateVacancy,
}: {
  organizations: Organization[];
  notify: (message: string) => void;
  onChanged: () => Promise<unknown>;
  onShowVacancies: (organizationId: string) => void;
  onCreateVacancy: (organizationId: string) => void;
}) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState("");
  const [issuedKey, setIssuedKey] = useState<IssuedAccessKey | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<Organization | null>(null);
  const [changingStatus, setChangingStatus] = useState<Organization | null>(
    null,
  );
  const keyPanel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!issuedKey) return;
    setCopyStatus("");
    keyPanel.current?.focus();
  }, [issuedKey]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const found = companyErrors(data);
    setErrors(found);
    setError("");
    if (Object.keys(found).length) {
      focusFirstInvalid(form);
      return;
    }
    try {
      const organization = await portalFetch("admin/organizations", {
        method: "POST",
        body: JSON.stringify(payload(data)),
      });
      setIssuedKey({
        organizationName: organization.name,
        accessKey: organization.access_key,
      });
      notify("Company profile created.");
      form.reset();
      await onChanged();
    } catch (reason) {
      setError(reasonText(reason));
    }
  }

  async function rotate(organization: Organization) {
    setError("");
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
      setConfirmingKey(null);
      notify(
        organization.access_key_hint
          ? "Access key replaced. Existing company sessions were signed out."
          : "Access key created.",
      );
      await onChanged();
    } catch (reason) {
      setError(
        isConflict(reason)
          ? "Complete the company's website and address before issuing a key, then try again."
          : reasonText(reason),
      );
      await onChanged();
    }
  }

  return (
    <section
      className="portal-panel"
      id="companies"
      aria-labelledby="companies-title"
    >
      <h2 id="companies-title">Companies</h2>
      <p>
        Create the company profile first. A private access key is generated
        automatically so the company can manage its offers in any browser.
      </p>
      {issuedKey && (
        <div
          className="portal-key"
          role="region"
          aria-label="New company access key"
          tabIndex={-1}
          ref={keyPanel}
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
                void navigator.clipboard.writeText(issuedKey.accessKey).then(
                  () => setCopyStatus("Copied"),
                  () =>
                    setError(
                      "Could not copy. Select the key and copy it manually.",
                    ),
                );
              }}
            >
              {copyStatus || "Copy key"}
            </button>
            <span className="portal-hint" aria-live="polite">
              {copyStatus && "Access key copied."}
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
        noValidate
        onSubmit={create}
      >
        <CompanyFields errors={errors} idPrefix="new-company" />
        <div className="portal-actions portal-span">
          <button type="submit">Create company and access key</button>
        </div>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="portal-list">
        {organizations.length === 0 && (
          <p className="portal-empty">No companies yet.</p>
        )}
        {organizations.map((organization) => {
          const counts = organization.listing_counts || {};
          const total = Object.values(counts).reduce(
            (sum, value) => sum + (value || 0),
            0,
          );
          const incomplete = !organization.website_url || !organization.address;
          return (
            <article
              key={organization.id}
              className="portal-item operator-company"
            >
              <div className="operator-company-main">
                <span className="status-chip" data-state={organization.status}>
                  {organization.status === "active" ? "Active" : "Suspended"}
                </span>
                <h3>{organization.name}</h3>
                <p>{organization.address || "Business address needed"}</p>
                {organization.website_url ? (
                  <a
                    className="portal-url"
                    href={organization.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {organization.website_url}
                  </a>
                ) : (
                  <p className="field-error">Company website needed</p>
                )}
                <p className="portal-hint">
                  {organization.access_key_hint
                    ? `Access key active, ends in ${organization.access_key_hint}`
                    : "No access key issued"}
                </p>
                <p className="operator-counts">
                  {total === 0
                    ? "No vacancies yet"
                    : countOrder
                        .filter((state) => counts[state])
                        .map(
                          (state) =>
                            `${counts[state]} ${listingStateLabels[state].toLowerCase()}`,
                        )
                        .join(" · ")}
                </p>
              </div>
              <div className="portal-actions operator-company-actions">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => onShowVacancies(organization.id)}
                >
                  Vacancies
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => onCreateVacancy(organization.id)}
                >
                  Add vacancy
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => setEditing(organization)}
                >
                  Edit profile
                </button>
                {confirmingKey === organization.id ? (
                  <>
                    <button
                      type="button"
                      className="button-danger"
                      onClick={() => void rotate(organization)}
                    >
                      Confirm replacement
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => setConfirmingKey(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={incomplete}
                    title={
                      incomplete
                        ? "Add the website and address first"
                        : undefined
                    }
                    onClick={() =>
                      organization.access_key_hint
                        ? setConfirmingKey(organization.id)
                        : void rotate(organization)
                    }
                  >
                    {organization.access_key_hint
                      ? "Replace access key"
                      : "Create access key"}
                  </button>
                )}
                <button
                  type="button"
                  className={
                    organization.status === "active"
                      ? "button-danger"
                      : "button-secondary"
                  }
                  onClick={() => setChangingStatus(organization)}
                >
                  {organization.status === "active"
                    ? "Suspend access"
                    : "Restore access"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <CompanyEditor
        target={editing}
        onClosed={() => setEditing(null)}
        onSaved={async () => {
          notify("Company profile updated.");
          await onChanged();
        }}
      />
      <CompanyStatus
        target={changingStatus}
        onClosed={() => setChangingStatus(null)}
        onDone={async (message) => {
          notify(message);
          await onChanged();
        }}
      />
    </section>
  );
}

function CompanyEditor({
  target,
  onClosed,
  onSaved,
}: {
  target: Organization | null;
  onClosed: () => void;
  onSaved: () => Promise<void>;
}) {
  const sheet = useSheet();
  const openSheet = sheet.open;
  const form = useRef<HTMLFormElement>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!target) return;
    setOrganization(target);
    setErrors({});
    setError("");
    setDirty(false);
    setAsking(false);
    openSheet();
  }, [target, openSheet]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organization) return;
    const data = new FormData(event.currentTarget);
    const found = companyErrors(data);
    setErrors(found);
    if (Object.keys(found).length) {
      focusFirstInvalid(form.current);
      return;
    }
    setPending(true);
    setError("");
    try {
      await portalFetch(`admin/organizations/${organization.id}`, {
        method: "PUT",
        body: JSON.stringify({
          expected_version: organization.version,
          ...payload(data),
        }),
      });
      setDirty(false);
      sheet.close();
      await onSaved();
    } catch (reason) {
      setError(
        isConflict(reason)
          ? "This company changed since you opened it. Close and reopen it to see the latest profile."
          : reasonText(reason),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet
      sheet={sheet}
      title="Edit company"
      titleId="company-editor-title"
      className="operator-sheet"
      onRequestClose={() => {
        if (!dirty) return true;
        setAsking(true);
        return false;
      }}
      onClosed={() => {
        setOrganization(null);
        onClosed();
      }}
    >
      {organization && (
        <form
          ref={form}
          key={`${organization.id}:${organization.version}`}
          className="portal-form portal-form-grid operator-sheet-body"
          noValidate
          onSubmit={submit}
          onInput={() => setDirty(true)}
        >
          {asking && (
            <div
              className="operator-discard portal-span"
              role="alertdialog"
              aria-label="Unsaved changes"
            >
              <p>Discard your unsaved changes?</p>
              <div className="portal-actions">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => setAsking(false)}
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  className="button-danger"
                  onClick={() => {
                    setDirty(false);
                    setAsking(false);
                    sheet.close();
                  }}
                >
                  Discard
                </button>
              </div>
            </div>
          )}
          <CompanyFields
            organization={organization}
            errors={errors}
            idPrefix="edit-company"
          />
          {error && (
            <p className="form-error portal-span" role="alert">
              {error}
            </p>
          )}
          <div className="portal-actions portal-span operator-sheet-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={() => (dirty ? setAsking(true) : sheet.close())}
            >
              Cancel
            </button>
            <button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save company"}
            </button>
          </div>
        </form>
      )}
    </Sheet>
  );
}

function CompanyStatus({
  target,
  onClosed,
  onDone,
}: {
  target: Organization | null;
  onClosed: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const sheet = useSheet();
  const openSheet = sheet.open;
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [problem, setProblem] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const suspending = organization?.status === "active";

  useEffect(() => {
    if (!target) return;
    setOrganization(target);
    setProblem("");
    setError("");
    openSheet();
  }, [target, openSheet]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organization) return;
    const reason = String(
      new FormData(event.currentTarget).get("reason") || "",
    ).trim();
    if (!reason) {
      setProblem("Record the reason for this change.");
      return;
    }
    setPending(true);
    setError("");
    try {
      await portalFetch(`admin/organizations/${organization.id}/status`, {
        method: "POST",
        body: JSON.stringify({
          expected_version: organization.version,
          status: suspending ? "suspended" : "active",
          reason,
        }),
      });
      sheet.close();
      await onDone(
        suspending
          ? "Company suspended. Existing sessions were signed out."
          : "Company access restored.",
      );
    } catch (reason) {
      setError(
        isConflict(reason)
          ? "This company changed since you opened it. Close and try again."
          : reasonText(reason),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet
      sheet={sheet}
      title={suspending ? "Suspend company access" : "Restore company access"}
      titleId="company-status-title"
      onClosed={() => {
        setOrganization(null);
        onClosed();
      }}
    >
      {organization && (
        <form
          key={organization.id}
          className="portal-form operator-sheet-body"
          noValidate
          onSubmit={submit}
        >
          <p className="operator-action-target">
            <strong>{organization.name}</strong>
          </p>
          <p className="portal-hint">
            {suspending
              ? "The company is signed out and cannot sign in until access is restored. Its live vacancies stay as they are."
              : "The company can sign in again with its current access key."}
          </p>
          <label>
            Reason
            <textarea
              name="reason"
              maxLength={300}
              rows={3}
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? "company-status-error" : undefined}
            />
            {problem && (
              <span className="field-error" id="company-status-error">
                {problem}
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
              className={suspending ? "button-danger-solid" : undefined}
              disabled={pending}
            >
              {pending
                ? "Working…"
                : suspending
                  ? "Suspend access"
                  : "Restore access"}
            </button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
