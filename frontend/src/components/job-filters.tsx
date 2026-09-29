"use client";

import { useRef, useState } from "react";
import { getCopy, localePath, type Locale } from "@/lib/copy";
import type { SearchFilters } from "@/lib/directory";

export function JobFilters({
  locale,
  filters,
}: {
  locale: Locale;
  filters: SearchFilters;
}) {
  const t = getCopy(locale);
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState(filters.q);
  const activeCount = [
    filters.state,
    filters.city,
    filters.season,
    filters.category,
    filters.start_from,
    filters.end_by,
    filters.min_wage,
    filters.min_hours,
    filters.housing_known,
    filters.confirmed_within_days,
  ].filter(Boolean).length;

  return (
    <div className="job-tools">
      <form
        className="job-search"
        action={localePath(locale)}
        method="get"
        role="search"
      >
        <label className="sr-only" htmlFor="job-query">
          {t.search}
        </label>
        <input
          id="job-query"
          name="q"
          type="search"
          maxLength={80}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.searchPlaceholder}
        />
        {(
          [
            "state",
            "city",
            "season",
            "category",
            "start_from",
            "end_by",
            "min_wage",
            "min_hours",
            "housing_known",
            "confirmed_within_days",
          ] as const
        ).map((key) =>
          filters[key] ? (
            <input key={key} type="hidden" name={key} value={filters[key]} />
          ) : null,
        )}
        {filters.min_wage && (
          <>
            <input
              type="hidden"
              name="wage_currency"
              value={filters.wage_currency}
            />
            <input type="hidden" name="wage_basis" value={filters.wage_basis} />
          </>
        )}
        <button type="submit" aria-label={t.search}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m16 16 5 5" />
          </svg>
        </button>
      </form>
      <button
        className="filter-trigger"
        type="button"
        onClick={() => dialog.current?.showModal()}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 7h16M7 12h10m-7 5h4" />
        </svg>
        {t.filters}
        {activeCount > 0 && <span>{activeCount}</span>}
      </button>
      <dialog
        className="filter-dialog"
        ref={dialog}
        aria-labelledby="filter-title"
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current.close();
        }}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="filter-dialog-head">
          <h2 id="filter-title">{t.filters}</h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label={t.cancel}
          >
            ×
          </button>
        </div>
        <form action={localePath(locale)} method="get">
          <input type="hidden" name="q" value={query} />
          <div className="filter-fields">
            <label>
              {t.state}
              <input name="state" maxLength={80} defaultValue={filters.state} />
            </label>
            <label>
              {t.city}
              <input name="city" maxLength={120} defaultValue={filters.city} />
            </label>
            <label>
              {t.season}
              <input
                name="season"
                type="number"
                min="2020"
                max="2100"
                defaultValue={filters.season}
              />
            </label>
            <label>
              {t.category}
              <input
                name="category"
                maxLength={80}
                defaultValue={filters.category}
              />
            </label>
            <label>
              {t.startFrom}
              <input
                name="start_from"
                type="date"
                defaultValue={filters.start_from}
              />
            </label>
            <label>
              {t.endBy}
              <input name="end_by" type="date" defaultValue={filters.end_by} />
            </label>
            <label>
              {t.minPay}
              <input
                name="min_wage"
                type="number"
                min="0"
                max="99999999"
                step="0.01"
                defaultValue={filters.min_wage}
              />
            </label>
            <label>
              {t.currency}
              <input
                name="wage_currency"
                maxLength={3}
                pattern="[A-Z]{3}"
                defaultValue={filters.wage_currency}
              />
            </label>
            <label>
              {t.payBasis}
              <select name="wage_basis" defaultValue={filters.wage_basis}>
                <option value="hour">{t.hour}</option>
                <option value="day">{t.day}</option>
                <option value="week">{t.week}</option>
                <option value="month">{t.month}</option>
              </select>
            </label>
            <label>
              {t.minHours}
              <input
                name="min_hours"
                type="number"
                min="0"
                max="168"
                step="0.5"
                defaultValue={filters.min_hours}
              />
            </label>
            <label>
              {t.housingKnown}
              <select name="housing_known" defaultValue={filters.housing_known}>
                <option value="">{t.housingAny}</option>
                <option value="true">{t.housingKnownOption}</option>
                <option value="false">{t.housingUnknownOption}</option>
              </select>
            </label>
            <label>
              {t.freshness}
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
          <div className="filter-actions">
            <a href={localePath(locale)}>{t.clear}</a>
            <button type="submit">{t.apply}</button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
