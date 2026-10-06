import { expect, test } from "@playwright/test";

const id = "11111111-1111-4111-8111-111111111111";

test("mobile localized search and no-results state fit without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/ru");
  await expect(
    page.getByRole("heading", { name: "Вакансии", exact: true, level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText("Локальные тестовые данные, не действующие вакансии"),
  ).toBeVisible();
  await expect(
    page.locator(".listing-link").filter({ hasText: "Front desk assistant" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Фильтры" }).click();
  await expect(page.getByRole("dialog", { name: "Фильтры" })).toBeVisible();
  await page.getByLabel("Город").fill("Missing City");
  await page.getByLabel("Город").press("Enter");
  await expect(
    page.getByRole("heading", { name: "По этим фильтрам вакансий нет" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
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
    .getByRole("button", { name: "Поиск по вакансии или работодателю" })
    .click();
  await expect(page).toHaveURL(/city=Albany/);
  expect(new URL(page.url()).searchParams.get("q")).toBe("assistant");
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
  await page.evaluate(() => {
    (window as unknown as { languageMarker: boolean }).languageMarker = true;
  });
  await page.getByRole("link", { name: "ҚАЗ" }).click();
  await expect(page).toHaveURL(/\/kk$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "kk");
  expect(
    await page.evaluate(
      () => (window as unknown as { languageMarker?: boolean }).languageMarker,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "РУС" }).click();
  await expect(page).toHaveURL(/\/ru$/);
  await expect(page.locator(".brand").first()).toHaveText("iter");
  expect((await page.request.get("/icon.svg")).status()).toBe(200);
  await expect(
    page.getByRole("link", { name: "Исходный код на GitHub" }),
  ).toHaveAttribute("href", "https://github.com/anxchywl/iter");
  expect(
    await page
      .getByRole("heading", { level: 1 })
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
  await page.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
  await page.getByRole("link", { name: "EN" }).click();
  await expect(page).toHaveURL(new RegExp(`/jobs/${id}$`));
  await expect(
    page.getByRole("heading", { name: "Work conditions" }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  await page.getByRole("link", { name: "ҚАЗ" }).click();
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
  await review
    .getByLabel("Дополнение по желанию (до 500 символов)")
    .fill("The hours matched");
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
  await expect(filters.getByRole("button", { name: "Готово" })).toBeVisible();
  await filters.getByLabel("Город").fill("Albany");
  await filters.getByRole("button", { name: "Готово" }).click();
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
  await filters.getByRole("button", { name: "Показать" }).click();
  await expect(page).toHaveURL(new RegExp(`start_from=${chosen}`));
  await expect(page).toHaveURL(/city=Albany/);
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
