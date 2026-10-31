import { expect, test, type Page } from "@playwright/test";
import { fixture, serveRecorded } from "./recorded";

test.beforeEach(({ page }) => serveRecorded(page));

const tab = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "League sections" }).getByRole("link", { name, exact: true });

test("opens a League from Home and shows Squad strength and the table", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("League ID", { exact: true }).fill("5000");
  await page.getByRole("button", { name: "Open League" }).click();

  await expect(page).toHaveURL(/\/league\/5000$/);
  await expect(page.getByRole("heading", { name: "Test Classic League", level: 1 })).toBeVisible();
  const strength = page.getByRole("region", { name: "Squad strength" });
  await expect(strength.getByRole("listitem")).toHaveCount(8);
  await expect(page.getByRole("region", { name: "League table" }).getByRole("row")).toHaveCount(9);

  await strength.getByRole("radio", { name: "Next 6" }).click();
  await expect(strength.getByRole("radio", { name: "Next 6" })).toHaveAttribute("aria-checked", "true");
  await expect(strength).toContainText("GW10–15");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("has a bottom tab bar: League, Squad, Targets, Trades, More", async ({ page }) => {
  await page.goto("/league/5000");
  const links = page.getByRole("navigation", { name: "League sections" }).getByRole("link");
  await expect(links).toHaveText(["League", "Squad", "Targets", "Trades", "More"]);
  await expect(tab(page, "League")).toHaveAttribute("aria-current", "page");
  // The header band shows the gameweek, last update and Model settings on every screen.
  for (const [name, title] of [["Squad", /.+/], ["Targets", "Targets"], ["Trades", "Trades"], ["More", "More"]] as const) {
    await tab(page, name).click();
    await expect(tab(page, name)).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.getByRole("banner")).toContainText("Gameweek 10");
    await expect(page.getByRole("banner")).toContainText(/Updated .+ · Model v1: xG weight \d/);
  }
});

test("puts Fixtures in the Trades slot when a League has Trades off", async ({ page }) => {
  await page.route("**/api/fpl/league/5000/details", (r) => {
    const d = JSON.parse(fixture("classic-details.json"));
    d.league.trades = "n";
    return r.fulfill({ body: JSON.stringify(d), contentType: "application/json" });
  });
  await page.goto("/league/5000");
  const links = page.getByRole("navigation", { name: "League sections" }).getByRole("link");
  await expect(links).toHaveText(["League", "Squad", "Targets", "Fixtures", "More"]);
  await tab(page, "Fixtures").click();
  await expect(page.getByRole("region", { name: "Fixture ticker" })).toBeVisible();
});

test("sends addresses from before the new navigation to their new place", async ({ page }) => {
  await page.goto("/league/5000/waivers");
  await expect(page).toHaveURL(/\/league\/5000\/targets$/);
  await page.goto("/league/5000/matchups");
  await expect(page).toHaveURL(/\/league\/5000$/);
});

test("opens a Manager's Squad as a team sheet and goes back", async ({ page }) => {
  await page.goto("/league/5000?h=6");
  const first = page.getByRole("region", { name: "Squad strength" }).getByRole("link").first();
  const team = (await first.locator(".team").textContent())!;
  const strength = (await first.locator(".value").textContent())!;
  await first.click();

  await expect(page).toHaveURL(/\/league\/5000\/squad\/\d+\?h=6$/);
  await expect(page.getByRole("heading", { name: team, level: 1 })).toBeVisible();
  await expect(tab(page, "Squad")).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("region", { name: /Squad strength/ })).toContainText(strength);
  const sheet = page.getByRole("list", { name: "Team sheet" });
  await expect(sheet.locator(".sheet-row")).toHaveCount(15);
  await expect(sheet).toContainText("Goalkeepers");
  const grid = page.getByRole("region", { name: "Gameweek by gameweek" });
  await expect(grid.getByRole("columnheader", { name: "GW15" })).toBeVisible();

  // Pick another Manager from the selector.
  const select = page.getByLabel("Manager");
  const other = await select.locator("option").nth(1).getAttribute("value");
  await select.selectOption(other!);
  await expect(page).toHaveURL(new RegExp(`/squad/${other}`));

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await tab(page, "League").click();
  await expect(page).toHaveURL(/\/league\/5000\?h=6$/);
});

