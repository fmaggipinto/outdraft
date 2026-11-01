import { expect, test } from "@playwright/test";
import { fixture, serveRecorded } from "./recorded";

const results = JSON.parse(fixture("results.json"));

test("says when the Model check will start, before the first Snapshot gameweek finishes", async ({ page }) => {
  await serveRecorded(page);
  await page.goto("/league/5000/more");
  const section = page.getByRole("region", { name: "Model check" });
  await expect(section).toContainText("The first Snapshot is GW10. The Model check starts once that gameweek finishes.");
  await expect(section.getByRole("row", { name: /GW10/ })).toContainText("waiting for the gameweek to finish");
});

test("compares Snapshots with actual points, shows gaps, and your Squad", async ({ page }) => {
  await serveRecorded(page);
  // Made-up Snapshots for finished GW6 and GW8 (each Player's actual score plus 1), and a missed GW7.
  await page.route("**/data/manifest.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({
    first_snapshot_gameweek: 6, snapshots: [6, 8], gaps: [7], model: { version: 1, params: { w: 0.5, k: 1 } } }) }));
  await page.route("**/data/snapshots/*.json", (r) => {
    const gw = Number(new URL(r.request().url()).pathname.match(/gw(\d+)\.json/)![1]);
    const i = results.gameweeks.indexOf(gw);
    const projections = Object.fromEntries(Object.entries(results.players as Record<string, number[]>).map(([id, p]) => [id, p[i] + 1]));
    return r.fulfill({ contentType: "application/json", body: JSON.stringify({ gameweek: gw, deadline: "", model_version: 1, projections }) });
  });
  await page.goto("/league/5000");
  await page.getByLabel("Are you in this League?").selectOption({ label: "Team C (Manager C)" });
  await page.goto("/league/5000/more");

  const section = page.getByRole("region", { name: "Model check" });
  await expect(section.getByRole("img", { name: /Correlation by gameweek: GW6 \d\.\d\d, GW8 \d\.\d\d/ })).toBeVisible();
  await expect(section.getByRole("row", { name: /GW6/ })).toContainText(/1\.00 pts/);
  await expect(section.getByRole("row", { name: /GW7/ })).toContainText("No Snapshot: missed");
  await expect(section).toContainText("Only 2 gameweeks so far");
  await expect(section.getByRole("heading", { name: /Your Squad in GW8: predicted vs actual/ })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await section.screenshot({ path: "test-results/model-check.png" });
});
