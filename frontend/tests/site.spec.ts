import { expect, test } from "@playwright/test";

const id = "11111111-1111-4111-8111-111111111111";

test("filter sheet opens with the nonce-based script policy", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const response = await page.goto("/?q=");
  const policy = response?.headers()["content-security-policy"];
  expect(policy).toMatch(/script-src[^;]*'nonce-[A-Za-z0-9+/]+=*'/);
  await expect(page.getByRole("button", { name: "Filters" })).toBeVisible();
  await page.getByRole("button", { name: "Filters" }).click();
  await expect(page.getByRole("dialog", { name: "Filters" })).toBeVisible();
});

test("dark finder keeps interactive surfaces dark and hides the filter count", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => localStorage.setItem("iter:theme", "dark"));
  await page.goto("/?season=2027");

  const filter = page.getByRole("button", { name: "Filters: 1" });
  await expect(filter).toBeVisible();
  await expect(filter.locator("span")).toHaveCount(0);

  const card = page.locator(".listing-link").first();
  await card.hover();
  await expect(card).toHaveCSS("background-color", "rgb(35, 55, 42)");

  await filter.click();
  const dialog = page.getByRole("dialog", { name: "Filters" });
  const titleBox = await dialog
    .getByRole("heading", { name: "Filters" })
    .boundingBox();
  const favourite = dialog.getByRole("button", { name: "Favourites" });
  const favouriteBox = await favourite.boundingBox();
  const dialogBox = await dialog.boundingBox();
  expect(titleBox).not.toBeNull();
  expect(favouriteBox).not.toBeNull();
  expect(dialogBox).not.toBeNull();
  expect(favouriteBox!.y).toBeGreaterThan(titleBox!.y + titleBox!.height);
  expect(
    Math.abs(
      favouriteBox!.x +
        favouriteBox!.width / 2 -
        (dialogBox!.x + dialogBox!.width / 2),
    ),
  ).toBeLessThan(2);
  const stateBox = await dialog.getByLabel("State").boundingBox();
  const cityBox = await dialog.getByLabel("City").boundingBox();
  expect(stateBox).not.toBeNull();
  expect(cityBox).not.toBeNull();
  expect(Math.abs(favouriteBox!.x - stateBox!.x)).toBeLessThan(2);
  expect(
    Math.abs(
      favouriteBox!.x + favouriteBox!.width - (cityBox!.x + cityBox!.width),
    ),
  ).toBeLessThan(2);

  const city = dialog.getByLabel("City");
  await city.focus();
  await expect(favourite).toBeHidden();
  await city.evaluate((input) => input.blur());
  await expect(favourite).toBeVisible();

  const unselectedSeason = page
    .getByRole("dialog", { name: "Filters" })
    .locator('[data-panel-field="season"]');
  await unselectedSeason.click();
  await expect(page.getByRole("button", { name: "2028" })).toHaveCSS(
    "background-color",
    "rgb(25, 28, 25)",
  );
});

test("theme toggle uses one short synchronized transition", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => localStorage.setItem("iter:theme", "dark"));
  await page.goto("/");

  await page.getByRole("button", { name: "Use light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme-transition",
    "",
  );
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-theme-transition",
    "",
    { timeout: 500 },
  );
});

test("pointer interactions use restrained lift and press motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");

  const employerAccess = page.getByRole("link", { name: "For employers" });
  await employerAccess.hover();
  await expect(employerAccess).toHaveCSS("transform", "none");
  expect(
    await employerAccess.evaluate(
      (link) => getComputedStyle(link).transitionTimingFunction,
    ),
  ).toContain("cubic-bezier(0.22, 1, 0.36, 1)");

  const listing = page.locator(".listing-card").first();
  await listing.hover();
  await expect(listing).not.toHaveCSS("transform", "none");
});

test("employer access disappears without animation on vacancy details", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const headerActions = page.locator(".header-actions");
  await expect(page.getByRole("link", { name: "For employers" })).toBeVisible();

  await page.locator(".listing-card").first().click();
  await expect(page).toHaveURL(/\/jobs\//);
  await expect(headerActions).toHaveAttribute("data-hidden", "true");
  await expect(headerActions).toBeHidden();
  await expect(headerActions).toHaveCSS("transition-duration", "0s");
});