test("claims a Manager per League, remembers it, and can clear it", async ({ page }) => {
  const relayed: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/api/fpl/")) relayed.push(new URL(r.url()).pathname); });

  await page.goto("/league/5000");
  await expect(page.getByRole("region", { name: "Squad strength" })).toBeVisible();
  await expect(page.locator(".me")).toHaveCount(0);
  await page.getByLabel("Are you in this League?").selectOption({ label: "Team C (Manager C)" });

  const strengthMe = page.getByRole("region", { name: "Squad strength" }).locator("li.me");
  await expect(strengthMe).toContainText("Team C");
  await page.reload();
  await expect(strengthMe).toHaveCount(1);
  await expect(strengthMe).toContainText("Team C");
  await expect(page.getByRole("region", { name: "League table" }).locator("tr.me")).toContainText("Team C");
  // Once claimed, the picker moves to More › Settings.
  await expect(page.getByLabel("Are you in this League?")).toHaveCount(0);
  await tab(page, "More").click();
  await expect(page.getByRole("region", { name: "Your Manager" })).toContainText("You're Team C");

  // Another League has its own claim.
  await page.goto("/league/130000");
  await expect(page.getByLabel("Are you in this League?")).toBeVisible();
  await expect(page.locator(".me")).toHaveCount(0);

  // The Squad tab opens on the Claimed Manager and can clear the claim.
  await page.goto("/league/5000");
  await tab(page, "Squad").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Team C");
  await page.getByRole("button", { name: "Not me" }).click();
  await expect(page.getByRole("button", { name: "This is me" })).toBeVisible();
  await tab(page, "League").click();
  await expect(page.locator(".me")).toHaveCount(0);

  // The claim never leaves the browser: only public League data, lineups and histories are relayed.
  expect(relayed.every((p) => /^\/api\/fpl\/(league\/\d+\/(details|element-status)|entry\/\d+\/(event\/\d+|history))$/.test(p))).toBe(true);
});

test("explains a Manager who isn't in the League", async ({ page }) => {
  await page.goto("/league/5000/squad/1");
  await expect(page.getByRole("alert")).toContainText("isn't in this League");
});

test("shows Head-to-head table columns for a Head-to-head League", async ({ page }) => {
  await page.goto("/league/130000");
  await expect(page.getByText(/Head-to-head · 8 Managers/)).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "W", exact: true })).toBeVisible();
});

test("explains an unknown League ID", async ({ page }) => {
  await page.goto("/league/999");
  await expect(page.getByRole("alert")).toContainText("no FPL Draft League with ID 999");
});

test("rejects a League ID that isn't a number", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("League ID", { exact: true }).fill("my league");
  await page.getByRole("button", { name: "Open League" }).click();
  await expect(page.getByText("A League ID is a number")).toBeVisible();
});

