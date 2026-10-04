import { expect, test } from "@playwright/test";

const name = `E2E Campaign ${Date.now()}`;
let createdId: string | null = null;

test.afterAll(async ({ request }) => {
  if (createdId) {
    await request.delete(`/campaigns/${createdId}`);
  }
});

async function fillForm(page: import("@playwright/test").Page, overrides: Partial<Record<string, string>> = {}) {
  const dialog = page.getByRole("dialog");
  const values: Record<string, string> = {
    Name: name,
    "Budget (dollars)": "250.00",
    "Cost per impression (micros)": "1500",
    "Cost per click (cents)": "25",
    "Creative URL": "https://example.com/e2e.png",
    "Start date": "2026-10-01",
    "End date": "2026-10-31",
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) {
    await dialog.getByLabel(label, { exact: true }).fill(value);
  }
}

test("create a campaign, find it in the table, and edit its budget", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Campaigns" })).toBeVisible();

  await page.getByRole("button", { name: "New campaign" }).click();
  await expect(page.getByRole("dialog", { name: "New campaign" })).toBeVisible();

  const created = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/campaigns"));
  await fillForm(page);
  await page.getByRole("button", { name: "Save" }).click();
  createdId = (await (await created).json()).id as string;
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByLabel("Search by name").fill(name);
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toBeVisible();
  await expect(row).toContainText("DRAFT");

  await page.getByRole("button", { name: `Edit ${name}` }).click();
  const dialog = page.getByRole("dialog", { name: "Edit campaign" });
  await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue(name);
  await dialog.getByLabel("Budget (dollars)", { exact: true }).fill("300.00");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await expect(row).toContainText("of $300");
  expect(consoleErrors).toEqual([]);
});

test("invalid input shows inline errors and sends no request", async ({ page }) => {
  let posts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/campaigns")) posts += 1;
  });

  await page.goto("/");
  await page.getByRole("button", { name: "New campaign" }).click();
  const dialog = page.getByRole("dialog", { name: "New campaign" });

  await fillForm(page, { "Start date": "2026-10-31", "End date": "2026-10-01" });
  await page.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("The end date must be on or after the start date.")).toBeVisible();

  await fillForm(page, { "End date": "2026-10-31", "Creative URL": "ftp://example.com/a.png" });
  await page.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("Enter a full http or https address.")).toBeVisible();

  await dialog.getByLabel("Targeting (JSON object)", { exact: true }).fill("{ not json");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("Targeting is not valid JSON.")).toBeVisible();

  expect(posts).toBe(0);
});