test("desktop vacancy sidebar stays close to the viewport top", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/jobs/${id}`);

  await expect(page.locator(".detail-sidebar")).toBeVisible();
  await expect(page.locator(".detail-sidebar")).toHaveCSS("top", "24px");
});

test("dark report choices retain visible borders", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => localStorage.setItem("iter:theme", "dark"));
  await page.goto(`/jobs/${id}`);
  await page.getByRole("button", { name: "Report an issue" }).click();

  const option = page.locator(".option-list label").first();
  await expect(option).toHaveCSS("border-top-width", "1px");
  await expect(option).toHaveCSS("border-top-color", "rgb(47, 139, 91)");
  await expect(page.locator(".option-list label").nth(1)).toHaveCSS(
    "border-top-color",
    "rgb(59, 68, 61)",
  );
});

test("mobile localized search and no-results state fit without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/ru");
  await expect(page.locator("#results-heading")).toHaveClass("sr-only");
  await expect(
    page.getByText("Локальные тестовые данные, не действующие вакансии"),
  ).toBeVisible();
  await expect(
    page.locator(".site-header").getByRole("link", { name: "Работодателям" }),
  ).toBeVisible();
  await expect(
    page.locator(".listing-link").filter({ hasText: "Front desk assistant" }),
  ).toBeVisible();
  await expect(
    page.getByRole("searchbox", { name: "Поиск по вакансии или работодателю" }),
  ).toHaveAttribute("placeholder", "Поиск");
  await expect(page.locator(".pagination")).toHaveCount(0);
  const finalCard = await page
    .locator(".listing-card:last-child")
    .boundingBox();
  const footer = await page.locator(".site-footer").boundingBox();
  expect(finalCard).not.toBeNull();
  expect(footer).not.toBeNull();
  expect(footer!.y).toBeGreaterThan(finalCard!.y + finalCard!.height);
  expect(footer!.y + footer!.height).toBeGreaterThanOrEqual(739);
  await page.getByRole("button", { name: "Фильтры" }).click();
  const filters = page.getByRole("dialog", { name: "Фильтры" });
  await expect(filters).toBeVisible();
  await filters.getByLabel("Город").fill("Missing City");
  await filters.getByLabel("Город").press("Enter");
  await expect(
    page.getByRole("heading", { name: "Нет вакансий" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Сбросить фильтры" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
});

test("mobile search expands and hides filters while focused", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await page.goto("/ru");
  const search = page.getByRole("searchbox", {
    name: "Поиск по вакансии или работодателю",
  });
  const filter = page.getByRole("button", { name: "Фильтры" });
  const before = await page.locator(".job-search").boundingBox();
  const rowBefore = await page.locator(".job-tools").boundingBox();
  expect(before).not.toBeNull();
  expect(rowBefore).not.toBeNull();
  await search.click();
  await page.waitForTimeout(40);
  const inFlight = await page.evaluate(() => {
    const row = document.querySelector(".job-tools")!.getBoundingClientRect();
    const input = document
      .querySelector(".job-search")!
      .getBoundingClientRect();
    const button = document
      .querySelector(".filter-trigger")!
      .getBoundingClientRect();
    return { rowHeight: row.height, inputY: input.y, buttonY: button.y };
  });
  expect(inFlight.rowHeight).toBe(rowBefore!.height);
  expect(inFlight.buttonY).toBe(inFlight.inputY);
  const transitions = await page
    .locator(".job-tools")
    .evaluate((tools) =>
      tools
        .getAnimations()
        .map((animation) =>
          animation instanceof CSSTransition
            ? animation.transitionProperty
            : "",
        ),
    );
  expect(transitions).toContain("grid-template-columns");
  expect(transitions).not.toContain("height");
  const filterTransitions = await page
    .locator(".filter-trigger")
    .evaluate((button) =>
      button
        .getAnimations()
        .map((animation) =>
          animation instanceof CSSTransition
            ? animation.transitionProperty
            : "",
        ),
    );
  expect(filterTransitions).toContain("opacity");
  expect(filterTransitions).toContain("transform");
  await expect(filter).toBeHidden();
  await page.waitForTimeout(220);
  const focused = await page.locator(".job-search").boundingBox();
  const focusedRow = await page.locator(".job-tools").boundingBox();
  const focusedFilter = await page.locator(".filter-trigger").boundingBox();
  expect(focused).not.toBeNull();
  expect(focusedRow).not.toBeNull();
  expect(focusedFilter).not.toBeNull();
  expect(focusedRow!.height).toBe(rowBefore!.height);
  expect(focusedFilter!.y).toBe(focused!.y);
  expect(focused!.width).toBeGreaterThan(before!.width + 30);
  await page.locator(".content-wrap").click({ position: { x: 4, y: 4 } });
  await expect(filter).toBeVisible();
});

test("desktop finder shows inline filters, list, and vacancy preview", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");

  await expect(page.locator(".desktop-filters")).toBeVisible();
  await expect(page.getByRole("button", { name: "Filters" })).toBeHidden();
  await expect(page.locator(".desktop-listing-preview")).toBeVisible();
  await expect(
    page.locator(".desktop-listing-preview").getByText("Front desk assistant"),
  ).toBeVisible();
  expect(
    await page.locator(".app-shell").evaluate((shell) => shell.clientWidth),
  ).toBeGreaterThan(1000);

  const filters = page.locator(".desktop-filters");
  await filters.getByRole("button", { name: "Currency: USD" }).click();
  await filters.getByRole("option", { name: "KZT" }).click();
  await expect(filters.locator('input[name="wage_currency"]')).toHaveValue(
    "KZT",
  );
  await filters.getByRole("button", { name: /Starts on or after/ }).click();
  await expect(
    filters.getByRole("dialog", { name: "Starts on or after" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await filters.getByLabel("City").fill("Albany");
  await filters.getByRole("button", { name: "Show results" }).click();
  await expect(page).toHaveURL(/city=Albany/);
  await page.locator(".listing-card").first().click();
  await expect(page).toHaveURL(/city=Albany/);
  await expect(
    page.locator(".desktop-listing-preview").getByRole("heading", {
      name: "Front desk assistant",
    }),
  ).toBeVisible();
  await page
    .locator(".desktop-listing-preview")
    .getByRole("link", { name: "View details" })
    .click();
  await expect(page).toHaveURL(/\/jobs\//);
  await expect(
    page.getByRole("heading", {
      name: "Work conditions",
    }),
  ).toBeVisible();
});

test("job finder keeps search, filters, and detail in one flow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/ru");
  await page.getByRole("button", { name: "Фильтры" }).click();
  const filters = page.getByRole("dialog", { name: "Фильтры" });
  await expect(filters).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(filters).not.toBeVisible();
  await page
    .getByRole("searchbox", { name: "Поиск по вакансии или работодателю" })
    .fill("Front desk");
  await page.locator(".content-wrap").click({ position: { x: 4, y: 4 } });
  await expect(page.getByRole("button", { name: "Фильтры" })).toBeVisible();
  await page.getByRole("button", { name: "Фильтры" }).click();
  await filters.getByLabel("Город").fill("Albany");
  await filters.getByLabel("Город").press("Enter");
  await expect(page).toHaveURL(/city=Albany/);
  expect(new URL(page.url()).searchParams.get("q")).toBe("Front desk");
  await expect(page.getByRole("button", { name: /Фильтры.*1/ })).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Поиск по вакансии или работодателю" })
    .fill("assistant");
  await page
    .getByRole("searchbox", { name: "Поиск по вакансии или работодателю" })
    .press("Enter");
  await expect(page).toHaveURL(/city=Albany/);
  expect(new URL(page.url()).searchParams.get("q")).toBe("assistant");
  const language = page.locator(".language-switch");
  await expect(page.locator(".site-header .language-switch")).toHaveCount(0);
  await expect(page.locator(".footer-bottom .language-switch")).toBeVisible();
  await language.evaluate((link) => {
    link.setAttribute("data-instance", "persistent");
  });
  await page.locator(".listing-link").click();
  await expect(page).toHaveURL(new RegExp(`/ru/jobs/${id}$`));
  await expect(
    page.getByRole("heading", { name: "Front desk assistant" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: /К вакансиям/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/ru$/);
  await expect(language).toHaveAttribute("data-instance", "persistent");
  expect(
    await page
      .locator(".language-code")
      .evaluate((code) => getComputedStyle(code).animationName),
  ).toBe("none");
  await page.evaluate(() => {
    (window as unknown as { languageMarker: boolean }).languageMarker = true;
  });
  await expect(language).toHaveText("РУС");
  await expect(language).toHaveAccessibleName("Сменить язык на English");
  await language.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(language).toHaveText("EN");
  await language.click();
  await expect(page).toHaveURL(/\/kk$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "kk");
  expect(
    await page.evaluate(
      () => (window as unknown as { languageMarker?: boolean }).languageMarker,
    ),
  ).toBe(true);
  await language.click();
  await expect(page).toHaveURL(/\/ru$/);
  await expect(page.locator(".brand").first()).toHaveText("iter");
  expect(
    await page
      .locator(".site-header")
      .evaluate((header) => getComputedStyle(header).position),
  ).toBe("relative");
  expect((await page.request.get("/icon.svg")).status()).toBe(200);
  await expect(
    page.getByRole("link", { name: "Исходный код на GitHub" }),
  ).toHaveAttribute("href", "https://github.com/anxchywl/iter");
  expect(
    await page
      .locator(".listing-card h3")
      .first()
      .evaluate((heading) => getComputedStyle(heading).textWrap),
  ).toBe("balance");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
});

test("reduced motion uses immediate section scrolling", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollBehavior,
    ),
  ).toBe("auto");
});

function telegramLaunch(path: string, userId: number) {
  const initData = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: userId, first_name: "Test" }),
    hash: "mock",
  }).toString();
  return `${path}#tgWebAppData=${encodeURIComponent(initData)}&tgWebAppVersion=8.0&tgWebAppPlatform=weba`;
}

