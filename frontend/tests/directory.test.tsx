import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { getCopy, localePath } from "../src/lib/copy";
import {
  pageQuery,
  parseFilters,
  plainText,
  searchQuery,
  type Listing,
} from "../src/lib/directory";
import { miniAppLink, safeContact, startListing } from "../src/lib/links";
import {
  ContactAction,
  ListingCard,
  Reviews,
  TrustFacts,
} from "../src/components/presentation";
import { ReviewForm } from "../src/components/feedback";

const listing: Listing = {
  id: "11111111-1111-4111-8111-111111111111",
  season_year: 2027,
  employer_legal_name: "Demo Employer LLC",
  employer_official_website_url: "https://example.com",
  employer_identity_status: "not_checked",
  employer_identity_checked_at: null,
  employer_identity_public_source_url: null,
  state: "New York",
  city: "Albany",
  location_timezone: "America/New_York",
  category: "Hospitality",
  role: "Front desk &lt;script&gt;alert(1)&lt;/script&gt;",
  duties: null,
  official_source_url: "https://example.com/job",
  contact_url: "https://example.com/apply",
  work_start_date: null,
  work_end_date: null,
  wage_amount: "16.50",
  wage_currency: "USD",
  wage_basis: "hour",
  expected_hours_per_week: "35",
  housing_description: null,
  housing_cost_amount: null,
  housing_cost_currency: null,
  housing_cost_basis: null,
  transport_description: null,
  sponsor_route_status: "reported",
  sponsor_route_source_url: "https://example.com/job",
  sponsor_approval_status: "unknown",
  sponsor_name: "Demo Sponsor",
  sponsor_decision_url: null,
  sponsor_decision_at: null,
  last_confirmed_at: "2026-09-27T10:00:00Z",
};

describe("public search and rendering", () => {
  it("shows review count and date without an employer score", () => {
    const html = renderToStaticMarkup(
      <Reviews
        count={1}
        locale="ru"
        feedbackEnabled
        items={[
          {
            id: "22222222-2222-4222-8222-222222222222",
            season_year: 2027,
            role: "Front desk",
            submitted_at: "2026-09-27T10:00:00Z",
            pay_match: "yes",
            pay_clarity: "clear",
            hours_match: "no",
            housing_match: "unknown",
            transport_match: "not_applicable",
            text: "Short factual account",
            label: "self-reported experience",
          },
        ]}
      />,
    );
    expect(html).toContain("Одобренных отзывов: 1");
    expect(html).toContain("Front desk");
    expect(html).toContain("Short factual account");
    expect(html).toContain("Сообщить о проблеме");
    expect(html).not.toContain("rating");
  });

  it("offers a bounded localized review form", () => {
    const html = renderToStaticMarkup(
      <ReviewForm
        listingId={listing.id}
        seasonYear={2027}
        exampleRole="Front desk"
        locale="kk"
      />,
    );
    expect(html).toContain("Тәжірибеңізбен бөлісіңіз");
    expect(html).toContain('maxLength="500"');
    expect(html).toContain('name="consent"');
    expect(html).not.toContain('name="email"');
  });
  it("sends only bounded supported filters and comparable pay", () => {
    const filters = parseFilters({
      q: "desk",
      min_wage: "16",
      wage_currency: "USD",
      wage_basis: "hour",
      housing_known: "true",
      page: "2",
      admin: "true",
    });
    const query = searchQuery(filters);
    expect(query.get("q")).toBe("desk");
    expect(query.get("min_wage")).toBe("16");
    expect(query.get("wage_currency")).toBe("USD");
    expect(query.get("housing_known")).toBe("true");
    expect(query.get("page_size")).toBe("12");
    expect(query.has("admin")).toBe(false);
    expect(pageQuery(filters, 3)).toContain("page=3");
    const reversed = parseFilters({
      start_from: "2027-09-01",
      end_by: "2027-05-01",
    });
    expect(searchQuery(reversed).get("end_by")).toBe("2027-05-01");
  });

  it("renders unknown material terms and employer text as text", () => {
    const html = renderToStaticMarkup(
      <ListingCard listing={listing} locale="ru" />,
    );
    expect(html).toContain("Не указано");
    expect(html).toContain("16.50 USD / час");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(plainText("A &amp; B")).toBe("A & B");
  });

  it("keeps each trust fact distinct", () => {
    const html = renderToStaticMarkup(
      <TrustFacts listing={listing} locale="kk" />,
    );
    expect(html).toContain(getCopy("kk").identityNotChecked);
    expect(html).toContain(getCopy("kk").routeReportedGeneric);
    expect(html).toContain(getCopy("kk").approvalUnknown);
    expect(html).not.toContain(getCopy("kk").approvalConfirmed);
  });

  it("localizes platform paths and reveals the destination before the contact link", () => {
    expect(localePath("ru", `/jobs/${listing.id}`)).toBe(
      `/ru/jobs/${listing.id}`,
    );
    expect(localePath("en", `/jobs/${listing.id}`)).toBe(`/jobs/${listing.id}`);
    const html = renderToStaticMarkup(
      <ContactAction url={listing.contact_url} locale="ru" />,
    );
    expect(html).toContain("https://example.com/apply");
    expect(html).toContain(getCopy("ru").contactIntro);
  });
});

describe("outbound links", () => {
  it("rejects executable, malformed, and redirect-shaped Telegram URLs", () => {
    for (const value of [
      "javascript:alert(1)",
      "data:text/html,hi",
      "http://example.com",
      "https://user:pass@example.com",
      "https://t.me/a",
      "https://t.me/validuser?url=https://evil.example",
      "mailto:a@example.com?body=unsafe",
    ])
      expect(safeContact(value)).toBeNull();
    expect(safeContact("https://t.me/validuser")?.kind).toBe("telegram");
    expect(safeContact("mailto:jobs@example.com")?.kind).toBe("email");
    expect(safeContact("tel:+15551234567")?.kind).toBe("phone");
  });

  it("accepts only a listing id from a Telegram start parameter", () => {
    expect(startListing(`job_${listing.id}`)).toBe(listing.id);
    expect(startListing("job_javascript:alert(1)")).toBeNull();
    expect(miniAppLink(listing.id)).toBeNull();
    process.env.TELEGRAM_BOT_USERNAME = "DemoDirectoryBot";
    process.env.TELEGRAM_APP_SHORT_NAME = "directory";
    expect(miniAppLink(listing.id)).toBe(
      `https://t.me/DemoDirectoryBot/directory?startapp=job_${listing.id}`,
    );
    delete process.env.TELEGRAM_BOT_USERNAME;
    delete process.env.TELEGRAM_APP_SHORT_NAME;
  });
});
