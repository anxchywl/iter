"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { Locale } from "@/lib/copy";
import { fill, getCopy, localePath } from "@/lib/copy";
import { DocumentLanguage } from "@/components/document-language";
import { GitHubIcon } from "@/components/icons";
import { LinkPending } from "@/components/link-pending";
import { ThemeBootstrap, ThemeToggle } from "@/components/theme-toggle";

const nextLocale: Record<Locale, Locale> = { en: "kk", kk: "ru", ru: "en" };
const languageCodes: Record<Locale, string> = {
  en: "EN",
  kk: "ҚАЗ",
  ru: "РУС",
};
const languageNames: Record<Locale, string> = {
  en: "English",
  kk: "Қазақша",
  ru: "Русский",
};

function pathLocale(pathname: string): Locale {
  const segment = pathname.split("/")[1];
  return segment === "kk" || segment === "ru" ? segment : "en";
}

function pathWithoutLocale(pathname: string, locale: Locale): string {
  if (locale === "en") return pathname;
  const prefix = `/${locale}`;
  const path = pathname.slice(prefix.length);
  return path || "/";
}

export function AppShell({
  children,
  demoMode,
  telegram,
  year,
}: {
  children: React.ReactNode;
  demoMode: boolean;
  telegram: string | null;
  year: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = pathLocale(pathname);
  const isPortal = /^\/(admin|manage|portal)(?:\/|$)/.test(pathname);
  const isCompanyLogin = pathname === "/portal/login";
  const isVacancyDetail = /^\/jobs\/[^/]+\/?$/.test(
    pathWithoutLocale(pathname, locale),
  );
  const t = getCopy(locale);
  const targetLocale = nextLocale[locale];
  const query = searchParams.toString();
  const languagePath = localePath(
    targetLocale,
    pathWithoutLocale(pathname, locale),
  );
  const languageHref = query ? `${languagePath}?${query}` : languagePath;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        {t.skip}
      </a>
      <DocumentLanguage locale={locale} />
      <ThemeBootstrap />
      <header className="site-header">
        {demoMode && <div className="demo-banner">{t.demo}</div>}
        <div className="header-inner">
          <Link
            className="brand"
            href={localePath(locale)}
            aria-label={`${t.brand}, ${t.browse}`}
          >
            <span className="brand-initial">i</span>ter
          </Link>
          {(!isPortal || isCompanyLogin) && (
            <div
              className="header-actions"
              data-hidden={isVacancyDetail || undefined}
              aria-hidden={isVacancyDetail || undefined}
            >
              {isCompanyLogin ? (
                <Link className="company-access" href={localePath(locale)}>
                  For employees
                </Link>
              ) : (
                <Link
                  className="company-access"
                  href="/portal/login"
                  tabIndex={isVacancyDetail ? -1 : undefined}
                >
                  {t.manageOffers}
                </Link>
              )}
            </div>
          )}
        </div>
      </header>
      <main id="main">{children}</main>
      {!isCompanyLogin && (
        <footer className="site-footer">
          <div className="footer-inner">
            <div className="footer-bottom">
              <span>
                © {year} {t.brand}
              </span>
              <Link className="operator-console-link" href="/admin">
                {t.operatorConsole}
              </Link>
              {telegram && (
                <a
                  className="telegram-launch"
                  href={telegram}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t.telegram}
                </a>
              )}
              <div className="footer-utilities">
                {!isPortal && (
                  <Link
                    className="language-switch"
                    href={languageHref}
                    hrefLang={targetLocale}
                    scroll={false}
                    aria-label={fill(t.switchLanguage, {
                      language: languageNames[targetLocale],
                    })}
                  >
                    <span className="language-code">
                      {languageCodes[locale]}
                    </span>
                    <LinkPending />
                  </Link>
                )}
                {!isPortal && <ThemeToggle locale={locale} />}
                <a
                  className="footer-source"
                  href="https://github.com/anxchywl/iter"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t.sourceCode}
                  title={t.sourceCode}
                >
                  <GitHubIcon />
                </a>
              </div>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
