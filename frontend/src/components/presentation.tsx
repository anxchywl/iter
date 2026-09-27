import Link from "next/link";
import type { Copy, Locale } from "@/lib/copy";
import { getCopy, localePath, locales } from "@/lib/copy";
import type { Listing, Review } from "@/lib/directory";
import { ReportForm } from "@/components/feedback";
import { plainText } from "@/lib/directory";
import { miniAppLink, safeContact } from "@/lib/links";

export function SiteShell({
  locale,
  path,
  children,
}: {
  locale: Locale;
  path: string;
  children: React.ReactNode;
}) {
  const t = getCopy(locale);
  const telegram = miniAppLink();
  return (
    <>
      <a className="skip-link" href="#main">
        {t.skip}
      </a>
      {process.env.DIRECTORY_DEMO_MODE === "true" && (
        <div className="demo-banner">{t.demo}</div>
      )}
      <header className="site-header">
        <div className="header-inner">
          <Link
            className="brand"
            href={localePath(locale)}
            aria-label={`${t.brand} — ${t.browse}`}
          >
            <span className="brand-mark" aria-hidden="true">
              ✳
            </span>{" "}
            {t.brand}
          </Link>
          <nav className="main-nav" aria-label={t.browse}>
            <Link href={localePath(locale)}>{t.browse}</Link>
            {telegram && (
              <a href={telegram} target="_blank" rel="noopener noreferrer">
                {t.telegram}
              </a>
            )}
          </nav>
          <nav className="language-nav" aria-label={t.language}>
            {locales.map((target) => (
              <Link
                key={target}
                href={localePath(target, path)}
                hrefLang={target}
                lang={target}
                aria-current={target === locale ? "page" : undefined}
              >
                {target === "kk" ? "ҚАЗ" : target === "ru" ? "РУС" : "EN"}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="site-footer">
        <div className="footer-inner">
          <strong>{t.brand}</strong>
          <p>{t.howText}</p>
        </div>
      </footer>
    </>
  );
}

export function formattedDate(
  value: string | null,
  locale: Locale,
  t: Copy,
): string {
  if (!value) return t.unknown;
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return t.unknown;
  return new Intl.DateTimeFormat(
    locale === "kk" ? "kk-KZ" : locale === "ru" ? "ru-RU" : "en-US",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    },
  ).format(new Date(`${date}T12:00:00Z`));
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
      aria-label={`${label} — ${link.destination}`}
    >
      {label}
      <span aria-hidden="true"> ↗</span>
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
    <dl className="trust-list">
      <div>
        <dt>{identity}</dt>
        <dd>
          {listing.employer_identity_status === "checked" && (
            <>
              {formattedDate(listing.employer_identity_checked_at, locale, t)} ·{" "}
              {sourceLink(
                listing.employer_identity_public_source_url,
                t.source,
                t,
              )}
            </>
          )}
        </dd>
      </div>
      <div>
        <dt>{t.confirmed}</dt>
        <dd>{formattedDate(listing.last_confirmed_at, locale, t)}</dd>
      </div>
      <div>
        <dt>{route}</dt>
        <dd>
          {listing.sponsor_route_status !== "not_reported" &&
            sourceLink(listing.sponsor_route_source_url, t.source, t)}
        </dd>
      </div>
      <div>
        <dt>{approval}</dt>
        <dd>
          {listing.sponsor_approval_status !== "unknown" && (
            <>
              {formattedDate(listing.sponsor_decision_at, locale, t)} ·{" "}
              {sourceLink(listing.sponsor_decision_url, t.source, t)}
            </>
          )}
        </dd>
      </div>
    </dl>
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
        `${formattedDate(listing.work_start_date, locale, t)} – ${formattedDate(listing.work_end_date, locale, t)}`,
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
      <div className="card-top">
        <span className="season-tag">{listing.season_year}</span>
        <span>{plainText(listing.category)}</span>
      </div>
      <h3>
        <Link href={localePath(locale, `/jobs/${listing.id}`)}>
          {plainText(listing.role)}
        </Link>
      </h3>
      <p className="employer-line">
        {plainText(listing.employer_legal_name)} · {plainText(listing.city)},{" "}
        {plainText(listing.state)}
      </p>
      <span className="source-note">{t.fromEmployer}</span>
      <Conditions listing={listing} locale={locale} compact />
      <div className="card-footer">
        <span>
          {t.confirmed} {formattedDate(listing.last_confirmed_at, locale, t)}
        </span>
        <Link
          href={localePath(locale, `/jobs/${listing.id}`)}
          aria-label={`${t.conditions}: ${plainText(listing.role)}`}
        >
          →
        </Link>
      </div>
    </article>
  );
}

export function ContactAction({
  url,
  locale,
}: {
  url: string;
  locale: Locale;
}) {
  const t = getCopy(locale);
  const link = safeContact(url);
  if (!link) return <p className="notice">{t.unsafeContact}</p>;
  return (
    <details className="contact-action">
      <summary>
        {t.directContact}
        <span aria-hidden="true"> ↗</span>
      </summary>
      <div className="contact-reveal">
        <p>{t.contactIntro}</p>
        <p className="destination" dir="ltr">
          {link.destination}
        </p>
        <a
          href={link.href}
          target={
            link.kind === "web" || link.kind === "telegram"
              ? "_blank"
              : undefined
          }
          rel="noopener noreferrer"
        >
          {t.continue}
        </a>
      </div>
    </details>
  );
}

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
  count,
  locale,
}: {
  items: Review[];
  count: number;
  locale: Locale;
}) {
  const t = getCopy(locale);
  return (
    <section className="reviews" aria-labelledby="reviews-heading">
      <h2 id="reviews-heading">{t.reviews}</h2>
      <p>
        {t.reviewCount}: {count}
      </p>
      {items.length === 0 ? (
        <p>{t.reviewsEmpty}</p>
      ) : (
        <div className="review-grid">
          {items.map((item) => (
            <article className="review" key={item.id}>
              <p className="eyebrow">
                {item.season_year} ·{" "}
                {formattedDate(item.submitted_at, locale, t)} · {t.selfReported}
              </p>
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
              <ReportForm itemType="review" itemId={item.id} locale={locale} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
