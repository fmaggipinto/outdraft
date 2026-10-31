import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const fixture = (name: string) => readFileSync(new URL(`../tests/fixtures/${name}`, import.meta.url), "utf8");

async function serveRecorded(page: Page) {
  const leagues: Record<string, string> = { "5000": "classic", "130000": "h2h" };
  await page.route("**/data/projections.json", (r) => r.fulfill({ body: fixture("projections.json"), contentType: "application/json" }));
  await page.route("**/api/fpl/league/*/*", (r) => {
    const [, id, kind] = new URL(r.request().url()).pathname.match(/league\/(\d+)\/(details|element-status)/) ?? [];
    if (!leagues[id]) return r.fulfill({ status: 404, body: '{"error":"not found"}' });
    return r.fulfill({ body: fixture(`${leagues[id]}-${kind}.json`), contentType: "application/json" });
  });
}

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
