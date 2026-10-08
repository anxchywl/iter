"use client";

import { useEffect, useState } from "react";
import { getCopy, type Locale } from "@/lib/copy";

const STORAGE_KEY = "iter:favourites";
const EVENT_NAME = "iter:favourites-changed";

function readFavourites(): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

export function hasFavourite(id: string): boolean {
  return readFavourites().includes(id);
}

export function FavouriteButton({
  listingId,
  locale,
}: {
  listingId: string;
  locale: Locale;
}) {
  const t = getCopy(locale);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const sync = () => setActive(hasFavourite(listingId));
    sync();
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener("storage", sync);
    };
  }, [listingId]);

  function toggle() {
    const next = new Set(readFavourites());
    if (next.has(listingId)) next.delete(listingId);
    else next.add(listingId);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    setActive(next.has(listingId));
    window.dispatchEvent(new Event(EVENT_NAME));
  }

  return (
    <button
      type="button"
      className="detail-save"
      data-active={active || undefined}
      aria-pressed={active}
      aria-label={active ? t.favourited : t.favourite}
      title={active ? t.favourited : t.favourite}
      onClick={toggle}
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
    </button>
  );
}

export function useFavouriteIds(enabled: boolean): string[] {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    if (!enabled) return;
    const sync = () => setIds(readFavourites());
    sync();
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener("storage", sync);
    };
  }, [enabled]);
  return ids;
}
