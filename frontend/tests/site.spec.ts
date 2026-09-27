import { expect, test } from "@playwright/test";

const id = "11111111-1111-4111-8111-111111111111";

test("mobile localized search and no-results state fit without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/ru");
  await expect(
    page.getByRole("heading", { name: "Летняя работа: условия на виду" }),
  ).toBeVisible();
  await expect(
    page.getByText("Локальные тестовые данные — не действующие вакансии"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Front desk assistant", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Город").fill("Missing City");
  await page.getByRole("button", { name: /Показать/ }).click();
  await expect(
    page.getByRole("heading", { name: "По этим фильтрам вакансий нет" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
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
  const contact = page.locator(".contact-action");
  await expect(contact.locator(".destination")).not.toBeVisible();
  await contact.locator("summary").click();
  await expect(contact.locator(".destination")).toHaveText(
    "https://example.com/jobs/apply",
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
});

test("student can submit a pending experience and report an issue", async ({
  page,
}) => {
  await page.goto(`/ru/jobs/${id}`);
  await expect(page.getByText("Одобренных отзывов: 0")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Кем вы работали" })
    .fill("Front desk");
  await page.getByLabel("Условия оплаты были понятны?").selectOption("clear");
  await page
    .getByLabel("Дополнение по желанию (до 500 символов)")
    .fill("The hours matched");
  await page.getByLabel(/Я понимаю, что это мой личный опыт/).check();
  const reviewResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/feedback/reviews"),
  );
  await page.getByRole("button", { name: "Отправить на проверку" }).click();
  expect((await reviewResponse).status()).toBe(202);
  await expect(
    page.getByText("Получено. Отзыв ожидает проверки."),
  ).toBeVisible();
  await page.getByText("Сообщить о проблеме").click();
  await page.getByRole("button", { name: "Отправить сообщение" }).click();
  await expect(
    page.getByText("Сообщение получено. Модератор его рассмотрит."),
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