test("offers the deadlines calendar for Apple, Outlook and Google under More", async ({ page }) => {
  await page.goto("/league/5000/more");
  const host = new URL(page.url()).host;
  await expect(page.getByRole("link", { name: "Apple or Outlook Calendar" })).toHaveAttribute("href", `webcal://${host}/deadlines.ics`);
  await expect(page.getByRole("link", { name: "Google Calendar" })).toHaveAttribute(
    "href", `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(`webcal://${host}/deadlines.ics`)}`);
});

test("shows Season points by position with top scorers, a Points / % share toggle and sorting", async ({ page }) => {
  await page.goto("/league/5000");
  const section = page.getByRole("region", { name: "Season points by position", exact: true });
  const rows = section.locator(".bypos > li");
  await expect(rows).toHaveCount(8);
  // Each Manager's season total matches the League table.
  const leader = await page.getByRole("region", { name: "League table" }).getByRole("row").nth(1).locator("td").last().textContent();
  await expect(rows.first().locator(".figure")).toHaveText(`${leader} pts`);
  await expect(rows.first().locator(".values")).toContainText(/GKP \d+\s*DEF \d+\s*MID \d+\s*FWD \d+/);
  await expect(rows.first().locator(".top3")).toContainText(/1\. .+ \d+ · 2\. .+ \d+ · 3\. .+ \d+/);

  await section.getByRole("radio", { name: "% share" }).click();
  await section.getByRole("radio", { name: "MID" }).click();
  const mids = (await rows.locator(".figure").allTextContents()).map((t) => Number(t.match(/(\d+)%/)![1]));
  expect(mids).toEqual([...mids].sort((a, b) => b - a));

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("charts every Manager's rank over time and highlights one from the legend", async ({ page }) => {
  await page.goto("/league/5000");
  await page.getByLabel("Are you in this League?").selectOption({ label: "Team C (Manager C)" });
  const section = page.getByRole("region", { name: "Rank over time" });
  await expect(section.getByRole("img")).toBeVisible();
  await expect(section.locator("polyline")).toHaveCount(8);
  await expect(section.locator("polyline.mine")).toHaveCount(1);

  // The legend ends on each Manager's current table rank. Pick the 2nd-placed
  // Manager (not Team C, who leads), so the Claimed Manager's line stays accent.
  const table = page.getByRole("region", { name: "League table" });
  const second = (await table.getByRole("row").nth(2).locator(".team").textContent())!;
  expect(second).not.toBe("Team C");
  const button = section.getByRole("button", { name: new RegExp(second) });
  await expect(button).toContainText(/→ 2nd/);

  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(section.locator("polyline.picked")).toHaveCount(1);
  await expect(section.locator("polyline.mine")).toHaveCount(1);
  await expect(section.locator("polyline.dim")).toHaveCount(6);
  await button.click();
  await expect(section.locator("polyline.picked")).toHaveCount(0);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("shows points per gameweek against the League average and best", async ({ page }) => {
  const histories: string[] = [];
  page.on("request", (r) => { if (r.url().endsWith("/history")) histories.push(r.url()); });
  await page.goto("/league/5000");
  const section = page.getByRole("region", { name: "Points per gameweek" });
  await expect(section.locator("circle.best")).toHaveCount(8);
  await expect(section.locator("rect.bar")).toHaveCount(0);
  await expect(section).toContainText("Claim your Manager to see your own points as bars.");

  await page.getByLabel("Are you in this League?").selectOption({ label: "Team C (Manager C)" });
  await expect(section.locator("rect.bar")).toHaveCount(8);
  await expect(section.locator("polyline.avg")).toHaveCount(1);
  await expect(section.locator(".ppg-key")).toContainText("Team C");
  // Both Season charts share one history request per Manager.
  expect(histories).toHaveLength(8);
});

test("shows each Manager's last 3 gameweek scores in the table, without sideways scrolling", async ({ page }) => {
  const details = JSON.parse(fixture("classic-details.json"));
  const first = details.league_entries[0];
  const history = JSON.parse(fixture(`history/${first.entry_id}.json`)).history
    .filter((r: { event: number }) => r.event <= 8).map((r: { points: number }) => r.points);
  await page.goto("/league/5000");
  const row = page.getByRole("region", { name: "League table" }).getByRole("row").filter({ hasText: first.entry_name });
  await expect(row.locator(".last3")).toHaveText(`Last 3: ${history.slice(-3).join(" · ")}`);

  for (const id of ["5000", "130000"]) {
    await page.goto(`/league/${id}`);
    const scroll = page.getByRole("region", { name: "League table" }).locator(".scroll");
    await expect(scroll.locator(".last3").first()).not.toHaveText("Last 3: …");
    expect(await scroll.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  }
});

test("shows the current Squad's season points by position, which isn't the League score", async ({ page }) => {
  await page.goto("/league/5000");
  const section = page.getByRole("region", { name: "Current Squad's season points by position" });
  const rows = section.locator(".bypos > li");
  await expect(rows).toHaveCount(8);
  await expect(section).toContainText("Not the League score");
  await expect(rows.first().locator(".top3")).toContainText(/1\. .+ \d+/);
  await expect(rows.first().locator(".left-squad")).toHaveCount(0);
});
