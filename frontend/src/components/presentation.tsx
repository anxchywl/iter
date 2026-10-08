import Link from "next/link";
import type { MouseEventHandler } from "react";
import type { Copy, Locale } from "@/lib/copy";
import { fill, getCopy, intlLocale, localePath } from "@/lib/copy";
import type { Listing, Review } from "@/lib/directory";
import { AllReviews } from "@/components/all-reviews";
import { ContactAction } from "@/components/contact-sheet";
import { ExternalIcon } from "@/components/icons";
import { LinkPending } from "@/components/link-pending";
import { plainText } from "@/lib/directory";
import { safeContact } from "@/lib/links";

export function formattedDate(
  value: string | null,
  locale: Locale,
  t: Copy,
): string {
  if (!value) return t.unknown;
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return t.unknown;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

export function dateRange(
  start: string | null,
  end: string | null,
  locale: Locale,
  t: Copy,
): string {
  const from = start ? formattedDate(start, locale, t) : null;
  const until = end ? formattedDate(end, locale, t) : null;
  if (from && until) return fill(t.rangeBoth, { start: from, end: until });
  if (from) return fill(t.rangeFrom, { start: from });
  if (until) return fill(t.rangeUntil, { end: until });
  return t.unknown;
}

export function amount(
  value: string | null,
  currency: string | null,
  basis: string | null,
  t: Copy,
): string {
  if (!value || !currency || !basis) return t.unknown;
  const basisLabel =
    basis === "season"
      ? t.seasonBasis
      : t[basis as "hour" | "day" | "week" | "month"];
  return `${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency} / ${basisLabel}`;
}

function sourceLink(url: string | null, label: string, t: Copy) {
  const link = url ? safeContact(url) : null;
  return link && (link.kind === "web" || link.kind === "telegram") ? (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label}: ${link.destination}`}
    >
      {label}
      <ExternalIcon />
    </a>
  ) : (
    <span>{t.unknown}</span>
  );
}

export function TrustFacts({
  listing,
  locale,
}: {
  listing: Listing;
  locale: Locale;
}) {
  const t = getCopy(locale);
  const identity =
    listing.employer_identity_status === "checked"
      ? t.identityChecked
      : listing.employer_identity_status === "disputed"
        ? t.identityDisputed
        : t.identityNotChecked;
  const route =
    listing.sponsor_route_status === "reported"
      ? t.routeReportedGeneric
      : listing.sponsor_route_status === "reported_no_route"
        ? t.routeNone
        : t.routeUnknown;
  const approval =
    listing.sponsor_approval_status === "confirmed" && listing.sponsor_name
      ? `${t.approvalConfirmed} ${plainText(listing.sponsor_name)}`
      : listing.sponsor_approval_status === "pending"
        ? t.approvalPending
        : listing.sponsor_approval_status === "not_approved"
          ? t.approvalDenied
          : t.approvalUnknown;
  return (
    <>
      <dl className="trust-list">
        <div>
          <dt>{identity}</dt>
          <dd>
            {listing.employer_identity_status === "checked" && (
              <span>
                {formattedDate(listing.employer_identity_checked_at, locale, t)}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>{t.confirmed}</dt>
          <dd>
            <span>{formattedDate(listing.last_confirmed_at, locale, t)}</span>
          </dd>
        </div>
        <div>
          <dt>{route}</dt>
          <dd />
        </div>
        <div>
          <dt>{approval}</dt>
          <dd>
            {listing.sponsor_approval_status !== "unknown" && (
              <span>
                {formattedDate(listing.sponsor_decision_at, locale, t)}
              </span>
            )}
          </dd>
        </div>
      </dl>
      <div className="evidence-links">
        {listing.employer_identity_status === "checked" &&
          sourceLink(
            listing.employer_identity_public_source_url,
            t.evidenceSource,
            t,
          )}
        {sourceLink(listing.official_source_url, t.source, t)}
        {listing.sponsor_route_status !== "not_reported" &&
          sourceLink(listing.sponsor_route_source_url, t.evidenceSource, t)}
        {listing.sponsor_approval_status !== "unknown" &&
          sourceLink(listing.sponsor_decision_url, t.evidenceSource, t)}
      </div>
    </>
  );
}

export function Conditions({
  listing,
  locale,
  compact = false,
}: {
  listing: Listing;
  locale: Locale;
  compact?: boolean;
}) {
  const t = getCopy(locale);
  const rows: [string, string | null][] = [
    [
      t.pay,
      amount(listing.wage_amount, listing.wage_currency, listing.wage_basis, t),
    ],
    [
      t.hours,
      listing.expected_hours_per_week
        ? `${listing.expected_hours_per_week}`
        : null,
    ],
    [t.housing, plainText(listing.housing_description)],
    [
      t.housingCost,
      amount(
        listing.housing_cost_amount,
        listing.housing_cost_currency,
        listing.housing_cost_basis,
        t,
      ),
    ],
  ];
  if (!compact)
    rows.push(
      [
        t.dates,
        dateRange(listing.work_start_date, listing.work_end_date, locale, t),
      ],
      [t.transport, plainText(listing.transport_description)],
    );
  return (
    <dl className={compact ? "conditions compact" : "conditions"}>
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || t.unknown}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ListingCard({
  listing,
  locale,
  onSelect,
  selected = false,
}: {
  listing: Listing;
  locale: Locale;
  onSelect?: MouseEventHandler<HTMLElement>;
  selected?: boolean;
}) {
  const t = getCopy(locale);
  return (
    <article className="listing-card" data-selected={selected || undefined}>
      <Link
        className="listing-link"
        href={localePath(locale, `/jobs/${listing.id}`)}
        onClick={onSelect}
      >
        <div className="listing-summary">
          <span className="listing-employer">
            {plainText(listing.employer_legal_name)}
          </span>
          <h3>{plainText(listing.role)}</h3>
          <span className="listing-location">
            <span>
              {plainText(listing.city)}, {plainText(listing.state)}
            </span>
            <span>{fill(t.seasonYear, { year: listing.season_year })}</span>
          </span>
        </div>
        <strong className="listing-pay">
          {amount(
            listing.wage_amount,
            listing.wage_currency,
            listing.wage_basis,
            t,
          )}
        </strong>
        <span className="listing-extra">
          {t.housing}: {plainText(listing.housing_description) || t.unknown}
        </span>
        <span className="listing-extra">
          {t.dates}:{" "}
          {dateRange(listing.work_start_date, listing.work_end_date, locale, t)}
        </span>
        <span className="listing-confirmed">
          {t.confirmed} {formattedDate(listing.last_confirmed_at, locale, t)}
        </span>
        <LinkPending skeleton="detail" />
      </Link>
    </article>
  );
}

export { ContactAction };

type CheckState = "yes" | "no" | "unknown" | "not_applicable";

function reviewAnswer(value: string, t: Copy): string {
  return value === "yes"
    ? t.answerAsListed
    : value === "no"
      ? t.answerNotAsListed
      : value === "not_applicable"
        ? t.answerNoMatter
        : t.answerNotSure;
}

function CheckMark({ state }: { state: CheckState }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {state === "yes" ? (
        <path d="m4 8.5 2.6 2.6L12 5.5" />
      ) : state === "no" ? (
        <path d="m5 5 6 6m0-6-6 6" />
      ) : state === "not_applicable" ? (
        <path d="M4.5 8h7" />
      ) : (
        <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
      )}
    </svg>
  );
}

function ReviewCheck({
  label,
  state,
  answer,
}: {
  label: string;
  state: CheckState;
  answer: string;
}) {
  return (
    <li className="review-check" data-state={state} title={answer}>
      <CheckMark state={state} />
      {label}
      <span className="sr-only">: {answer}</span>
    </li>
  );
}

function ReviewCard({
  item,
  locale,
  full = false,
}: {
  item: Review;
  locale: Locale;
  full?: boolean;
}) {
  const t = getCopy(locale);
  const clarity: CheckState =
    item.pay_clarity === "clear"
      ? "yes"
      : item.pay_clarity === "unclear"
        ? "no"
        : "unknown";
  return (
    <article className="review" data-full={full || undefined}>
      <div className="review-head">
        <h3>{plainText(item.role)}</h3>
        <time dateTime={item.submitted_at.slice(0, 10)}>
          {formattedDate(item.submitted_at, locale, t)}
        </time>
      </div>
      <p className="review-season">
        {fill(t.seasonYear, { year: item.season_year })}
      </p>
      <ul className="review-checks">
        <ReviewCheck
          label={t.payShort}
          state={item.pay_match}
          answer={reviewAnswer(item.pay_match, t)}
        />
        <ReviewCheck
          label={t.payTermsShort}
          state={clarity}
          answer={
            clarity === "yes"
              ? t.answerClear
              : clarity === "no"
                ? t.answerUnclear
                : t.answerNotSure
          }
        />
        <ReviewCheck
          label={t.hoursReview}
          state={item.hours_match}
          answer={reviewAnswer(item.hours_match, t)}
        />
        <ReviewCheck
          label={t.housingReview}
          state={item.housing_match}
          answer={reviewAnswer(item.housing_match, t)}
        />
        <ReviewCheck
          label={t.transportReview}
          state={item.transport_match}
          answer={reviewAnswer(item.transport_match, t)}
        />
      </ul>
      {item.text && <p className="review-text">{plainText(item.text)}</p>}
      <p className="review-note">{t.selfReported}</p>
    </article>
  );
}

export function Reviews({
  items,
  locale,
  actions,
}: {
  items: Review[];
  locale: Locale;
  actions?: React.ReactNode;
}) {
  const t = getCopy(locale);
  return (
    <section className="reviews" aria-labelledby="reviews-heading">
      <div className="reviews-head">
        <h2 id="reviews-heading">{t.reviews}</h2>
        {items.length > 0 && (
          <AllReviews locale={locale}>
            {items.map((item) => (
              <ReviewCard key={item.id} item={item} locale={locale} full />
            ))}
          </AllReviews>
        )}
      </div>
      {items.length > 0 && (
        <div
          className="review-scroller"
          role="region"
          aria-labelledby="reviews-heading"
          tabIndex={0}
        >
          {items.map((item) => (
            <ReviewCard key={item.id} item={item} locale={locale} />
          ))}
        </div>
      )}
      {actions && <div className="experience-actions">{actions}</div>}
    </section>
  );
}
