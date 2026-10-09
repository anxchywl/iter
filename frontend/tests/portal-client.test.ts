import { describe, expect, it } from "vitest";
import {
  companyErrors,
  listingErrors,
  urlProblem,
} from "../src/lib/portal-client";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const listing = {
  employer_id: "employer-1",
  source_identifier: "role-1",
  season_year: "2027",
  role: "Cook",
  state: "Maine",
  city: "Portland",
  location_timezone: "America/New_York",
  category: "Food service",
  official_source_url: "https://example.com/jobs/cook",
  contact_url: "https://example.com/apply",
};

describe("operator form validation", () => {
  it("accepts only public https links, like the server", () => {
    expect(urlProblem("https://example.com/jobs")).toBeNull();
    expect(urlProblem("")).toBe("Enter a link.");
    expect(urlProblem("example.com")).toMatch(/full link/);
    expect(urlProblem("http://example.com")).toMatch(/https/);
    expect(urlProblem("https://127.0.0.1/jobs")).toMatch(/IP address/);
    expect(urlProblem("https://[::1]/jobs")).toMatch(/IP address/);
    expect(urlProblem("https://intranet/jobs")).toMatch(/public/);
    expect(urlProblem("https://printer.local/jobs")).toMatch(/public/);
    expect(urlProblem("https://user:pass@example.com")).toMatch(/public/);
  });

  it("flags each invalid vacancy field by name", () => {
    expect(listingErrors(form(listing))).toEqual({});
    const errors = listingErrors(
      form({
        ...listing,
        role: " ",
        season_year: "1999",
        contact_url: "http://example.com",
        work_start_date: "2027-08-01",
        work_end_date: "2027-06-01",
        wage_amount: "15",
        wage_currency: "usd",
      }),
    );
    expect(Object.keys(errors).sort()).toEqual([
      "contact_url",
      "role",
      "season_year",
      "wage_currency",
      "work_end_date",
    ]);
  });

  it("requires a complete company profile", () => {
    expect(
      companyErrors(
        form({
          name: "Agency",
          website_url: "https://agency.example.com",
          address: "1 Main Street",
        }),
      ),
    ).toEqual({});
    expect(
      Object.keys(
        companyErrors(form({ name: "", website_url: "", address: "" })),
      ),
    ).toEqual(["name", "website_url", "address"]);
  });
});
