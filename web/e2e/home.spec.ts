import { expect, test, type Page } from "@playwright/test";
import { fixture, serveRecorded } from "./recorded";

const entry = JSON.parse(fixture("entry-public.json"));

async function serveEntry(page: Page, leagueSet: number[] | null) {
  await page.route("**/api/fpl/entry/*/public", (r) =>
    leagueSet
      ? r.fulfill({ body: JSON.stringify({ entry: { ...entry.entry, league_set: leagueSet } }), contentType: "application/json" })
      : r.fulfill({ status: 404, body: '{"error":"not found"}' }));
}

test.beforeEach(({ page }) => serveRecorded(page));

test("finds a League from a team ID and claims that Manager", async ({ page }) => {
  await serveEntry(page, [5000]);
  await page.goto("/");
  await page.getByLabel("Don't know your League ID? Use your team ID").fill(String(entry.entry.id));
  await page.getByRole("button", { name: "Find my League" }).click();
  await expect(page).toHaveURL(/\/league\/5000$/);
  await expect(page.getByRole("region", { name: "Squad strength" }).locator("li.me")).toContainText("Team A");
});

test("asks which League when a team is in several", async ({ page }) => {
  await serveEntry(page, [5000, 130000]);
  await page.goto("/");
  await page.getByLabel("Don't know your League ID? Use your team ID").fill("21292");
  await page.getByRole("button", { name: "Find my League" }).click();
  const choose = page.getByRole("group", { name: "Choose a League" });
  await expect(choose).toContainText("is in 2 Leagues");
  await choose.getByRole("button", { name: "Test H2H League" }).click();
  await expect(page).toHaveURL(/\/league\/130000$/);
});

test("explains an unknown team ID", async ({ page }) => {
  await serveEntry(page, null);
  await page.goto("/");
  await page.getByLabel("Don't know your League ID? Use your team ID").fill("999");
  await page.getByRole("button", { name: "Find my League" }).click();
  await expect(page.getByRole("alert")).toContainText("There's no FPL Draft team with ID 999");
});

test("lists Leagues opened on this device and can remove them", async ({ page }) => {
  await page.goto("/league/5000");
  await expect(page.getByRole("heading", { name: "Test Classic League" })).toBeVisible();
  await page.goto("/league/130000");
  await expect(page.getByRole("heading", { name: "Test H2H League" })).toBeVisible();
  await page.goto("/");
  const yours = page.getByRole("region", { name: "Your Leagues" });
  await expect(yours.getByRole("link")).toHaveText(["Test H2H League", "Test Classic League"]);
  await yours.getByRole("button", { name: "Remove Test H2H League" }).click();
  await expect(yours.getByRole("link")).toHaveText(["Test Classic League"]);
  await page.reload();
  await expect(page.getByRole("region", { name: "Your Leagues" }).getByRole("link")).toHaveText(["Test Classic League"]);
});

test("can be installed as an app", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Installability is checked with Chrome's DevTools protocol");
  await page.goto("/");
  await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()))).toBe(true);
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  expect(installabilityErrors).toEqual([]);
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
});
