import type { Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

export const fixture = (name: string) => readFileSync(new URL(`../tests/fixtures/${name}`, import.meta.url), "utf8");

/** Serve the relay and published Model files from recorded fixtures.
 * `game` overrides fields of the recorded FPL game state. */
export async function serveRecorded(page: Page, game: Record<string, unknown> = {}) {
  const leagues: Record<string, string> = { "5000": "classic", "130000": "h2h" };
  const json = { contentType: "application/json" };
  await page.route("**/data/projections.json", (r) => r.fulfill({ body: fixture("projections.json"), ...json }));
  await page.route("**/data/results.json", (r) => r.fulfill({ body: fixture("results.json"), ...json }));
  await page.route("**/api/fpl/entry/*/event/*", (r) => {
    const [, entry, gw] = new URL(r.request().url()).pathname.match(/entry\/(\d+)\/event\/(\d+)/)!;
    const file = new URL(`../tests/fixtures/picks/${entry}-${gw}.json`, import.meta.url);
    return existsSync(file)
      ? r.fulfill({ body: readFileSync(file, "utf8"), ...json })
      : r.fulfill({ status: 404, body: "{}" });
  });
  await page.route("**/data/distributions.json", (r) => r.fulfill({ body: fixture("distributions.json"), ...json }));
  await page.route("**/api/fpl/game", (r) =>
    r.fulfill({ body: JSON.stringify({ ...JSON.parse(fixture("game.json")), ...game }), ...json }));
  await page.route("**/api/fpl/draft/league/*/transactions", (r) => {
    const id = new URL(r.request().url()).pathname.match(/league\/(\d+)\//)![1];
    return leagues[id]
      ? r.fulfill({ body: fixture(`${leagues[id]}-transactions.json`), ...json })
      : r.fulfill({ status: 404, body: "{}" });
  });
  await page.route("**/api/fpl/league/*/*", (r) => {
    const [, id, kind] = new URL(r.request().url()).pathname.match(/league\/(\d+)\/(details|element-status)/) ?? [];
    if (!leagues[id]) return r.fulfill({ status: 404, body: '{"error":"not found"}' });
    return r.fulfill({ body: fixture(`${leagues[id]}-${kind}.json`), ...json });
  });
}
