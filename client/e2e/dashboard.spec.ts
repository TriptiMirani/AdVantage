import { expect, test } from "@playwright/test";

// Seeded September 2026 data: 106,560,000 impressions, shown compact as 106.6M.
test("dashboard shows September 2026 totals, a drawn chart, and no console errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await page.getByRole("button", { name: "September 2026" }).click();

  const impressions = page.getByRole("region", { name: "Impressions" });
  await expect(impressions.locator("p").first()).toHaveText("106.6M");
  await expect(page.locator(".recharts-wrapper").first()).toBeVisible();
  // Playwright treats stroke-only SVG paths as hidden, so check the drawn geometry instead.
  await expect(page.locator(".recharts-line-curve").first()).toHaveAttribute("d", /^M/);

  expect(consoleErrors).toEqual([]);
});
