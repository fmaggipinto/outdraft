import { expect, test } from "@playwright/test";
import { fixture, serveRecorded } from "./recorded";

const projections = JSON.parse(fixture("projections.json"));
const gw10 = projections.events.find((e: { gameweek: number }) => e.gameweek === 10);
const beforeWaivers = new Date(Date.parse(gw10.waivers_deadline) - 3600_000);
const afterWaivers = new Date(Date.parse(gw10.waivers_deadline) + 3600_000);

test("shows Waiver targets and the Waiver order for the Claimed Manager", async ({ page }) => {
  await page.clock.setFixedTime(beforeWaivers);
  await serveRecorded(page);
  await page.goto("/league/5000");
  await page.getByRole("navigation", { name: "League sections" }).getByRole("link", { name: "Targets", exact: true }).click();
  await expect(page).toHaveURL(/\/league\/5000\/targets/);

  await expect(page.getByRole("region", { name: "Waiver phase" })).toContainText("Waiver claims for GW10");
  await expect(page.getByText("Claim your Manager to see your Waiver targets.")).toBeVisible();

  await page.getByLabel("Are you in this League?").selectOption({ label: "Team C (Manager C)" });
  const targets = page.getByRole("region", { name: "Waiver targets" });
  await expect(targets).toContainText("For Team C");
  const items = targets.getByRole("listitem");
  await expect(items.first()).toContainText("Claim");
  await expect(items.first().locator(".gain")).toHaveText(/^\+\d+\.\d$/);
  await expect(items.first().locator(".rivals")).toContainText(/Rival interest: .+ \+\d+\.\d \((ahead of|behind) you\)|No rival would gain much/);

  const order = page.getByRole("region", { name: "Waiver order" });
  await expect(order.getByRole("listitem")).toHaveCount(8);
  await expect(order.locator("li.me")).toContainText("Team C");
  await expect(order).toContainText(/You're \d+(st|nd|rd|th) of 8/);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("switches to Free agent signings once waivers are processed", async ({ page }) => {
  await page.clock.setFixedTime(afterWaivers);
  await serveRecorded(page, { waivers_processed: true });
  await page.goto("/league/5000/targets");
  await page.getByLabel("Are you in this League?").selectOption({ label: "Team C (Manager C)" });

  await expect(page.getByRole("region", { name: "Waiver phase" })).toContainText("Waivers for GW10 are done");
  const targets = page.getByRole("region", { name: "Free-agent targets" });
  await expect(targets.getByRole("listitem").first()).toContainText("Sign");
  await expect(targets).not.toContainText("On waivers");
  // The Waiver order no longer matters, so no ahead/behind flags or Contested tags.
  await expect(targets.locator(".targets")).not.toContainText("ahead of you");
  await expect(targets.locator(".targets")).not.toContainText("Contested");
});

test("says when waivers are being processed", async ({ page }) => {
  await page.clock.setFixedTime(afterWaivers);
  await serveRecorded(page, { waivers_processed: false });
  await page.goto("/league/5000/targets");
  await expect(page.getByRole("region", { name: "Waiver phase" })).toContainText("FPL is processing claims");
});