test("footer exposes admin navigation only inside the Telegram Mini App", async ({
  page,
}) => {
  await page.goto("/");
  const adminLink = page.getByRole("link", { name: "Admin console" });
  await expect(adminLink).toBeHidden();

  await page.goto(telegramLaunch("/?session=non-operator", 123456));
  await expect(adminLink).toHaveAttribute("href", "/admin");
  await expect(adminLink).toBeVisible();
});

test("companies sign in without Telegram while operators use the Mini App", async ({
  page,
}) => {
  await page.goto("/manage");
  await expect(
    page.getByRole("heading", { name: "Company sign in" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Sign in with access key" }).click();
  await expect(
    page.getByRole("heading", { name: "Company sign in" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "For employees", exact: true }),
  ).toHaveAttribute("href", "/");
  await expect(page.locator(".company-access .link-pending")).toHaveCount(0);
  await expect(page.locator(".site-footer")).toHaveCount(0);
  const title = await page
    .getByRole("heading", { name: "Company sign in" })
    .boundingBox();
  const accessKeyLabel = await page
    .getByText("Company access key", { exact: true })
    .boundingBox();
  expect(title).not.toBeNull();
  expect(accessKeyLabel).not.toBeNull();
  expect(accessKeyLabel!.y - title!.y - title!.height).toBeGreaterThanOrEqual(
    16,
  );
  await page.getByLabel("Company access key").fill("company-test-key");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/manage$/);
  await expect(page.getByText("Example Provider")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/portal\/login$/);

  await page.goto(telegramLaunch("/?tgWebAppStartParam=admin", 1));
  await expect(page).toHaveURL(/\/admin(#|$)/);
  await expect(
    page.getByRole("heading", { name: "Operator console" }),
  ).toBeVisible();
});

test("company sign in explains throttling", async ({ page }) => {
  await page.goto("/portal/login");
  await expect(
    page.getByText(
      "Use the access key issued to your company. Keep this key private. Ask the Iter team to issue or replace a key.",
    ),
  ).toBeVisible();
  await expect(page.getByText("No Telegram account is needed.")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "anxchywl@gmail.com" }),
  ).toHaveAttribute("href", "mailto:anxchywl@gmail.com");
  await page.getByLabel("Company access key").fill("rate-limited");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByText("Too many sign-in attempts. Wait one minute and try again."),
  ).toBeVisible();
});

test("Telegram launch links hide while company access stays available", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.locator('script[src="/telegram-mark.js?v=2"]')).toHaveCount(
    1,
  );
  const footerLink = page.getByRole("link", { name: "Open in Telegram" });
  const manageLink = page
    .locator(".site-header")
    .getByRole("link", { name: "For employers" });
  await expect(footerLink).toBeVisible();
  await expect(manageLink).toBeVisible();
  await expect(manageLink.locator(".link-pending")).toHaveCount(0);
  await expect(manageLink).toHaveAttribute("href", "/portal/login");
  await expect(footerLink).toHaveAttribute(
    "href",
    "https://t.me/iter_app_bot/vacancies?startapp",
  );
  const footerBox = await page.locator(".footer-bottom").boundingBox();
  const telegramBox = await footerLink.boundingBox();
  expect(footerBox).not.toBeNull();
  expect(telegramBox).not.toBeNull();
  expect(
    Math.abs(
      telegramBox!.x +
        telegramBox!.width / 2 -
        (footerBox!.x + footerBox!.width / 2),
    ),
  ).toBeLessThan(2);
  await page.goto(`/jobs/${id}`);
  await expect(page.locator(".telegram-link")).toBeVisible();

  await page.goto(telegramLaunch("/", 5));
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Vacancies", exact: true, level: 1 }),
  ).toBeVisible();
  await expect(footerLink).toBeHidden();
  await expect(manageLink).toBeVisible();
  await page.getByRole("button", { name: "Filters" }).click();
  const telegramFilters = page.getByRole("dialog", { name: "Filters" });
  await expect(telegramFilters).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(telegramFilters).not.toBeVisible();
  await page.getByRole("link", { name: /Front desk assistant/ }).click();
  await expect(
    page.getByRole("heading", { name: "Front desk assistant" }),
  ).toBeVisible();
  await expect(page.locator(".telegram-link")).toBeHidden();
  await expect(footerLink).toBeHidden();

  await page.goto("/?tgWebAppStartParam=vacancies");
  await expect(footerLink).toBeHidden();

  const macOSPage = await context.newPage();
  await macOSPage.addInitScript(() => {
    Object.defineProperty(window, "webkit", {
      value: {
        messageHandlers: { performAction: { postMessage() {} } },
      },
    });
  });
  await macOSPage.goto("/");
  await expect(
    macOSPage.getByRole("link", { name: "Open in Telegram" }),
  ).toBeHidden();
  await expect(
    macOSPage
      .locator(".site-header")
      .getByRole("link", { name: "For employers" }),
  ).toBeVisible();
  await macOSPage.close();
});

