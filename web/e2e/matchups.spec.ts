import { expect, test } from "@playwright/test";
import { serveRecorded } from "./recorded";

test("forecasts Head-to-head Matchups with Win probability", async ({ page }) => {
  await serveRecorded(page);
  await page.goto("/league/130000");
  await page.getByLabel("Are you in this League?").selectOption({ label: "Team C (Manager C)" });
  await page.getByRole("link", { name: "Matchups" }).click();
  await expect(page).toHaveURL(/\/league\/130000\/matchups/);

  const gw10 = page.getByRole("region", { name: "GW10 Matchups" });
  const cards = gw10.getByRole("article");
  await expect(cards).toHaveCount(4);
  // The Claimed Manager's Matchup comes first.
  await expect(cards.first()).toHaveClass(/mine/);
  await expect(cards.first()).toContainText("You");
  await expect(cards.first()).toContainText(/Projected \d+\.\d · likely \d+–\d+/);
  await expect(cards.first()).toContainText(/Draw (\d+|<1)%/);

  await page.getByRole("radio", { name: "GW12" }).click();
  await expect(page.getByRole("region", { name: "GW12 Matchups" }).getByRole("article")).toHaveCount(4);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/matchups.png", fullPage: true });
});

test("has no Matchups tab in a Classic League", async ({ page }) => {
  await serveRecorded(page);
  await page.goto("/league/5000");
  await expect(page.getByRole("link", { name: "Waivers" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Matchups" })).toHaveCount(0);
});

test("explains when Score distributions aren't published yet", async ({ page }) => {
  await serveRecorded(page);
  await page.route("**/data/distributions.json", (r) => r.fulfill({ status: 404, body: "404: Not Found" }));
  await page.goto("/league/130000/matchups");
  await expect(page.getByRole("alert")).toContainText("Win probabilities appear after the next Model update");
});
