import { expect, test } from "@playwright/test";
import { serveRecorded } from "./recorded";

test.beforeEach(({ page }) => serveRecorded(page));

test("opens a League from Home and shows Squad strength and the table", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("League ID").fill("5000");
  await page.getByRole("button", { name: "Open League" }).click();

  await expect(page).toHaveURL(/\/league\/5000$/);
  await expect(page.getByRole("heading", { name: "Test Classic League" })).toBeVisible();
  const strength = page.getByRole("region", { name: "Squad strength" });
  await expect(strength.getByRole("listitem")).toHaveCount(8);
  await expect(page.getByRole("region", { name: "League table" }).getByRole("row")).toHaveCount(9);

  await strength.getByRole("radio", { name: "Next 6" }).click();
  await expect(strength.getByRole("radio", { name: "Next 6" })).toHaveAttribute("aria-checked", "true");
  await expect(strength).toContainText("GW10–15");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("opens a Manager's Squad from the League screen and goes back", async ({ page }) => {
  await page.goto("/league/5000?h=6");
  const first = page.getByRole("region", { name: "Squad strength" }).getByRole("link").first();
  const team = (await first.locator(".team").textContent())!;
  const strength = (await first.locator(".value").textContent())!;
  await first.click();

  await expect(page).toHaveURL(/\/league\/5000\/manager\/\d+\?h=6$/);
  await expect(page.getByRole("heading", { name: team, level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: /Squad strength/ })).toContainText(strength);
  const squad = page.getByRole("region", { name: "Squad" });
  await expect(squad.locator("tbody tr:not(.pos-row)")).toHaveCount(15);
  await expect(squad.getByRole("rowheader", { name: "Goalkeepers" })).toBeVisible();
  await expect(squad.getByRole("columnheader", { name: "GW15" })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByRole("link", { name: "← Test Classic League" }).click();
  await expect(page).toHaveURL(/\/league\/5000\?h=6$/);
});

test("claims a Manager per League, remembers it, and can clear it", async ({ page }) => {
  const relayed: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/api/fpl/")) relayed.push(new URL(r.url()).pathname); });

  await page.goto("/league/5000");
  await expect(page.getByRole("region", { name: "Squad strength" })).toBeVisible();
  await expect(page.locator(".me")).toHaveCount(0);
  await page.getByLabel("Are you in this League?").selectOption({ label: "Team C (Manager C)" });

  const you = page.getByRole("region", { name: "Your Manager" });
  await expect(you).toContainText("You're Team C");
  await page.reload();
  await expect(you).toContainText("You're Team C");
  const strengthMe = page.getByRole("region", { name: "Squad strength" }).locator("li.me");
  await expect(strengthMe).toHaveCount(1);
  await expect(strengthMe).toContainText("Team C");
  await expect(page.getByRole("region", { name: "League table" }).locator("tr.me")).toContainText("Team C");

  // Another League has its own claim.
  await page.goto("/league/130000");
  await expect(page.getByLabel("Are you in this League?")).toBeVisible();
  await expect(page.locator(".me")).toHaveCount(0);

  // The Squad screen shows the claim and can clear it.
  await page.goto("/league/5000");
  await strengthMe.getByRole("link").click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("You");
  await page.getByRole("button", { name: "Not me" }).click();
  await expect(page.getByRole("button", { name: "This is me" })).toBeVisible();
  await page.getByRole("link", { name: "← Test Classic League" }).click();
  await expect(page.locator(".me")).toHaveCount(0);

  // The claim never leaves the browser: only League data is relayed.
  expect(relayed.every((p) => /^\/api\/fpl\/league\/\d+\/(details|element-status)$/.test(p))).toBe(true);
});

test("explains a Manager who isn't in the League", async ({ page }) => {
  await page.goto("/league/5000/manager/1");
  await expect(page.getByRole("alert")).toContainText("isn't in this League");
});

test("shows Head-to-head table columns for a Head-to-head League", async ({ page }) => {
  await page.goto("/league/130000");
  await expect(page.getByText(/Head-to-head · 8 Managers/)).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "W" })).toBeVisible();
});

test("explains an unknown League ID", async ({ page }) => {
  await page.goto("/league/999");
  await expect(page.getByRole("alert")).toContainText("no FPL Draft League with ID 999");
});

test("rejects a League ID that isn't a number", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("League ID").fill("my league");
  await page.getByRole("button", { name: "Open League" }).click();
  await expect(page.getByText("A League ID is a number")).toBeVisible();
});
