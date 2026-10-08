"use client";

import Link from "next/link";
import type { Locale } from "@/lib/copy";
import type { Listing } from "@/lib/directory";
import { ContactAction } from "@/components/contact-sheet";
import { dateRange } from "@/components/presentation";
import { fill, getCopy, localePath } from "@/lib/copy";
import { plainText } from "@/lib/directory";

function amount(
  value: string | null,
  currency: string | null,
  basis: string | null,
  locale: Locale,
) {
  const t = getCopy(locale);
  if (!value || !currency || !basis) return t.unknown;
  const basisLabel =
    basis === "season"
      ? t.seasonBasis
      : t[basis as "hour" | "day" | "week" | "month"];
  return `${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency} / ${basisLabel}`;
}

export function DesktopListingPreviewInteractive({
  listing,
  locale,
}: {
  listing: Listing;
  locale: Locale;
}) {
  const t = getCopy(locale);
  return (
    <aside className="desktop-listing-preview" aria-label={t.viewDetails}>
      <div className="desktop-preview-head">
        <p>{plainText(listing.employer_legal_name)}</p>
        <h2>{plainText(listing.role)}</h2>
        <p>
          {plainText(listing.city)}, {plainText(listing.state)},{" "}
          {fill(t.seasonYear, { year: listing.season_year })}
        </p>
        <strong>
          {amount(
            listing.wage_amount,
            listing.wage_currency,
            listing.wage_basis,
            locale,
          )}
        </strong>
      </div>
      <dl className="desktop-preview-facts">
        <div>
          <dt>{t.dates}</dt>
          <dd>
            {dateRange(
              listing.work_start_date,
              listing.work_end_date,
              locale,
              t,
            )}
          </dd>
        </div>
        <div>
          <dt>{t.housing}</dt>
          <dd>{plainText(listing.housing_description) || t.unknown}</dd>
        </div>
      </dl>
      <div className="desktop-preview-actions">
        <ContactAction
          url={listing.contact_url}
          website={listing.employer_official_website_url}
          locale={locale}
        />
        <Link
          href={localePath(locale, `/jobs/${listing.id}`)}
          className="details-toggle"
        >
          {t.viewDetails}
        </Link>
      </div>
    </aside>
  );
}
