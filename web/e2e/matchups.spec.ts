import { expect, test } from "@playwright/test";
import { serveRecorded } from "./recorded";

test("shows this gameweek's Head-to-head Matchups with Win probability on the League tab", async ({ page }) => {
  await serveRecorded(page);
  await page.goto("/league/130000");
  await page.getByLabel("Are you in this League?").selectOption({ label: "Team C (Manager C)" });

  const gw10 = page.getByRole("region", { name: "GW10 Matchups" });
  const cards = gw10.getByRole("article");
  await expect(cards).toHaveCount(4);
  // The Claimed Manager's Matchup comes first.
  await expect(cards.first()).toHaveClass(/mine/);
  await expect(cards.first()).toContainText("You");
  await expect(cards.first()).toContainText(/Projected \d+\.\d · likely \d+–\d+/);
  await expect(cards.first()).toContainText(/Draw (\d+|<1)%/);
  // Your side is listed first, so your win share is the blue one.
  await expect(cards.first().locator(".side").first()).toContainText("You");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/league.png", fullPage: true });
});

test("has no Matchups in a Classic League", async ({ page }) => {
  await serveRecorded(page);
  await page.goto("/league/5000");
  await expect(page.getByRole("region", { name: "League table" })).toBeVisible();
  await expect(page.getByRole("region", { name: /Matchups/ })).toHaveCount(0);
});

test("explains when Score distributions aren't published yet", async ({ page }) => {
  await serveRecorded(page);
  await page.route("**/data/distributions.json", (r) => r.fulfill({ status: 404, body: "404: Not Found" }));
  await page.goto("/league/130000");
  await expect(page.getByText("Win probabilities appear after the next Model update")).toBeVisible();
});
