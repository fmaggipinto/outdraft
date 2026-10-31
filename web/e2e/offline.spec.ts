import { expect, test, type Page } from "@playwright/test";
import { serveRecorded } from "./recorded";

async function breakData(page: Page) {
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.route("**/api/fpl/**", (r) => r.abort("internetdisconnected"));
  await page.route("**/data/**", (r) => r.abort("internetdisconnected"));
}

test.describe("with the data sources down", () => {
  test.use({ serviceWorkers: "block" });

  test("still shows a League opened before, with a notice saying how old the data is", async ({ page }) => {
    await serveRecorded(page);
    await page.goto("/league/5000");
    await expect(page.getByRole("region", { name: "Squad strength" })).toBeVisible();
    await expect(page.getByText("FPL Draft isn't responding")).toHaveCount(0);

    await breakData(page);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Test Classic League" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Squad strength" }).getByRole("listitem")).toHaveCount(8);
    await expect(page.getByRole("status").filter({ hasText: "FPL Draft isn't responding" })).toContainText("saved on this device");
    await page.screenshot({ path: "test-results/offline.png" });
  });

  test("explains clearly when a League was never opened", async ({ page }) => {
    await breakData(page);
    await page.goto("/league/130000");
    await expect(page.getByRole("alert")).toContainText("Couldn't load this League right now");
  });

  test("drops the notice once the data is fresh again", async ({ page }) => {
    await serveRecorded(page);
    await page.goto("/league/5000");
    await expect(page.getByRole("region", { name: "Squad strength" })).toBeVisible();
    await breakData(page);
    await page.reload();
    await expect(page.getByText("FPL Draft isn't responding")).toBeVisible();
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await serveRecorded(page);
    await page.getByRole("button", { name: "Try again" }).first().click();
    await expect(page.getByRole("region", { name: "Squad strength" })).toBeVisible();
    await expect(page.getByText("FPL Draft isn't responding")).toHaveCount(0);
  });
});

test("opens with no connection at all once it has been used", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "Service worker check runs in Chromium");
  await serveRecorded(page);
  await page.goto("/league/5000");
  await expect(page.getByRole("region", { name: "Squad strength" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 10_000 }).toBe(true);
  // Load once more under the service worker so it saves the page and its files.
  await page.reload();
  await expect(page.getByRole("region", { name: "Squad strength" })).toBeVisible();

  // Recorded-data routes would still answer offline, so remove them first.
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Test Classic League" })).toBeVisible();
  await expect(page.getByText("FPL Draft isn't responding")).toBeVisible();
  await context.setOffline(false);
});
