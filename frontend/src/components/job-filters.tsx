"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { flushSync } from "react-dom";
import { getCopy, intlLocale, localePath, type Locale } from "@/lib/copy";
import type { SearchFilters } from "@/lib/directory";
import { useFocusMode } from "@/lib/focus-mode";
import { morph, reducedMotion } from "@/lib/motion";
import { Calendar } from "@/components/calendar";

type DateKey = "start_from" | "end_by";

export function JobFilters({
  locale,
  filters,
}: {
  locale: Locale;
  filters: SearchFilters;
}) {
  const t = getCopy(locale);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const tools = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(filters.q);
  const [dates, setDates] = useState<Record<DateKey, string>>({
    start_from: filters.start_from,
    end_by: filters.end_by,
  });
  const [calendar, setCalendar] = useState<DateKey | null>(null);
  useFocusMode(tools);
  useFocusMode(dialog, dialog);
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
  const dateLabels: Record<DateKey, string> = {
    start_from: t.startFrom,
    end_by: t.endBy,
  };
  const shortDate = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  useEffect(() => {
    // the sheet opens on its title so a phone keyboard stays closed
    title.current?.setAttribute("autofocus", "");
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    const node = dialog.current;
    if (!viewport || !node) return;
    const update = () =>
      node.style.setProperty(
        "--keyboard",
        `${Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop))}px`,
      );
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  function openSheet() {
    const node = dialog.current;
    if (!node || node.open) return;
    node.showModal();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        node.dataset.visible = "";
      }),
    );
  }

  function closeSheet() {
    const node = dialog.current;
    if (!node?.open || "closing" in node.dataset) return;
    node.dataset.closing = "";
    delete node.dataset.visible;
    window.setTimeout(() => node.close(), reducedMotion() ? 0 : 340);
  }

  function showCalendar(key: DateKey | null) {
    const returning = calendar;
    morph(dialog.current, () => flushSync(() => setCalendar(key)));
    if (!key && returning)
      dialog.current
        ?.querySelector<HTMLButtonElement>(`[data-date-field="${returning}"]`)
        ?.focus();
    else if (key)
      dialog.current
        ?.querySelector<HTMLButtonElement>(".calendar-grid [tabindex='0']")
        ?.focus();
  }

  function chooseDate(key: DateKey, value: string) {
    const returning = key;
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
        setCalendar(null);
      }),
    );
    dialog.current
      ?.querySelector<HTMLButtonElement>(`[data-date-field="${returning}"]`)
      ?.focus();
  }

  function startDrag(event: ReactPointerEvent<HTMLElement>) {
    const node = dialog.current;
    if (!node || event.button !== 0) return;
    const handle = event.currentTarget;
    const startY = event.clientY;
    const startTime = performance.now();
    let distance = 0;
    handle.setPointerCapture(event.pointerId);
    node.dataset.dragging = "";
    const move = (moveEvent: PointerEvent) => {
      distance = Math.max(0, moveEvent.clientY - startY);
      node.style.transform = `translateY(${distance}px)`;
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      delete node.dataset.dragging;
      node.style.removeProperty("transform");
      const speed = distance / Math.max(1, performance.now() - startTime);
      if (distance > 90 || (distance > 24 && speed > 0.6)) closeSheet();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
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
              <input
                type="hidden"
                name="wage_basis"
                value={filters.wage_basis}
              />
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
          aria-label={activeCount ? `${t.filters}: ${activeCount}` : t.filters}
          aria-haspopup="dialog"
          onClick={openSheet}
          data-focus-hide
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
          {activeCount > 0 && <span aria-hidden="true">{activeCount}</span>}
        </button>
      </div>
      <dialog
        className="filter-dialog"
        ref={dialog}
        aria-labelledby="filter-title"
        onClick={(event) => {
          if (event.target === dialog.current) closeSheet();
        }}
        onCancel={(event) => {
          event.preventDefault();
          if (calendar) showCalendar(null);
          else closeSheet();
        }}
        onClose={() => {
          const node = dialog.current;
          if (!node) return;
          delete node.dataset.closing;
          delete node.dataset.visible;
          setCalendar(null);
        }}
      >
        <div className="sheet-grab" onPointerDown={startDrag}>
          <div className="sheet-handle" aria-hidden="true" />
          <h2
            id="filter-title"
            tabIndex={-1}
            ref={title}
            data-focus-hide
            data-morph
          >
            {calendar ? dateLabels[calendar] : t.filters}
          </h2>
        </div>
        <form action={localePath(locale)} method="get">
          <input type="hidden" name="q" value={query} />
          <input type="hidden" name="start_from" value={dates.start_from} />
          <input type="hidden" name="end_by" value={dates.end_by} />
          {calendar && (
            <>
              <Calendar
                key={calendar}
                locale={locale}
                value={dates[calendar]}
                min={calendar === "end_by" ? dates.start_from : undefined}
                onSelect={(value) => chooseDate(calendar, value)}
              />
              <div className="filter-actions" data-morph>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => chooseDate(calendar, "")}
                  disabled={!dates[calendar]}
                >
                  {t.clearDate}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => showCalendar(null)}
                >
                  {t.calendarBack}
                </button>
              </div>
            </>
          )}
          <div className="filter-fields" hidden={Boolean(calendar)}>
            <label data-field data-morph>
              {t.state}
              <input name="state" maxLength={80} defaultValue={filters.state} />
            </label>
            <label data-field data-morph>
              {t.city}
              <input name="city" maxLength={120} defaultValue={filters.city} />
            </label>
            <label data-field data-morph>
              {t.season}
              <input
                name="season"
                type="number"
                inputMode="numeric"
                min="2020"
                max="2100"
                defaultValue={filters.season}
              />
            </label>
            <label data-field data-morph>
              {t.category}
              <input
                name="category"
                maxLength={80}
                defaultValue={filters.category}
              />
            </label>
            {(["start_from", "end_by"] as const).map((key) => (
              <div className="date-field" data-field data-morph key={key}>
                <span id={`${key}-label`}>{dateLabels[key]}</span>
                <button
                  type="button"
                  data-date-field={key}
                  aria-labelledby={`${key}-label ${key}-value`}
                  onClick={() => showCalendar(key)}
                >
                  <span
                    id={`${key}-value`}
                    data-empty={!dates[key] || undefined}
                  >
                    {dates[key]
                      ? shortDate.format(new Date(`${dates[key]}T00:00:00Z`))
                      : t.anyDate}
                  </span>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <rect x="4" y="5.5" width="16" height="14" rx="2.5" />
                    <path d="M4 10h16M8.5 3.5v4m7-4v4" />
                  </svg>
                </button>
              </div>
            ))}
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
            <label data-field data-morph>
              {t.currency}
              <input
                name="wage_currency"
                maxLength={3}
                pattern="[A-Z]{3}"
                autoCapitalize="characters"
                defaultValue={filters.wage_currency}
              />
            </label>
            <label data-field data-morph>
              {t.payBasis}
              <select name="wage_basis" defaultValue={filters.wage_basis}>
                <option value="hour">{t.hour}</option>
                <option value="day">{t.day}</option>
                <option value="week">{t.week}</option>
                <option value="month">{t.month}</option>
              </select>
            </label>
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
            <label data-field data-morph>
              {t.housingKnown}
              <select name="housing_known" defaultValue={filters.housing_known}>
                <option value="">{t.housingAny}</option>
                <option value="true">{t.housingKnownOption}</option>
                <option value="false">{t.housingUnknownOption}</option>
              </select>
            </label>
            <label data-field data-morph>
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
          {!calendar && (
            <>
              <div className="filter-actions" data-focus-hide data-morph>
                <a href={localePath(locale)}>{t.clear}</a>
                <button type="submit">{t.apply}</button>
              </div>
              <div className="filter-actions focus-done" data-morph>
                <button
                  type="button"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => {
                    const active = document.activeElement;
                    if (active instanceof HTMLElement) active.blur();
                  }}
                >
                  {t.done}
                </button>
              </div>
            </>
          )}
        </form>
      </dialog>
    </>
  );
}
