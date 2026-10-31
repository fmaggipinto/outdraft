import { describe, expect, it } from "vitest";
import classicDetails from "../../tests/fixtures/classic-details.json";
import classicStatus from "../../tests/fixtures/classic-element-status.json";
import h2hDetails from "../../tests/fixtures/h2h-details.json";
import h2hStatus from "../../tests/fixtures/h2h-element-status.json";
import projectionsJson from "../../tests/fixtures/projections.json";
import type { ElementStatus, LeagueDetails, Projections } from "../types";
import { DRAFT_SQUAD_RULES } from "./bestXI";
import { analyseLeague } from "./league";
import { winWinTrades } from "./trades";

const projections = projectionsJson as unknown as Projections;
const position = new Map(projections.players.map((p) => [p.id, p.position]));
const leagues = [
  ["Classic", classicDetails, classicStatus],
  ["H2H", h2hDetails, h2hStatus],
] as const;

describe.each(leagues)("%s League", (_, detailsJson, statusJson) => {
  const details = detailsJson as LeagueDetails, status = statusJson as ElementStatus;
  const league = analyseLeague(details, status, projections);
  const all = league.managers.map((me) => ({ me, trades: winWinTrades(me, league.managers, projections) }));

  it("finds Win-win trades for some Managers", () => {
    expect(all.some((x) => x.trades.length > 0)).toBe(true);
  });

  it("raises both Squads' strength, as the League analysis computes it after the Trade", () => {
    for (const { me, trades } of all) {
      for (const t of trades.slice(0, 5)) {
        const give = new Set(t.give.map((p) => p.id)), get = new Set(t.get.map((p) => p.id));
        const swapped = {
          element_status: status.element_status.map((e) =>
            give.has(e.element) ? { ...e, owner: t.rival.entryId } : get.has(e.element) ? { ...e, owner: me.entryId } : e),
        };
        const after = analyseLeague(details, swapped, projections).managers;
        const meAfter = after.find((m) => m.entryId === me.entryId)!;
        const rivalAfter = after.find((m) => m.entryId === t.rival.entryId)!;
        expect(meAfter.strength[3] - me.strength[3]).toBeCloseTo(t.myGain, 6);
        expect(rivalAfter.strength[3] - t.rival.strength[3]).toBeCloseTo(t.rivalGain, 6);
        expect(t.myGain).toBeGreaterThan(0);
        expect(t.rivalGain).toBeGreaterThan(0);

        // Both Squads keep their shape, so both can field a valid Best XI.
        for (const m of [meAfter, rivalAfter]) {
          const count = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<number, number>;
          m.bestXIs[0].ids.forEach((id) => count[position.get(id)!]++);
          expect(m.bestXIs[0].ids).toHaveLength(11);
          for (const p of [1, 2, 3, 4]) {
            expect(count[p]).toBeGreaterThanOrEqual(DRAFT_SQUAD_RULES.min_play[p]);
            expect(count[p]).toBeLessThanOrEqual(DRAFT_SQUAD_RULES.max_play[p]);
          }
        }
      }
    }
  });

  it("swaps only like for like, 1-for-1 or 2-for-2, between the right Squads", () => {
    for (const { me, trades } of all) {
      for (const t of trades) {
        expect([1, 2]).toContain(t.give.length);
        expect(t.get).toHaveLength(t.give.length);
        expect(t.give.map((p) => p.position).sort()).toEqual(t.get.map((p) => p.position).sort());
        expect(t.give.every((p) => me.squad.includes(p.id))).toBe(true);
        expect(t.get.every((p) => t.rival.squad.includes(p.id))).toBe(true);
        expect(t.rival.entryId).not.toBe(me.entryId);
      }
    }
  });

  it("ranks Trades by the smaller of the two gains", () => {
    for (const { trades } of all) {
      const keys = trades.map((t) => Math.min(t.myGain, t.rivalGain));
      expect(keys).toEqual([...keys].sort((a, b) => b - a));
    }
  });
});

it("searches a whole 8-Manager League quickly", () => {
  const league = analyseLeague(classicDetails as LeagueDetails, classicStatus as ElementStatus, projections);
  const start = performance.now();
  for (const me of league.managers) winWinTrades(me, league.managers, projections);
  const perManager = (performance.now() - start) / league.managers.length;
  // A mid-range phone is roughly 4x slower than this machine; the screen
  // searches for one Manager, so this keeps it well under 2 seconds there.
  expect(perManager).toBeLessThan(400);
});
