"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { getCopy, intlLocale, localePath, type Locale } from "@/lib/copy";
import type { SearchFilters } from "@/lib/directory";
import { useFocusMode } from "@/lib/focus-mode";
import { morph } from "@/lib/motion";
import { Calendar } from "@/components/calendar";
import { FocusDone } from "@/components/focus-done";
import { Sheet, useSheet } from "@/components/sheet";

type DateKey = "start_from" | "end_by";
type ChoiceKey =
  | "season"
  | "category"
  | "currency"
  | "wage_basis"
  | "housing_known"
  | "confirmed_within_days"
  | "favourites";
type Panel = DateKey | ChoiceKey;

function isDate(panel: Panel): panel is DateKey {
  return panel === "start_from" || panel === "end_by";
}

export function JobFilters({
  locale,
  filters,
}: {
  locale: Locale;
  filters: SearchFilters;
}) {
  const t = getCopy(locale);
  const sheet = useSheet();
  const dialog = sheet.ref;
  const tools = useRef<HTMLDivElement>(null);
  const desktopFilters = useRef<HTMLElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(filters.q);
  const [dates, setDates] = useState<Record<DateKey, string>>({
    start_from: filters.start_from,
    end_by: filters.end_by,
  });
  const [choices, setChoices] = useState<Record<ChoiceKey, string>>({
    season: filters.season,
    category: filters.category,
    currency: filters.wage_currency || "USD",
    wage_basis: filters.wage_basis || "hour",
    housing_known: filters.housing_known,
    confirmed_within_days: filters.confirmed_within_days,
    favourites: filters.favourites,
  });
  const [panel, setPanel] = useState<Panel | null>(null);
  const [desktopPanel, setDesktopPanel] = useState<Panel | null>(null);
  const [desktopFiltersOpen, setDesktopFiltersOpen] = useState(true);
  useFocusMode(tools, undefined, { layout: "css" });
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
    filters.favourites,
  ].filter(Boolean).length;
  const labels: Record<Panel, string> = {
    season: t.season,
    category: t.category,
    start_from: t.startFrom,
    end_by: t.endBy,
    currency: t.currency,
    wage_basis: t.payBasis,
    housing_known: t.housingKnown,
    confirmed_within_days: t.freshness,
    favourites: t.favourites,
  };
  const options: Record<ChoiceKey, [string, string][]> = {
    season: [
      ["", t.housingAny],
      ["2027", "2027"],
      ["2028", "2028"],
      ["2029", "2029"],
    ],
    category: [
      ["", t.housingAny],
      ["Hospitality", "Hospitality"],
      ["Retail", "Retail"],
      ["Food service", "Food service"],
      ["Recreation", "Recreation"],
      ["Housekeeping", "Housekeeping"],
    ],
    currency: [
      ["USD", "USD"],
      ["KZT", "KZT"],
      ["EUR", "EUR"],
    ],
    wage_basis: [
      ["hour", t.hour],
      ["day", t.day],
      ["week", t.week],
      ["month", t.month],
    ],
    housing_known: [
      ["", t.housingAny],
      ["true", t.housingKnownOption],
      ["false", t.housingUnknownOption],
    ],
    confirmed_within_days: [
      ["", t.freshnessAny],
      ["7", t.freshness7],
      ["3", t.freshness3],
    ],
    favourites: [
      ["", t.results],
      ["1", t.favourites],
    ],
  };
  const shortDate = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  useEffect(() => {
    if (!desktopPanel) return;

    function closePanel(event: PointerEvent) {
      if (!desktopFilters.current?.contains(event.target as Node))
        setDesktopPanel(null);
    }

    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setDesktopPanel(null);
    }

    document.addEventListener("pointerdown", closePanel);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closePanel);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [desktopPanel]);

  function focusPanelField(key: Panel) {
    dialog.current
      ?.querySelector<HTMLButtonElement>(`[data-panel-field="${key}"]`)
      ?.focus();
  }

  function showPanel(key: Panel | null) {
    const returning = panel;
    morph(dialog.current, () => flushSync(() => setPanel(key)));
    if (!key && returning) focusPanelField(returning);
    else if (key)
      dialog.current
        ?.querySelector<HTMLButtonElement>(
          isDate(key)
            ? ".calendar-grid [tabindex='0']"
            : ".choice-list [aria-pressed='true']",
        )
        ?.focus();
  }

  function chooseDate(key: DateKey, value: string) {
    morph(dialog.current, () =>
      flushSync(() => {
        setDates((current) => ({
          ...current,
          [key]: value,
          ...(key === "start_from" &&
          current.end_by &&
          value &&
          current.end_by < value
            ? { end_by: "" }
            : {}),
        }));
        setPanel(null);
      }),
    );
    focusPanelField(key);
  }

  function chooseOption(key: ChoiceKey, value: string) {
    morph(dialog.current, () =>
      flushSync(() => {
        setChoices((current) => ({ ...current, [key]: value }));
        setPanel(null);
      }),
    );
    focusPanelField(key);
  }

  function chooseDesktopDate(key: DateKey, value: string) {
    setDates((current) => ({
      ...current,
      [key]: value,
      ...(key === "start_from" &&
      current.end_by &&
      value &&
      current.end_by < value
        ? { end_by: "" }
        : {}),
    }));
    setDesktopPanel(null);
  }

  function chooseDesktopOption(key: ChoiceKey, value: string) {
    setChoices((current) => ({ ...current, [key]: value }));
    setDesktopPanel(null);
  }

  function desktopPickerField(
    key: Panel,
    value: string,
    icon: "date" | "choice",
  ) {
    const inputName = key === "currency" ? "wage_currency" : key;
    const displayValue =
      icon === "date"
        ? value
          ? shortDate.format(new Date(`${value}T00:00:00Z`))
          : t.anyDate
        : options[key as ChoiceKey].find(([option]) => option === value)?.[1];

    return (
      <div
        className="desktop-picker-field"
        data-open={desktopPanel === key || undefined}
      >
        <span>{labels[key]}</span>
        <input type="hidden" name={inputName} value={value} />
        <button
          type="button"
          data-desktop-panel-field={key}
          aria-label={`${labels[key]}: ${displayValue}`}
          aria-expanded={desktopPanel === key}
          aria-haspopup={icon === "date" ? "dialog" : "listbox"}
          onClick={() =>
            setDesktopPanel((current) => (current === key ? null : key))
          }
        >
          <span data-empty={!value || undefined}>{displayValue}</span>
          <svg
            className={
              icon === "date" ? "picker-calendar-icon" : "picker-chevron-icon"
            }
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {icon === "date" ? (
              <>
                <rect x="4" y="5.5" width="16" height="14" rx="2.5" />
                <path d="M4 10h16M8.5 3.5v4m7-4v4" />
              </>
            ) : (
              <path d="m7 10 5 5 5-5" />
            )}
          </svg>
        </button>
        {desktopPanel === key && (
          <div
            className="desktop-picker-popover"
            role={icon === "date" ? "dialog" : undefined}
            aria-label={labels[key]}
          >
            {icon === "date" ? (
              <>
                <Calendar
                  locale={locale}
                  value={value}
                  min={key === "end_by" ? dates.start_from : undefined}
                  onSelect={(nextValue) =>
                    chooseDesktopDate(key as DateKey, nextValue)
                  }
                />
                {value && (
                  <button
                    type="button"
                    className="desktop-picker-clear"
                    onClick={() => chooseDesktopDate(key as DateKey, "")}
                  >
                    {t.clearDate}
                  </button>
                )}
              </>
            ) : (
              <div className="desktop-choice-list" role="listbox">
                {options[key as ChoiceKey].map(([option, optionLabel]) => (
                  <button
                    key={option}
                    type="button"
                    role="option"
                    aria-selected={value === option}
                    onClick={() =>
                      chooseDesktopOption(key as ChoiceKey, option)
                    }
                  >
                    <span>{optionLabel}</span>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m5 12.5 4.5 4.5L19 7.5" />
                    </svg>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function pickerField(key: Panel, value: string, icon: "date" | "choice") {
    return (
      <div className="picker-field" data-field data-morph key={key}>
        <span id={`${key}-label`}>{labels[key]}</span>
        <button
          type="button"
          data-panel-field={key}
          aria-labelledby={`${key}-label ${key}-value`}
          onClick={() => showPanel(key)}
        >
          <span id={`${key}-value`} data-empty={!value || undefined}>
            {icon === "date"
              ? value
                ? shortDate.format(new Date(`${value}T00:00:00Z`))
                : t.anyDate
              : options[key as ChoiceKey].find(
                  ([option]) => option === value,
                )?.[1]}
          </span>
          <svg
            className={
              icon === "date" ? "picker-calendar-icon" : "picker-chevron-icon"
            }
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {icon === "date" ? (
              <>
                <rect x="4" y="5.5" width="16" height="14" rx="2.5" />
                <path d="M4 10h16M8.5 3.5v4m7-4v4" />
              </>
            ) : (
              <path d="m7 10 5 5 5-5" />
            )}
          </svg>
        </button>
      </div>
    );
  }

  function favouriteToggle() {
    const active = choices.favourites === "1";
    return (
      <button
        type="button"
        className="favourite-filter-toggle"
        aria-pressed={active}
        onClick={(event) => {
          const next = active ? "" : "1";
          setChoices((current) => ({ ...current, favourites: next }));
          const field =
            event.currentTarget.form?.elements.namedItem("favourites");
          if (field instanceof HTMLInputElement) field.value = next;
          event.currentTarget.form?.requestSubmit();
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill={active ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m12 20-1.7-1.55C5.2 13.85 2 10.95 2 7.4A5.4 5.4 0 0 1 7.4 2c1.85 0 3.62.86 4.6 2.22A5.7 5.7 0 0 1 16.6 2 5.4 5.4 0 0 1 22 7.4c0 3.55-3.2 6.45-8.3 11.06Z" />
        </svg>
        {t.favourites}
      </button>
    );
  }

  return (
    <>
      <div className="job-tools" ref={tools}>
        <form
          className="job-search"
          action={localePath(locale)}
          method="get"
          role="search"
          data-field
        >
          <label className="sr-only" htmlFor="job-query">
            {t.search}
          </label>
          <input
            id="job-query"
            ref={searchInput}
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
              "favourites",
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
              <input
                type="hidden"
                name="wage_basis"
                value={filters.wage_basis}
              />
            </>
          )}
          <button
            type={query ? "button" : "submit"}
            aria-label={query ? t.clearSearch : t.search}
            data-clearing={Boolean(query) || undefined}
            onClick={
              query
                ? () => {
                    setQuery("");
                    searchInput.current?.focus();
                  }
                : undefined
            }
          >
            <svg
              className="search-icon"
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
            <svg
              className="clear-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </form>
        <button
          className="filter-trigger"
          type="button"
          aria-label={activeCount ? `${t.filters}: ${activeCount}` : t.filters}
          aria-controls="desktop-filters"
          aria-expanded={desktopFiltersOpen}
          onClick={() => {
            if (window.matchMedia("(min-width: 900px)").matches) {
              setDesktopFiltersOpen((open) => !open);
              setDesktopPanel(null);
            } else {
              sheet.open();
            }
          }}
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
        </button>
      </div>
      <aside
        id="desktop-filters"
        ref={desktopFilters}
        className="desktop-filters"
        data-open={desktopFiltersOpen}
        aria-labelledby="desktop-filter-title"
      >
        <form action={localePath(locale)} method="get">
          <div className="desktop-filter-head">
            <h2 id="desktop-filter-title">{t.filters}</h2>
            <div className="desktop-filter-head-actions">
              <a href={localePath(locale)}>{t.clear}</a>
            </div>
          </div>
          <div className="filter-favourite-row">{favouriteToggle()}</div>
          <input type="hidden" name="q" value={query} />
          <div className="desktop-filter-group">
            <label>
              {t.state}
              <input name="state" maxLength={80} defaultValue={filters.state} />
            </label>
            <label>
              {t.city}
              <input name="city" maxLength={120} defaultValue={filters.city} />
            </label>
            {desktopPickerField("season", choices.season, "choice")}
            {desktopPickerField("category", choices.category, "choice")}
          </div>
          <div className="desktop-filter-group">
            <p>{t.dates}</p>
            {desktopPickerField("start_from", dates.start_from, "date")}
            {desktopPickerField("end_by", dates.end_by, "date")}
          </div>
          <div className="desktop-filter-group">
            <p>{t.pay}</p>
            <label>
              {t.minPay}
              <input
                name="min_wage"
                type="number"
                inputMode="decimal"
                min="0"
                max="99999999"
                step="0.01"
                defaultValue={filters.min_wage}
              />
            </label>
            <div className="desktop-filter-row">
              {desktopPickerField("currency", choices.currency, "choice")}
              {desktopPickerField("wage_basis", choices.wage_basis, "choice")}
            </div>
            <label>
              {t.minHours}
              <input
                name="min_hours"
                type="number"
                inputMode="decimal"
                min="0"
                max="168"
                step="0.5"
                defaultValue={filters.min_hours}
              />
            </label>
          </div>
          <div className="desktop-filter-group">
            <input type="hidden" name="favourites" value={choices.favourites} />
            {desktopPickerField(
              "housing_known",
              choices.housing_known,
              "choice",
            )}
            {desktopPickerField(
              "confirmed_within_days",
              choices.confirmed_within_days,
              "choice",
            )}
          </div>
          <button className="desktop-filter-submit" type="submit">
            {t.apply}
          </button>
        </form>
      </aside>
      <Sheet
        sheet={sheet}
        className="filter-dialog"
        titleId="filter-title"
        title={panel ? labels[panel] : t.filters}
        onEscape={() => {
          if (!panel) return false;
          showPanel(null);
          return true;
        }}
        onClosed={() => setPanel(null)}
      >
        <form action={localePath(locale)} method="get">
          {!panel && (
            <div className="filter-favourite-row" data-focus-hide data-morph>
              {favouriteToggle()}
            </div>
          )}
          <input type="hidden" name="q" value={query} />
          <input type="hidden" name="start_from" value={dates.start_from} />
          <input type="hidden" name="end_by" value={dates.end_by} />
          {(Object.keys(choices) as ChoiceKey[]).map((key) => (
            <input
              key={key}
              type="hidden"
              name={key === "currency" ? "wage_currency" : key}
              value={choices[key]}
            />
          ))}
          {panel && isDate(panel) && (
            <Calendar
              key={panel}
              locale={locale}
              value={dates[panel]}
              min={panel === "end_by" ? dates.start_from : undefined}
              onSelect={(value) => chooseDate(panel, value)}
            />
          )}
          {panel && !isDate(panel) && (
            <div
              className="choice-list"
              role="group"
              aria-labelledby="filter-title"
              data-morph
            >
              {options[panel].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={choices[panel] === value}
                  onClick={() => chooseOption(panel, value)}
                >
                  <span className="choice-label">{label}</span>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                </button>
              ))}
            </div>
          )}
          {panel && (
            <div className="filter-actions" data-morph>
              {isDate(panel) ? (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => chooseDate(panel, "")}
                  disabled={!dates[panel]}
                >
                  {t.clearDate}
                </button>
              ) : null}
              <button
                type="button"
                className="panel-done"
                onClick={() => showPanel(null)}
              >
                {t.done}
              </button>
            </div>
          )}
          <div className="filter-fields" hidden={Boolean(panel)}>
            <label data-field data-morph>
              {t.state}
              <input name="state" maxLength={80} defaultValue={filters.state} />
            </label>
            <label data-field data-morph>
              {t.city}
              <input name="city" maxLength={120} defaultValue={filters.city} />
            </label>
            {pickerField("season", choices.season, "choice")}
            {pickerField("category", choices.category, "choice")}
            {pickerField("start_from", dates.start_from, "date")}
            {pickerField("end_by", dates.end_by, "date")}
            <label data-field data-morph>
              {t.minPay}
              <input
                name="min_wage"
                type="number"
                inputMode="decimal"
                min="0"
                max="99999999"
                step="0.01"
                defaultValue={filters.min_wage}
              />
            </label>
            {pickerField("currency", choices.currency, "choice")}
            {pickerField("wage_basis", choices.wage_basis, "choice")}
            <label data-field data-morph>
              {t.minHours}
              <input
                name="min_hours"
                type="number"
                inputMode="decimal"
                min="0"
                max="168"
                step="0.5"
                defaultValue={filters.min_hours}
              />
            </label>
            {pickerField("housing_known", choices.housing_known, "choice")}
            {pickerField(
              "confirmed_within_days",
              choices.confirmed_within_days,
              "choice",
            )}
          </div>
          {!panel && (
            <>
              <div className="filter-actions" data-focus-hide data-morph>
                <a href={localePath(locale)}>{t.clear}</a>
                <button type="submit">{t.apply}</button>
              </div>
              <FocusDone label={t.done} className="filter-actions" />
            </>
          )}
        </form>
      </Sheet>
    </>
  );
}
