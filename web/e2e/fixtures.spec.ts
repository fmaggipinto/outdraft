import { expect, test } from "@playwright/test";
import { serveRecorded } from "./recorded";

test.beforeEach(({ page }) => serveRecorded(page));

test("shows a coloured fixture ticker that re-sorts for attackers and defenders", async ({ page }) => {
  await page.goto("/league/5000");
  await page.getByRole("link", { name: "Fixtures" }).click();
  await expect(page).toHaveURL(/\/league\/5000\/fixtures/);

  const ticker = page.getByRole("region", { name: "Fixture ticker" });
  const clubs = ticker.getByRole("rowheader");
  await expect(clubs).toHaveCount(20);
  await expect(ticker.getByRole("columnheader", { name: "GW15" })).toBeVisible();
  await expect(ticker).not.toContainText("Difficulty colours appear after");

  const attackOrder = await clubs.allTextContents();
  await ticker.getByRole("radio", { name: "For defenders" }).click();
  await expect(ticker.getByRole("radio", { name: "For defenders" })).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => clubs.allTextContents()).not.toEqual(attackOrder);

  // Each Fixture cell is coloured.
  const bg = await ticker.locator("td .fx").first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toMatch(/^rgb/);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/fixtures.png", fullPage: true });
});
