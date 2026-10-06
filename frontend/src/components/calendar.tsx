"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { getCopy, intlLocale, type Locale } from "@/lib/copy";
import { ChevronIcon } from "@/components/icons";

type Day = { year: number; month: number; day: number };

function parse(value: string): Day | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match
    ? { year: +match[1], month: +match[2] - 1, day: +match[3] }
    : null;
}

function iso({ year, month, day }: Day): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shift(day: Day, days: number): Day {
  const date = new Date(Date.UTC(day.year, day.month, day.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
  };
}

function today(): Day {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
}

export function Calendar({
  locale,
  value,
  min,
  onSelect,
}: {
  locale: Locale;
  value: string;
  min?: string;
  onSelect: (value: string) => void;
}) {
  const t = getCopy(locale);
  const tag = intlLocale(locale);
  const initial = parse(value) ?? parse(min ?? "") ?? today();
  const [focus, setFocus] = useState<Day>(initial);
  const [direction, setDirection] = useState<"next" | "previous" | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const keyboard = useRef(false);
  const weekStart = locale === "en" ? 0 : 1;
  const first = new Date(Date.UTC(focus.year, focus.month, 1)).getUTCDay();
  const lead = (first - weekStart + 7) % 7;
  const length = new Date(
    Date.UTC(focus.year, focus.month + 1, 0),
  ).getUTCDate();
  const now = iso(today());
  const month = new Intl.DateTimeFormat(tag, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(focus.year, focus.month, 1)));
  const title = month.charAt(0).toLocaleUpperCase(tag) + month.slice(1);
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(tag, { weekday: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(2024, 0, 7 + weekStart + index)),
    ),
  );
  const full = new Intl.DateTimeFormat(tag, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  useEffect(() => {
    if (!keyboard.current) return;
    keyboard.current = false;
    grid.current
      ?.querySelector<HTMLButtonElement>(`[data-date="${iso(focus)}"]`)
      ?.focus();
  }, [focus]);

  function move(next: Day) {
    if (next.month !== focus.month || next.year !== focus.year)
      setDirection(
        next.year * 12 + next.month > focus.year * 12 + focus.month
          ? "next"
          : "previous",
      );
    setFocus(next);
  }

  function changeMonth(step: number) {
    const date = new Date(Date.UTC(focus.year, focus.month + step, 1));
    const days = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    move({
      year: date.getUTCFullYear(),
      month: date.getUTCMonth(),
      day: Math.min(focus.day, days),
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (event.key in steps) {
      event.preventDefault();
      keyboard.current = true;
      move(shift(focus, steps[event.key]));
    } else if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      keyboard.current = true;
      changeMonth(event.key === "PageUp" ? -1 : 1);
    }
  }

  return (
    <div className="calendar" data-morph>
      <div className="calendar-head">
        <button
          type="button"
          className="calendar-step"
          aria-label={t.previousMonth}
          onClick={() => changeMonth(-1)}
        >
          <ChevronIcon direction="left" />
        </button>
        <p className="calendar-title" aria-live="polite">
          {title}
        </p>
        <button
          type="button"
          className="calendar-step"
          aria-label={t.nextMonth}
          onClick={() => changeMonth(1)}
        >
          <ChevronIcon direction="right" />
        </button>
      </div>
      <div className="calendar-weekdays" aria-hidden="true">
        {weekdays.map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
      <div
        key={`${focus.year}-${focus.month}`}
        ref={grid}
        className="calendar-grid"
        data-direction={direction ?? undefined}
        role="group"
        aria-label={title}
        onKeyDown={onKeyDown}
      >
        {Array.from({ length: 42 }, (_, index) => {
          const day = index - lead + 1;
          if (day < 1 || day > length) return <span key={index} />;
          const date = iso({ year: focus.year, month: focus.month, day });
          const disabled = Boolean(min && date < min);
          return (
            <button
              key={index}
              type="button"
              data-date={date}
              tabIndex={day === focus.day ? 0 : -1}
              disabled={disabled}
              aria-pressed={date === value}
              aria-current={date === now ? "date" : undefined}
              aria-label={full.format(
                new Date(Date.UTC(focus.year, focus.month, day)),
              )}
              onClick={() => onSelect(date)}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