test("provider submits an offer and an operator publishes it", async ({
  page,
}) => {
  await page.goto("/portal/login");
  await page.getByLabel("Company access key").fill("company-test-key");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Example Provider")).toBeVisible();
  await page.getByLabel("Employer").selectOption("employer-1");
  await page.getByLabel("Internal reference").fill("summer-role");
  await page.getByLabel("Role").fill("Guest services assistant");
  await page.reload();
  await expect(page.getByText("Unsaved offer restored.")).toBeVisible();
  await expect(page.getByLabel("Internal reference")).toHaveValue(
    "summer-role",
  );
  await expect(page.getByLabel("Employer")).toHaveValue("employer-1");
  await expect(page.getByLabel("Role")).toHaveValue("Guest services assistant");
  await expect(page.getByRole("group", { name: "Offer basics" })).toBeVisible();
  await page.getByLabel("State").fill("New York");
  await page.getByLabel("City").fill("Albany");
  await page.getByLabel("Job type").fill("Hospitality");
  await page
    .getByLabel("Official job source")
    .fill("https://example.com/jobs/guest-services");
  await page
    .getByLabel("Application or contact link")
    .fill("https://example.com/apply");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByText("Draft created.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Guest services assistant" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("Offer submitted for review.")).toBeVisible();
  await expect(page.getByText("pending", { exact: true })).toBeVisible();

  await page.goto(telegramLaunch("/admin", 1));
  const operatorSections = page.getByRole("navigation", {
    name: "Operator sections",
  });
  await expect(
    operatorSections.getByRole("link", { name: "Offers 1 pending" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Employers" })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Guest services assistant" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approve and publish" }).click();
  await page
    .getByLabel("What source evidence did you check?")
    .fill("Official source checked");
  await page.getByRole("button", { name: "Approve and publish" }).click();
  await expect(page.getByText("Offer published.")).toBeVisible();
  await expect(page.getByText("No pending offers.")).toBeVisible();
  await operatorSections
    .getByRole("link", { name: "Experiences 0 pending" })
    .click();
  await expect(page.getByText("No pending experiences.")).toBeVisible();
  await operatorSections
    .getByRole("link", { name: "Reports 0 pending" })
    .click();
  await expect(page.getByText("No pending reports.")).toBeVisible();

  await operatorSections.getByRole("link", { name: "Companies" }).click();
  await page.getByLabel("Company name").fill("Example Agency");
  await page.getByLabel("Company website").fill("https://agency.example.com");
  await page
    .getByLabel("Business address")
    .fill("500 Summer Avenue, Boston, MA");
  await page
    .getByRole("button", { name: "Create company and access key" })
    .click();
  await expect(page.getByText("Company profile created.")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "New company access key" }),
  ).toBeFocused();
  await expect(page.getByText("iter_company_mock-key")).toBeVisible();
  await expect(
    page.getByText("The full key will not be shown again."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("500 Summer Avenue, Boston, MA")).toBeVisible();
  await page.getByRole("button", { name: "Replace access key" }).click();
  await page.getByRole("button", { name: "Confirm replacement" }).click();
  await expect(page.getByText("iter_company_new-mock-key")).toBeVisible();
  await page.getByRole("button", { name: "Suspend access" }).click();
  await page.getByRole("button", { name: "Confirm suspension" }).click();
  await expect(
    page.getByText("Company suspended. Existing sessions were signed out."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restore access" }).click();
  await expect(page.getByText("Company access restored.")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Operator sections" }),
  ).toBeVisible();

  await operatorSections.getByRole("link", { name: "Employers" }).click();
  const addEmployer = page.locator("form", {
    has: page.getByRole("button", { name: "Add employer" }),
  });
  await addEmployer.getByLabel("Legal name").fill("Seabrook Resort LLC");
  await addEmployer
    .getByLabel("Official website")
    .fill("https://seabrook.example.com");
  await page.getByRole("button", { name: "Add employer" }).click();
  await expect(page.getByText("Employer added.")).toBeVisible();
  const seabrook = page.locator(".portal-employer", {
    hasText: "Seabrook Resort LLC",
  });
  await expect(seabrook.getByText("Identity not checked")).toBeVisible();
  await page.getByRole("button", { name: "Edit Seabrook Resort LLC" }).click();
  const editor = page.locator(".portal-employer form");
  await expect(editor.getByLabel("Legal name")).toHaveValue(
    "Seabrook Resort LLC",
  );
  await expect(editor.getByLabel("Public record checked")).toHaveCount(0);
  await editor.getByLabel("Identity").selectOption("disputed");
  await expect(
    editor.getByText(
      "Saving a dispute pauses this employer's published vacancies.",
    ),
  ).toBeVisible();
  await editor.getByLabel("Identity").selectOption("checked");
  await editor
    .getByLabel("Public record checked")
    .fill("https://registry.example.org/seabrook");
  await editor.getByRole("button", { name: "Save employer" }).click();
  await expect(page.getByText("Employer updated.")).toBeVisible();
  await expect(seabrook.getByText("Identity checked")).toBeVisible();
});

test("an empty feed centers one message and keeps the footer at the bottom", async ({
  page,
  request,
}) => {
  await request.get("http://127.0.0.1:18017/__mock/empty-feed?on=1");
  try {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    const message = page.getByRole("heading", {
      name: "No current vacancies yet",
    });
    await expect(message).toBeVisible();
    await expect(
      page.getByText("Check back after new employer confirmations"),
    ).toHaveCount(0);
    const footer = await page.locator(".site-footer").boundingBox();
    expect(footer!.y + footer!.height).toBeGreaterThanOrEqual(811);
    const results = await page.locator(".results-section").boundingBox();
    const heading = await message.boundingBox();
    const middle = heading!.y + heading!.height / 2;
    expect(Math.abs(middle - (results!.y + results!.height / 2))).toBeLessThan(
      4,
    );
    const box = await message.boundingBox();
    expect(Math.abs(box!.x + box!.width / 2 - 375 / 2)).toBeLessThan(4);
  } finally {
    await request.get("http://127.0.0.1:18017/__mock/empty-feed?on=0");
  }
});

test("detail shows distinct trust facts and contact destination before leaving", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/kk/jobs/${id}`);
  await expect(
    page.getByRole("heading", { name: "Front desk assistant" }),
  ).toBeVisible();
  await expect(
    page.getByText("Демеушінің мақұлдауы расталмаған"),
  ).toBeVisible();
  await expect(page.getByText("120.00 USD / апта")).toBeVisible();
  const trustList = page.locator(".trust-list");
  const evidenceLinks = page.locator(".evidence-links");
  await expect(trustList.getByRole("link")).toHaveCount(0);
  await expect(
    evidenceLinks.getByRole("link", { name: /Бос орынның ресми дереккөзі/ }),
  ).toBeVisible();
  const trustListBox = await trustList.boundingBox();
  const evidenceLinksBox = await evidenceLinks.boundingBox();
  expect(trustListBox).not.toBeNull();
  expect(evidenceLinksBox).not.toBeNull();
  expect(evidenceLinksBox!.y).toBeGreaterThanOrEqual(
    trustListBox!.y + trustListBox!.height,
  );
  await page.evaluate(() => window.scrollTo({ top: 300, behavior: "instant" }));
  const language = page.locator(".language-switch");
  await language.evaluate((link: HTMLElement) => link.click());
  await expect(page).toHaveURL(new RegExp(`/ru/jobs/${id}$`));
  await expect(page.getByText("120.00 USD / неделю")).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(250);
  await language.click();
  await expect(page).toHaveURL(new RegExp(`/jobs/${id}$`));
  await expect(
    page.getByRole("heading", { name: "Work conditions" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Hours, tips, and bonuses are not guaranteed by this directory.",
    ),
  ).toHaveCount(0);
  await language.click();
  await expect(page.getByText("120.00 USD / апта")).toBeVisible();
  const contact = page.getByRole("dialog", {
    name: "Жұмыс берушіге хабарласу",
  });
  await expect(contact).not.toBeVisible();
  await page.getByRole("button", { name: "Жұмыс берушіге хабарласу" }).click();
  await expect(contact.locator(".destination").first()).toHaveText(
    "https://example.com/jobs/apply",
  );
  await expect(contact.locator(".channel")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(contact).not.toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
});

test("student can submit a pending experience and report an issue", async ({
  page,
}) => {
  await page.goto(`/ru/jobs/${id}`);
  await expect(page.getByText("Пока нет одобренных отзывов.")).toHaveCount(0);
  await page.getByRole("button", { name: "Поделиться опытом" }).click();
  const review = page.getByRole("dialog", { name: "Поделиться опытом" });
  await expect(review.getByText("Шаг 1 из 3")).toBeVisible();
  await review.getByRole("button", { name: "Далее" }).click();
  await expect(review.getByText("Шаг 1 из 3")).toBeVisible();
  await review
    .getByRole("textbox", { name: "Кем вы работали" })
    .fill("Front desk");
  await review
    .getByRole("group", { name: "Условия оплаты были понятны?" })
    .getByText("Да, понятны")
    .click();
  await review.getByRole("button", { name: "Далее" }).click();
  await expect(review.getByText("Шаг 2 из 3")).toBeVisible();
  await review.getByRole("button", { name: "Назад" }).click();
  await expect(
    review.getByRole("textbox", { name: "Кем вы работали" }),
  ).toHaveValue("Front desk");
  await review.getByRole("button", { name: "Далее" }).click();
  await review
    .getByRole("group", { name: "Часы" })
    .getByText("Совпало с описанием")
    .click();
  await review.getByRole("button", { name: "Далее" }).click();
  await expect(review.getByText("Шаг 3 из 3")).toBeVisible();
  const reviewText = review.getByLabel("Дополнение по желанию");
  await expect(review.getByText("0 / 500")).toBeVisible();
  await reviewText.fill("The hours matched");
  await expect(review.getByText("17 / 500")).toBeVisible();
  await review.getByLabel(/Я понимаю, что это мой личный опыт/).check();
  const reviewResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/feedback/reviews"),
  );
  await review.getByRole("button", { name: "Отправить на проверку" }).click();
  const sent = await reviewResponse;
  expect(sent.status()).toBe(202);
  expect(sent.request().postDataJSON()).toMatchObject({
    role: "Front desk",
    pay_clarity: "clear",
    hours_match: "yes",
    pay_match: "unknown",
    self_report_consent: true,
  });
  await expect(
    review.getByText("Получено. Отзыв ожидает проверки."),
  ).toBeVisible();
  await review.getByRole("button", { name: "Готово" }).click();
  await expect(review).not.toBeVisible();
  await page.getByRole("button", { name: "Сообщить о проблеме" }).click();
  const report = page.getByRole("dialog", { name: "Сообщить о проблеме" });
  await expect(report.getByText("Вакансия закрыта или занята")).toBeVisible();
  await report.getByText("Неверные или устаревшие данные").click();
  await report.getByRole("button", { name: "Далее" }).click();
  const reportText = report.getByLabel("Пояснение по желанию");
  await expect(report.getByText("0 / 300")).toBeVisible();
  await reportText.fill("Wrong dates");
  await expect(report.getByText("11 / 300")).toBeVisible();
  const reportResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/feedback/reports"),
  );
  await report.getByRole("button", { name: "Отправить сообщение" }).click();
  expect((await reportResponse).request().postDataJSON()).toMatchObject({
    reason: "inaccurate",
  });
  await expect(
    report.getByText("Сообщение получено. Модератор его рассмотрит."),
  ).toBeVisible();
});

test("Telegram start parameter resolves to the same localized listing", async ({
  page,
}) => {
  await page.goto(`/ru?tgWebAppStartParam=job_${id}`);
  await expect(page).toHaveURL(new RegExp(`/ru/jobs/${id}$`));
  await expect(
    page.getByRole("heading", { name: "Front desk assistant" }),
  ).toBeVisible();
});

test("unavailable listing and API failure never show demo jobs as current", async ({
  page,
}) => {
  await page.goto("/jobs/stale");
  await expect(
    page.getByRole("heading", {
      name: "This vacancy needs a new confirmation",
    }),
  ).toBeVisible();
  await page.goto("/jobs/paused");
  await expect(
    page.getByRole("heading", { name: "This vacancy is unavailable" }),
  ).toBeVisible();
  await page.goto("/?q=error");
  await expect(
    page.getByRole("heading", { name: "Vacancies could not be loaded" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Front desk assistant" }),
  ).toHaveCount(0);
});

test("filter sheet picks dates in a calendar and focuses one field on phones", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/ru");
  await page.getByRole("button", { name: "Фильтры" }).click();
  const filters = page.locator(".filter-dialog");
  await expect(page.getByRole("dialog", { name: "Фильтры" })).toBeVisible();
  await expect(filters.getByRole("heading", { name: "Фильтры" })).toBeFocused();
  await expect(filters.getByRole("button", { name: "Отмена" })).toHaveCount(0);
  await filters.getByLabel("Город").click();
  await expect(filters.getByLabel("Штат")).toBeHidden();
  await expect(filters.getByRole("heading", { name: "Фильтры" })).toBeHidden();
  await expect(filters.getByRole("button", { name: "Показать" })).toBeHidden();
  const cityDone = filters.locator(".focus-done > button");
  await expect(cityDone).toBeVisible();
  const cityDoneStyle = await cityDone.evaluate((button) => {
    const style = getComputedStyle(button);
    return {
      background: style.backgroundColor,
      borderRadius: style.borderRadius,
      box: (() => {
        const rect = button.getBoundingClientRect();
        return { x: rect.x, width: rect.width, height: rect.height };
      })(),
    };
  });
  await filters.getByLabel("Город").fill("Albany");
  await cityDone.click();
  await expect(filters.getByRole("button", { name: "Готово" })).toBeHidden();
  await expect(filters.getByLabel("Штат")).toBeVisible();
  await filters.getByRole("button", { name: /Начало не раньше/ }).click();
  await expect(
    filters.getByRole("heading", { name: "Начало не раньше" }),
  ).toBeVisible();
  await expect(filters.getByLabel("Город")).toBeHidden();
  await filters.getByRole("button", { name: "Следующий месяц" }).click();
  await filters.locator(".calendar-grid button").nth(9).click();
  await expect(filters.getByLabel("Город")).toBeVisible();
  const chosen = await filters.locator('input[name="start_from"]').inputValue();
  expect(chosen).toMatch(/^\d{4}-\d{2}-10$/);
  await filters.getByRole("button", { name: /Окончание не позже/ }).click();
  const earlier = filters.locator(
    `.calendar-grid button[data-date="${chosen.slice(0, 8)}09"]`,
  );
  if (await earlier.count()) await expect(earlier).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(filters.getByLabel("Город")).toBeVisible();
  await filters
    .getByRole("button", { name: /Последнее подтверждение/ })
    .click();
  const done = filters.getByRole("button", { name: "Готово" });
  await expect(done).toBeVisible();
  await expect(filters.getByRole("button", { name: "К фильтрам" })).toHaveCount(
    0,
  );
  const panelDoneStyle = await done.evaluate((button) => {
    const style = getComputedStyle(button);
    return {
      background: style.backgroundColor,
      borderRadius: style.borderRadius,
      box: (() => {
        const rect = button.getBoundingClientRect();
        return { x: rect.x, width: rect.width, height: rect.height };
      })(),
    };
  });
  expect(panelDoneStyle).toEqual(cityDoneStyle);
  await done.click();
  await expect(filters.getByRole("button", { name: "Готово" })).toBeHidden();
  await expect(filters.getByLabel("Город")).toBeVisible();
  await filters.getByLabel("Оплата от").fill("20");
  await filters.getByRole("button", { name: "Готово" }).click();
  await filters.getByRole("button", { name: /Валюта USD/ }).click();
  await expect(filters.getByRole("button", { name: "EUR" })).toBeVisible();
  await filters.getByRole("button", { name: "EUR" }).click();
  await expect(
    filters.getByRole("button", { name: /Валюта EUR/ }),
  ).toBeVisible();
  await filters.getByRole("button", { name: "Показать" }).click();
  await expect(page).toHaveURL(new RegExp(`start_from=${chosen}`));
  await expect(page).toHaveURL(/city=Albany/);
  await expect(page).toHaveURL(/min_wage=20/);
  await expect(page).toHaveURL(/wage_currency=EUR/);
});

test("language changes preserve the vacancy list scroll position", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.evaluate(() => window.scrollTo({ top: 360, behavior: "instant" }));
  const before = await page.evaluate(() => window.scrollY);
  await page
    .locator(".language-switch")
    .evaluate((link: HTMLElement) => link.click());
  await expect(page).toHaveURL(/^.*\/kk$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "kk");
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(
    before - 20,
  );
});

test("review sheet focuses one field on phones and returns with done", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/ru/jobs/${id}`);
  await page.getByRole("button", { name: "Поделиться опытом" }).click();
  const review = page.getByRole("dialog", { name: "Поделиться опытом" });
  const role = review.getByRole("textbox", { name: "Кем вы работали" });
  await role.click();
  await expect(review.getByText("Условия оплаты были понятны?")).toBeHidden();
  await expect(review.getByRole("button", { name: "Далее" })).toBeHidden();
  await role.fill("Front desk");
  await review.getByRole("button", { name: "Готово" }).click();
  await expect(role).not.toBeFocused();
  await expect(review.getByRole("button", { name: "Далее" })).toBeVisible();
  await expect(role).toHaveValue("Front desk");
  await page.keyboard.press("Escape");
  await expect(review).not.toBeVisible();
});
