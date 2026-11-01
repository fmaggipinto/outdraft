import { expect, test } from "@playwright/test";
import { fixture, serveRecorded } from "./recorded";

const status = JSON.parse(fixture("classic-element-status.json")).element_status as { element: number; owner: number | null }[];
const projections = JSON.parse(fixture("projections.json"));
const owned = new Set(status.filter((e) => e.owner != null).map((e) => e.element));

test.beforeEach(({ page }) => serveRecorded(page));

test("browses Free agents by position, search and sort", async ({ page }) => {
  await page.goto("/league/5000/targets");
  const card = page.getByRole("region", { name: "Free agents" });
  const rows = card.getByRole("listitem");
  await expect(rows).toHaveCount(25);

  await card.getByRole("radio", { name: "GKP" }).click();
  const positions = await rows.locator(".who > span:first-child > .muted.small").allTextContents();
  expect(positions.length).toBeGreaterThan(0);
  for (const text of positions) expect(text).toMatch(/^GKP · /);

  await card.getByLabel("Sort by").selectOption("points");
  const pts = (await rows.locator(".stats").allTextContents()).map((t) => Number(t.match(/(\d+) pts/)![1]));
  expect(pts).toEqual([...pts].sort((a, b) => b - a));

  // Search finds an unowned Player by name, without accents.
  const target = projections.players.find((p: { id: number; minutes: number }) => !owned.has(p.id) && p.minutes > 0);
  await card.getByRole("radio", { name: "All" }).click();
  await card.getByLabel("Search Players").fill(target.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase());
  await expect(rows.first()).toContainText(target.name);

  await card.getByLabel("Search Players").fill("zzzz");
  await expect(card).toContainText("No Free agents match.");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("compares any two Players, owned or not", async ({ page }) => {
  await page.goto("/league/5000/targets");
  const first = page.getByRole("region", { name: "Free agents" }).getByRole("listitem").first();
  const name = (await first.locator(".team").textContent())!;
  await first.getByRole("button", { name: `Compare ${name}` }).click();
  await expect(page.getByRole("region", { name: "Comparing" })).toContainText(name);
  await page.getByRole("button", { name: "Search instead" }).click();
  await expect(page.getByRole("region", { name: "Comparing" })).toHaveCount(0);

  const cmp = page.getByRole("region", { name: "Compare two Players" });
  const ownedPlayer = projections.players.find((p: { id: number }) => owned.has(p.id));
  await expect(cmp.getByLabel("Second Player")).toBeFocused();
  await cmp.getByLabel("Second Player").fill(ownedPlayer.name);
  await cmp.getByRole("button", { name: new RegExp(`^${ownedPlayer.name} `) }).first().click();
  const table = cmp.getByRole("table");
  await expect(table).toContainText(name);
  await expect(table).toContainText(ownedPlayer.name);
  await expect(table).toContainText("Free agent");
  await expect(table.getByRole("rowheader", { name: /Projection GW10–12/ })).toBeVisible();
  await expect(table.getByRole("rowheader", { name: "Next fixtures" })).toBeVisible();
});

test("compares two Free agents with two taps", async ({ page }) => {
  await page.goto("/league/5000/targets");
  const items = page.getByRole("region", { name: "Free agents" }).getByRole("listitem");
  const [a, b] = [(await items.nth(0).locator(".team").textContent())!, (await items.nth(1).locator(".team").textContent())!];
  await items.nth(0).getByRole("button", { name: `Compare ${a}` }).click();
  await expect(items.nth(0).getByRole("button", { name: `Compare ${a}` })).toHaveAttribute("aria-pressed", "true");
  await items.nth(1).getByRole("button", { name: `Compare ${b}` }).click();

  const head = page.getByRole("region", { name: "Compare two Players" }).getByRole("table").locator("thead");
  await expect(head).toContainText(a);
  await expect(head).toContainText(b);
  await expect(page.getByRole("region", { name: "Comparing" })).toHaveCount(0);
});
