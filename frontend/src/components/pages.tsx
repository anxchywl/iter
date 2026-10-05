import Link from "next/link";
import { redirect } from "next/navigation";
import type { Locale } from "@/lib/copy";
import { fill, getCopy, localePath } from "@/lib/copy";
import {
  getListing,
  getReviews,
  listListings,
  pageQuery,
  parseFilters,
  plainText,
  searchQuery,
  type SearchInput,
} from "@/lib/directory";
import { miniAppLink, safeContact, startListing } from "@/lib/links";
import { ReportForm, ReviewForm } from "@/components/feedback";
import { ChevronIcon, ExternalIcon } from "@/components/icons";
import { LinkPending } from "@/components/link-pending";
import { JobFilters } from "@/components/job-filters";
import {
  Conditions,
  ContactAction,
  formattedDate,
  ListingCard,
  Reviews,
  SiteShell,
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
  const t = getCopy(locale);
  const filters = parseFilters(searchParams);
  const currentParams = searchQuery(filters);
  currentParams.delete("page_size");
  const path =
    currentParams.toString() === "page=1" ? "/" : `/?${currentParams}`;
  const result = await listListings(filters);
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
    Number(filters.page) > 1,
  );
  return (
    <SiteShell locale={locale} path={path}>
      <div className="content-wrap">
        <h1 className="feed-title">{t.results}</h1>
        <JobFilters
          key={`${locale}:${currentParams}`}
          locale={locale}
          filters={filters}
        />
        <section
          id="results"
          className="results-section"
          aria-labelledby="results-heading"
        >
          <h2 id="results-heading" className="sr-only">
            {t.results}
          </h2>
          {result.kind === "ok" ? (
            result.data.items.length ? (
              <>
                <div className="listing-grid">
                  {result.data.items.map((listing) => (
                    <ListingCard
                      key={listing.id}
                      listing={listing}
                      locale={locale}
                    />
                  ))}
                </div>
                <nav className="pagination" aria-label={t.results}>
                  {Number(filters.page) > 1 && (
                    <Link
                      href={`${localePath(locale)}?${pageQuery(filters, Number(filters.page) - 1)}`}
                    >
                      <ChevronIcon direction="left" />
                      {t.previous}
                      <LinkPending />
                    </Link>
                  )}
                  {result.data.has_more && (
                    <Link
                      href={`${localePath(locale)}?${pageQuery(filters, Number(filters.page) + 1)}`}
                    >
                      {t.next}
                      <ChevronIcon direction="right" />
                      <LinkPending />
                    </Link>
                  )}
                </nav>
              </>
            ) : (
              <div className="state-panel">
                <h3>{hasFilters ? t.noResults : t.noListings}</h3>
                <p>{hasFilters ? t.noResultsText : t.noListingsText}</p>
                {hasFilters && <Link href={localePath(locale)}>{t.clear}</Link>}
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
    </SiteShell>
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
      <SiteShell locale={locale} path={path}>
        <div className="content-wrap detail-state">
          <Link className="back-link" href={localePath(locale)}>
            <ChevronIcon direction="left" />
            {t.back}
            <LinkPending />
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
      </SiteShell>
    );
  }
  const listing = result.data;
  const reviews = await getReviews(id);
  const telegram = miniAppLink(id);
  const employerSite = safeContact(listing.employer_official_website_url);
  const officialSource = safeContact(listing.official_source_url);
  return (
    <SiteShell locale={locale} path={path}>
      <div className="content-wrap detail-wrap">
        <Link className="back-link" href={localePath(locale)}>
          <ChevronIcon direction="left" />
          {t.back}
          <LinkPending />
        </Link>
        <div className="detail-head">
          <div>
            <ul className="detail-tags">
              <li>{fill(t.seasonYear, { year: listing.season_year })}</li>
              <li>{plainText(listing.category)}</li>
              <li>
                {plainText(listing.city)}, {plainText(listing.state)}
              </li>
            </ul>
            <h1>{plainText(listing.role)}</h1>
            <p className="detail-employer">
              {plainText(listing.employer_legal_name)}
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
        <div className="detail-layout">
          <div className="detail-main">
            <section
              className="detail-section"
              aria-labelledby="conditions-heading"
            >
              <h2 id="conditions-heading">{t.conditions}</h2>
              <Conditions listing={listing} locale={locale} />
              <div className="duties">
                <h3>{t.role}</h3>
                <p>{plainText(listing.duties) || t.unknown}</p>
              </div>
              <p className="subtle">{t.noGuarantee}</p>
            </section>
            {reviews.kind === "ok" && (
              <Reviews
                items={reviews.data.items}
                count={reviews.data.count}
                locale={locale}
                feedbackEnabled={feedbackEnabled}
              />
            )}
            {feedbackEnabled && (
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
                />
              </>
            )}
          </div>
          <aside className="evidence-panel" aria-labelledby="evidence-heading">
            <h2 id="evidence-heading">{t.evidence}</h2>
            <TrustFacts listing={listing} locale={locale} />
            <div className="evidence-links">
              <div>
                <span>{t.source}</span>
                {officialSource && (
                  <a
                    href={officialSource.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {officialSource.destination}
                    <ExternalIcon />
                  </a>
                )}
              </div>
              <div>
                <span>{t.employerSite}</span>
                {employerSite && (
                  <a
                    href={employerSite.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {employerSite.destination}
                    <ExternalIcon />
                  </a>
                )}
              </div>
              <div>
                <span>{t.timezone}</span>
                <strong>{listing.location_timezone || t.unknown}</strong>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </SiteShell>
  );
}
