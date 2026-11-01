import { expect, test } from "@playwright/test";
import { serveRecorded } from "./recorded";

test.beforeEach(({ page }) => serveRecorded(page));

test("suggests Win-win trades for the Claimed Manager and filters by rival", async ({ page }) => {
  await page.goto("/league/5000");
  await page.getByRole("navigation", { name: "League sections" }).getByRole("link", { name: "Trades", exact: true }).click();
  await expect(page).toHaveURL(/\/league\/5000\/trades/);
  await expect(page.getByText("Claim your Manager to see Win-win trades.")).toBeVisible();

  await page.getByLabel("Are you in this League?").selectOption({ label: "Team C" });
  const card = page.getByRole("region", { name: "Win-win trades" });
  const items = card.getByRole("listitem");
  await expect(items.first()).toContainText("You give");
  await expect(items.first()).toContainText(/You \+\d+\.\d · Team [A-H] \+\d+\.\d/);

  // All rivals: no more than 3 per rival.
  const rivals = await card.locator(".with b").allTextContents();
  for (const r of new Set(rivals)) expect(rivals.filter((x) => x === r).length).toBeLessThanOrEqual(3);

  await card.getByLabel("Trade with").selectOption({ label: "Team G" });
  await expect(items.first()).toContainText("With Team G");
  for (const r of await card.locator(".with b").allTextContents()) expect(r).toBe("Team G");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("says when a Manager has no Win-win trades", async ({ page }) => {
  await page.goto("/league/5000/trades");
  await page.getByLabel("Are you in this League?").selectOption({ label: "Team D" });
  await expect(page.getByRole("region", { name: "Win-win trades" })).toContainText("No Win-win trades in this League right now");
});
