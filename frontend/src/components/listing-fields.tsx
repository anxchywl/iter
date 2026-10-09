import type { ReactElement, ReactNode } from "react";
import { cloneElement } from "react";
import type { Employer, FieldErrors, PortalListing } from "@/lib/portal-client";

type Control = ReactElement<{
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}>;

function Field({
  id,
  label,
  error,
  span = false,
  children,
}: {
  id: string;
  label: ReactNode;
  error?: string;
  span?: boolean;
  children: Control;
}) {
  return (
    <label className={span ? "portal-span" : undefined}>
      {label}
      {cloneElement(children, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error ? `${id}-error` : undefined,
      })}
      {error && (
        <span className="field-error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </label>
  );
}

export function ListingFields({
  listing,
  employers,
  idPrefix,
  errors = {},
  lockIdentity = false,
}: {
  listing?: Partial<PortalListing> | null;
  employers: Employer[];
  idPrefix: string;
  errors?: FieldErrors;
  lockIdentity?: boolean;
}) {
  const id = (name: string) => `${idPrefix}-${name}`;
  const employerName = employers.find(
    (item) => item.id === listing?.employer_id,
  )?.legal_name;
  return (
    <>
      <fieldset className="portal-form-section portal-form-grid">
        <legend>Offer basics</legend>
        {lockIdentity ? (
          <label>
            Employer
            <input
              id={id("employer_name")}
              value={employerName || "Unknown employer"}
              readOnly
            />
            <input
              type="hidden"
              name="employer_id"
              value={listing?.employer_id}
            />
          </label>
        ) : (
          <Field
            id={id("employer_id")}
            label="Employer"
            error={errors.employer_id}
          >
            <select
              name="employer_id"
              defaultValue={listing?.employer_id}
              required
            >
              <option value="">Select employer</option>
              {employers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.legal_name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field
          id={id("source_identifier")}
          label="Internal reference"
          error={errors.source_identifier}
        >
          <input
            name="source_identifier"
            defaultValue={listing?.source_identifier}
            readOnly={lockIdentity}
            required
            maxLength={120}
          />
        </Field>
        <Field id={id("season_year")} label="Season" error={errors.season_year}>
          <input
            name="season_year"
            type="number"
            min="2020"
            max="2100"
            defaultValue={listing?.season_year || new Date().getFullYear() + 1}
            readOnly={lockIdentity}
            required
          />
        </Field>
        <Field id={id("role")} label="Role" error={errors.role}>
          <input
            name="role"
            defaultValue={listing?.role}
            required
            maxLength={160}
          />
        </Field>
        <Field id={id("state")} label="State" error={errors.state}>
          <input
            name="state"
            defaultValue={listing?.state}
            required
            maxLength={80}
          />
        </Field>
        <Field id={id("city")} label="City" error={errors.city}>
          <input
            name="city"
            defaultValue={listing?.city}
            required
            maxLength={120}
          />
        </Field>
        <Field
          id={id("location_timezone")}
          label="Time zone"
          error={errors.location_timezone}
        >
          <input
            name="location_timezone"
            defaultValue={listing?.location_timezone || "America/New_York"}
            required
          />
        </Field>
        <Field id={id("category")} label="Job type" error={errors.category}>
          <input
            name="category"
            defaultValue={listing?.category}
            required
            maxLength={80}
          />
        </Field>
        <Field id={id("duties")} label="Duties" span>
          <textarea
            name="duties"
            defaultValue={listing?.duties || ""}
            maxLength={2000}
          />
        </Field>
      </fieldset>
      <fieldset className="portal-form-section portal-form-grid">
        <legend>Source and contact</legend>
        <Field
          id={id("official_source_url")}
          label="Official job source"
          error={errors.official_source_url}
          span
        >
          <input
            name="official_source_url"
            type="url"
            defaultValue={listing?.official_source_url}
            required
          />
        </Field>
        <Field
          id={id("contact_url")}
          label="Application or contact link"
          error={errors.contact_url}
          span
        >
          <input
            name="contact_url"
            type="url"
            defaultValue={listing?.contact_url}
            required
          />
        </Field>
      </fieldset>
      <fieldset className="portal-form-section portal-form-grid">
        <legend>Dates and pay</legend>
        <Field id={id("work_start_date")} label="Start date">
          <input
            name="work_start_date"
            type="date"
            defaultValue={listing?.work_start_date || ""}
          />
        </Field>
        <Field
          id={id("work_end_date")}
          label="End date"
          error={errors.work_end_date}
        >
          <input
            name="work_end_date"
            type="date"
            defaultValue={listing?.work_end_date || ""}
          />
        </Field>
        <Field id={id("wage_amount")} label="Pay amount">
          <input
            name="wage_amount"
            type="number"
            min="0"
            step="0.01"
            defaultValue={listing?.wage_amount || ""}
          />
        </Field>
        <Field
          id={id("wage_currency")}
          label="Pay currency"
          error={errors.wage_currency}
        >
          <input
            name="wage_currency"
            defaultValue={listing?.wage_currency || "USD"}
            maxLength={3}
          />
        </Field>
        <Field id={id("wage_basis")} label="Pay basis">
          <select
            name="wage_basis"
            defaultValue={listing?.wage_basis || "hour"}
          >
            <option value="hour">Hour</option>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </Field>
        <Field id={id("expected_hours_per_week")} label="Hours per week">
          <input
            name="expected_hours_per_week"
            type="number"
            min="0"
            max="168"
            step="0.25"
            defaultValue={listing?.expected_hours_per_week || ""}
          />
        </Field>
      </fieldset>
      <fieldset className="portal-form-section portal-form-grid">
        <legend>Housing and transport</legend>
        <Field id={id("housing_description")} label="Housing details" span>
          <textarea
            name="housing_description"
            defaultValue={listing?.housing_description || ""}
            maxLength={2000}
          />
        </Field>
        <Field id={id("housing_cost_amount")} label="Housing cost">
          <input
            name="housing_cost_amount"
            type="number"
            min="0"
            step="0.01"
            defaultValue={listing?.housing_cost_amount || ""}
          />
        </Field>
        <Field
          id={id("housing_cost_currency")}
          label="Housing currency"
          error={errors.housing_cost_currency}
        >
          <input
            name="housing_cost_currency"
            defaultValue={listing?.housing_cost_currency || "USD"}
            maxLength={3}
          />
        </Field>
        <Field id={id("housing_cost_basis")} label="Housing basis">
          <select
            name="housing_cost_basis"
            defaultValue={listing?.housing_cost_basis || "week"}
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="season">Season</option>
          </select>
        </Field>
        <Field id={id("transport_description")} label="Transport details" span>
          <textarea
            name="transport_description"
            defaultValue={listing?.transport_description || ""}
            maxLength={2000}
          />
        </Field>
      </fieldset>
    </>
  );
}
