import Link from "next/link";
import { redirect } from "next/navigation";
import type { Locale } from "@/lib/copy";
import { fill, getCopy, localePath } from "@/lib/copy";
import {
  getListing,
  getReviews,
  listListings,
  listLocations,
  pageQuery,
  parseFilters,
  plainText,
  searchQuery,
  type SearchInput,
} from "@/lib/directory";
import { miniAppLink, startListing, startPortal } from "@/lib/links";
import { ReportForm, ReviewForm } from "@/components/feedback";
import { ChevronIcon, ExternalIcon } from "@/components/icons";
import { LinkPending } from "@/components/link-pending";
import { JobFilters } from "@/components/job-filters";
import { DesktopDirectoryResults } from "@/components/desktop-directory-results";
import { FavouriteButton } from "@/components/favorite";
import {
  amount,
  Conditions,
  ContactAction,
  dateRange,
  formattedDate,
  Reviews,
  TrustFacts,
} from "@/components/presentation";

export async function DirectoryPage({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: SearchInput;
}) {
  const start = startListing(searchParams.tgWebAppStartParam);
  if (start) redirect(localePath(locale, `/jobs/${start}`));
  const portal = startPortal(searchParams.tgWebAppStartParam);
  if (portal) redirect(portal);
  const t = getCopy(locale);
  const filters = parseFilters(searchParams);
  const currentParams = searchQuery(filters);
  currentParams.delete("page_size");
  const path =
    currentParams.toString() === "page=1" ? "/" : `/?${currentParams}`;
  const [result, locations] = await Promise.all([
    listListings(filters),
    listLocations(),
  ]);
  const hasFilters = Boolean(
    filters.q ||
    filters.season ||
    filters.state ||
    filters.city ||
    filters.category ||
    filters.start_from ||
    filters.end_by ||
    filters.min_wage ||
    filters.min_hours ||
    filters.housing_known ||
    filters.confirmed_within_days ||
    filters.favourites ||
    Number(filters.page) > 1,
  );
  return (
    <div className="content-wrap directory-page">
      <h1 id="results-heading" className="sr-only">
        {t.results}
      </h1>
      <JobFilters
        key={`${locale}:${currentParams}`}
        locale={locale}
        filters={filters}
        locations={locations}
      />
      <section
        id="results"
        className="results-section"
        aria-labelledby="results-heading"
      >
        {result.kind === "ok" ? (
          result.data.items.length ? (
            <>
              <DesktopDirectoryResults
                listings={result.data.items}
                locale={locale}
                favouritesOnly={filters.favourites === "1"}
                emptyLabel={t.noResults}
              >
                {(Number(filters.page) > 1 || result.data.has_more) && (
                  <nav className="pagination" aria-label={t.results}>
                    {Number(filters.page) > 1 && (
                      <Link
                        href={`${localePath(locale)}?${pageQuery(filters, Number(filters.page) - 1)}`}
                      >
                        <ChevronIcon direction="left" />
                        {t.previous}
                        <LinkPending skeleton="list" />
                      </Link>
                    )}
                    {result.data.has_more && (
                      <Link
                        href={`${localePath(locale)}?${pageQuery(filters, Number(filters.page) + 1)}`}
                      >
                        {t.next}
                        <ChevronIcon direction="right" />
                        <LinkPending skeleton="list" />
                      </Link>
                    )}
                  </nav>
                )}
              </DesktopDirectoryResults>
            </>
          ) : hasFilters ? (
            <div className="state-panel empty-feed">
              <h3>{t.noResults}</h3>
            </div>
          ) : (
            <div className="state-panel empty-feed">
              <h3>{t.noListings}</h3>
            </div>
          )
        ) : (
          <div className="state-panel error-state" role="alert">
            <span className="state-icon" aria-hidden="true">
              !
            </span>
            <h3>{result.kind === "invalid" ? t.invalidFilters : t.error}</h3>
            <p>
              {result.kind === "invalid" ? t.invalidFiltersText : t.errorText}
            </p>
            {result.kind !== "invalid" && (
              <a href={localePath(locale, path)}>{t.retry}</a>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export async function DetailPage({
  locale,
  id,
}: {
  locale: Locale;
  id: string;
}) {
  const t = getCopy(locale);
  const feedbackEnabled = process.env.FEEDBACK_ENABLED === "true";
  const path = `/jobs/${id}`;
  const result = await getListing(id);
  if (result.kind !== "ok") {
    const unavailable = result.kind === "unavailable";
    const stale = result.kind === "stale";
    const missing = result.kind === "missing";
    return (
      <div className="content-wrap detail-state">
        <Link className="back-link" href={localePath(locale)}>
          <ChevronIcon direction="left" />
          {t.back}
          <LinkPending skeleton="list" />
        </Link>
        <div className="state-panel" role={missing ? undefined : "alert"}>
          <span className="state-icon" aria-hidden="true">
            {unavailable || stale ? "⌛" : missing ? "◇" : "!"}
          </span>
          <h1>
            {stale
              ? t.stale
              : unavailable
                ? t.unavailable
                : missing
                  ? t.missing
                  : t.error}
          </h1>
          <p>
            {stale
              ? t.staleText
              : unavailable
                ? t.unavailableText
                : missing
                  ? t.missingText
                  : t.errorText}
          </p>
          {feedbackEnabled &&
            (stale || unavailable) &&
            /^[0-9a-f-]{36}$/i.test(id) && (
              <ReportForm itemType="listing" itemId={id} locale={locale} />
            )}
          <Link href={localePath(locale)}>{t.browse}</Link>
        </div>
      </div>
    );
  }
  const listing = result.data;
  const reviews = await getReviews(id);
  const telegram = miniAppLink(id);
  return (
    <div className="content-wrap detail-wrap">
      <Link className="back-link" href={localePath(locale)}>
        <ChevronIcon direction="left" />
        {t.back}
        <LinkPending skeleton="list" />
      </Link>
      <div className="detail-layout">
        <div className="detail-main">
          <div className="detail-head">
            <div>
              <p className="detail-employer">
                {plainText(listing.employer_legal_name)}
              </p>
              <h1>{plainText(listing.role)}</h1>
              <p className="detail-place">
                <span>
                  {plainText(listing.city)}, {plainText(listing.state)}
                </span>
                <span>{fill(t.seasonYear, { year: listing.season_year })}</span>
              </p>
              <span className="source-note">{t.fromEmployer}</span>
            </div>
            <div className="detail-actions">
              <ContactAction
                url={listing.contact_url}
                website={listing.employer_official_website_url}
                locale={locale}
              />
              {telegram && (
                <a
                  className="telegram-link"
                  href={telegram}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t.telegram}
                  <ExternalIcon />
                </a>
              )}
            </div>
          </div>
          <section className="detail-card" aria-labelledby="conditions-heading">
            <h2 id="conditions-heading">{t.conditions}</h2>
            <Conditions listing={listing} locale={locale} />
          </section>
          <section className="detail-card detail-about">
            <div
              className="detail-about-section"
              aria-labelledby="duties-heading"
            >
              <h2 id="duties-heading">{t.role}</h2>
              <p>{plainText(listing.duties) || t.unknown}</p>
            </div>
            <div
              className="detail-about-section"
              aria-labelledby="evidence-heading"
            >
              <h2 id="evidence-heading">{t.evidence}</h2>
              <TrustFacts listing={listing} locale={locale} />
            </div>
          </section>
          {reviews.kind === "ok" && (
            <Reviews
              items={reviews.data.items}
              locale={locale}
              actions={
                feedbackEnabled && (
                  <>
                    <ReviewForm
                      listingId={listing.id}
                      seasonYear={listing.season_year}
                      exampleRole={plainText(listing.role) || ""}
                      locale={locale}
                    />
                    <ReportForm
                      itemType="listing"
                      itemId={listing.id}
                      locale={locale}
                      reviews={reviews.data.items.map((item, index) => ({
                        id: item.id,
                        label: fill(t.reportReview, {
                          n: index + 1,
                          role: plainText(item.role) || t.unknown,
                          date: formattedDate(item.submitted_at, locale, t),
                        }),
                      }))}
                    />
                  </>
                )
              }
            />
          )}
        </div>
        <aside className="detail-sidebar">
          <section className="detail-summary-card">
            <div className="detail-summary-pay">
              <span>{t.pay}</span>
              <strong>
                {amount(
                  listing.wage_amount,
                  listing.wage_currency,
                  listing.wage_basis,
                  t,
                )}
              </strong>
              <small>
                {listing.expected_hours_per_week
                  ? `${listing.expected_hours_per_week} ${t.hours.toLowerCase()}`
                  : t.unknown}
              </small>
            </div>
            <dl className="detail-summary-facts">
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
            <div className="detail-summary-actions">
              <ContactAction
                url={listing.contact_url}
                website={listing.employer_official_website_url}
                locale={locale}
              />
              <FavouriteButton listingId={listing.id} locale={locale} />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
