"use client";

import { useEffect, useState } from "react";
import { getCopy, type Locale } from "@/lib/copy";

const STORAGE_KEY = "iter:theme";
type Theme = "light" | "dark";

function preferredTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

function applyThemeTransition(theme: Theme) {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (!reduceMotion) root.dataset.themeTransition = "";
  applyTheme(theme);
  window.setTimeout(() => delete root.dataset.themeTransition, 180);
}

function readStoredTheme(): Theme {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : preferredTheme();
}

export function ThemeBootstrap() {
  useEffect(() => {
    applyTheme(readStoredTheme());
  }, []);

  return null;
}

export function ThemeToggle({ locale }: { locale: Locale }) {
  const t = getCopy(locale);
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const nextTheme = readStoredTheme();
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);

  const nextLabel = theme === "dark" ? t.themeLight : t.themeDark;

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    applyThemeTransition(nextTheme);
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
  }

  return (
    <button
      className="theme-toggle"
      type="button"
      data-theme={theme}
      aria-label={nextLabel}
      title={nextLabel}
      onClick={toggleTheme}
    >
      <svg
        aria-hidden="true"
        className="theme-toggle-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {theme === "dark" ? (
          <path d="M20.5 15.2A8.6 8.6 0 0 1 8.8 3.5 8.7 8.7 0 1 0 20.5 15.2Z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="3.8" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        )}
      </svg>
    </button>
  );
}
