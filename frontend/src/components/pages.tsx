import Link from "next/link";
import { redirect } from "next/navigation";
import type { Locale } from "@/lib/copy";
import { getCopy, localePath } from "@/lib/copy";
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
import {
  Conditions,
  ContactAction,
  formattedDate,
  ListingCard,
  Reviews,
  SiteShell,
  TrustFacts,
} from "@/components/presentation";

function FilterForm({
  locale,
  filters,
}: {
  locale: Locale;
  filters: ReturnType<typeof parseFilters>;
}) {
  const t = getCopy(locale);
  return (
    <form className="filter-panel" method="get" action={localePath(locale)}>
      <div className="filter-heading">
        <h2>{t.filters}</h2>
        <Link href={localePath(locale)}>{t.clear}</Link>
      </div>
      <div className="filter-grid">
        <label className="field wide">
          <span>{t.search}</span>
          <input
            name="q"
            type="search"
            maxLength={80}
            defaultValue={filters.q}
            placeholder={t.searchPlaceholder}
          />
        </label>
        <label className="field">
          <span>{t.state}</span>
          <input name="state" maxLength={80} defaultValue={filters.state} />
        </label>
        <label className="field">
          <span>{t.city}</span>
          <input name="city" maxLength={120} defaultValue={filters.city} />
        </label>
        <label className="field">
          <span>{t.season}</span>
          <input
            name="season"
            type="number"
            min="2020"
            max="2100"
            defaultValue={filters.season}
          />
        </label>
        <label className="field">
          <span>{t.category}</span>
          <input
            name="category"
            maxLength={80}
            defaultValue={filters.category}
          />
        </label>
        <label className="field">
          <span>{t.startFrom}</span>
          <input
            name="start_from"
            type="date"
            defaultValue={filters.start_from}
          />
        </label>
        <label className="field">
          <span>{t.endBy}</span>
          <input name="end_by" type="date" defaultValue={filters.end_by} />
        </label>
        <label className="field">
          <span>{t.minPay}</span>
          <input
            name="min_wage"
            type="number"
            min="0"
            max="99999999"
            step="0.01"
            defaultValue={filters.min_wage}
          />
        </label>
        <label className="field">
          <span>{t.currency}</span>
          <input
            name="wage_currency"
            maxLength={3}
            pattern="[A-Z]{3}"
            defaultValue={filters.wage_currency}
          />
        </label>
        <label className="field">
          <span>{t.payBasis}</span>
          <select name="wage_basis" defaultValue={filters.wage_basis}>
            <option value="hour">{t.hour}</option>
            <option value="day">{t.day}</option>
            <option value="week">{t.week}</option>
            <option value="month">{t.month}</option>
          </select>
        </label>
        <label className="field">
          <span>{t.minHours}</span>
          <input
            name="min_hours"
            type="number"
            min="0"
            max="168"
            step="0.5"
            defaultValue={filters.min_hours}
          />
        </label>
        <label className="field">
          <span>{t.housingKnown}</span>
          <select name="housing_known" defaultValue={filters.housing_known}>
            <option value="">{t.housingAny}</option>
            <option value="true">{t.housingKnownOption}</option>
            <option value="false">{t.housingUnknownOption}</option>
          </select>
        </label>
        <label className="field">
          <span>{t.freshness}</span>
          <select
            name="confirmed_within_days"
            defaultValue={filters.confirmed_within_days}
          >
            <option value="">{t.freshnessAny}</option>
            <option value="7">{t.freshness7}</option>
            <option value="3">{t.freshness3}</option>
          </select>
        </label>
      </div>
      <button className="primary-button" type="submit">
        {t.apply}
        <span aria-hidden="true"> →</span>
      </button>
    </form>
  );
}

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
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-copy">
            <p className="eyebrow">{t.eyebrow}</p>
            <h1>{t.directory}</h1>
            <p>{t.intro}</p>
            <a className="hero-link" href="#results">
              {t.browse}
              <span aria-hidden="true"> ↓</span>
            </a>
          </div>
          <div className="hero-shape" aria-hidden="true">
            <div className="shape-top">SWT</div>
            <div className="shape-mid">
              {t.shapeFind}
              <br />
              {t.shapeRead}
              <br />
              {t.shapeContact}
            </div>
            <div className="shape-bottom">✳ &nbsp; {t.shapeFooter}</div>
          </div>
        </div>
      </section>
      <div className="content-wrap">
        <FilterForm locale={locale} filters={filters} />
        <section
          id="results"
          className="results-section"
          aria-labelledby="results-heading"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">01 / {t.browse}</p>
              <h2 id="results-heading">{t.results}</h2>
            </div>
            {result.kind === "ok" && (
              <span className="page-indicator">{result.data.page}</span>
            )}
          </div>
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
                      ← {t.previous}
                    </Link>
                  )}
                  {result.data.has_more && (
                    <Link
                      href={`${localePath(locale)}?${pageQuery(filters, Number(filters.page) + 1)}`}
                    >
                      {t.next} →
                    </Link>
                  )}
                </nav>
              </>
            ) : (
              <div className="state-panel">
                <span className="state-icon" aria-hidden="true">
                  ◇
                </span>
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
        <section className="explain-section">
          <span className="explain-mark" aria-hidden="true">
            ✳
          </span>
          <div>
            <p className="eyebrow">02 / iter</p>
            <h2>{t.howItWorks}</h2>
            <p>{t.howText}</p>
          </div>
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
            ← {t.back}
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
            {(stale || unavailable) && /^[0-9a-f-]{36}$/i.test(id) && (
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
          ← {t.back}
        </Link>
        <div className="detail-head">
          <div>
            <p className="eyebrow">
              {listing.season_year} · {plainText(listing.category)} ·{" "}
              {plainText(listing.city)}, {plainText(listing.state)}
            </p>
            <h1>{plainText(listing.role)}</h1>
            <p className="detail-employer">
              {plainText(listing.employer_legal_name)}
            </p>
            <span className="source-note">{t.fromEmployer}</span>
          </div>
          <div className="detail-actions">
            <ContactAction url={listing.contact_url} locale={locale} />
            {telegram && (
              <a
                className="telegram-link"
                href={telegram}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t.telegram} ↗
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
              <p className="eyebrow">01 / {t.conditions}</p>
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
              />
            )}
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
          </div>
          <aside className="evidence-panel" aria-labelledby="evidence-heading">
            <p className="eyebrow">02 / {t.evidence}</p>
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
                    {officialSource.destination} ↗
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
                    {employerSite.destination} ↗
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
