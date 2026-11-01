import { expect, test, type Locator } from "@playwright/test";
import { serveRecorded } from "./recorded";

test.beforeEach(async ({ page }) => {
  await serveRecorded(page);
  await page.goto("/league/5000");
  await page.getByLabel("Are you in this League?").selectOption({ label: "Team C" });
});

/** Every row in a listing renders the shared tag component (even if empty). */
async function everyRowHasTags(rows: Locator) {
  await expect(rows.first()).toBeVisible();
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  await expect(rows.locator(".ptags")).toHaveCount(n);
}

test("tags every Player on the Squad team sheet, with protected on your own", async ({ page }) => {
  await page.goto("/league/5000/squad");
  await everyRowHasTags(page.getByRole("list", { name: "Team sheet" }).locator(".sheet-row"));
  await expect(page.getByRole("list", { name: "Team sheet" }).getByText("Protected", { exact: true }).first()).toBeVisible();

  // Protected is only shown on the Claimed Manager's Players.
  const select = page.getByLabel("Manager");
  const other = await select.locator("option").filter({ hasNotText: "(you)" }).first().getAttribute("value");
  await select.selectOption(other!);
  await expect(page.getByRole("list", { name: "Team sheet" }).getByText("Protected", { exact: true })).toHaveCount(0);
});

test("tags Players on Targets, Free agents, comparisons and Trades", async ({ page }) => {
  await page.goto("/league/5000/targets");
  await everyRowHasTags(page.getByRole("region", { name: "Waiver targets" }).locator(".targets > li .who > span:first-child"));
  await everyRowHasTags(page.getByRole("region", { name: "Free agents" }).locator(".fa-list > li"));
  await expect(page.getByRole("region", { name: "Compare two Players" }).locator("thead .ptags")).toHaveCount(2);

  await page.goto("/league/5000/trades");
  const trades = page.getByRole("region", { name: "Win-win trades" }).locator(".trades > li");
  await expect(trades.first()).toBeVisible();
  const players = trades.locator("p b");
  const n = await players.count();
  expect(n).toBeGreaterThan(0);
  await expect(trades.locator(".ptags")).toHaveCount(n - (await trades.locator(".with b").count()));
});
