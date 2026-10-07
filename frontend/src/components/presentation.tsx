import Link from "next/link";
import type { Copy, Locale } from "@/lib/copy";
import { fill, getCopy, intlLocale, localePath } from "@/lib/copy";
import type { Listing, Review } from "@/lib/directory";
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

function amount(
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
}: {
  listing: Listing;
  locale: Locale;
}) {
  const t = getCopy(locale);
  return (
    <article className="listing-card">
      <Link
        className="listing-link"
        href={localePath(locale, `/jobs/${listing.id}`)}
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

export { ContactAction } from "@/components/contact-sheet";

function reviewAnswer(value: string, t: Copy): string {
  return value === "yes"
    ? t.matched
    : value === "no"
      ? t.notMatched
      : value === "not_applicable"
        ? t.notApplicable
        : t.unknown;
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
      <h2 id="reviews-heading">{t.reviews}</h2>
      {items.length > 0 && (
        <div className="review-grid">
          {items.map((item) => (
            <article className="review" key={item.id}>
              <p className="review-meta">
                <span>{fill(t.seasonYear, { year: item.season_year })}</span>
                <time dateTime={item.submitted_at.slice(0, 10)}>
                  {formattedDate(item.submitted_at, locale, t)}
                </time>
              </p>
              <p className="review-note">{t.selfReported}</p>
              <p>
                {t.roleReview}: {plainText(item.role)}
              </p>
              <dl>
                <div>
                  <dt>{t.payClarity}</dt>
                  <dd>
                    {item.pay_clarity === "clear"
                      ? t.payClear
                      : item.pay_clarity === "unclear"
                        ? t.payUnclear
                        : t.unknownReview}
                  </dd>
                </div>
                <div>
                  <dt>{t.payReview}</dt>
                  <dd>{reviewAnswer(item.pay_match, t)}</dd>
                </div>
                <div>
                  <dt>{t.hoursReview}</dt>
                  <dd>{reviewAnswer(item.hours_match, t)}</dd>
                </div>
                <div>
                  <dt>{t.housingReview}</dt>
                  <dd>{reviewAnswer(item.housing_match, t)}</dd>
                </div>
                <div>
                  <dt>{t.transportReview}</dt>
                  <dd>{reviewAnswer(item.transport_match, t)}</dd>
                </div>
              </dl>
              {item.text && <p>{plainText(item.text)}</p>}
            </article>
          ))}
        </div>
      )}
      {actions && <div className="experience-actions">{actions}</div>}
    </section>
  );
}
