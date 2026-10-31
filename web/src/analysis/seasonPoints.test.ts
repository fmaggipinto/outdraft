import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import classicDetails from "../../tests/fixtures/classic-details.json";
import classicStatus from "../../tests/fixtures/classic-element-status.json";
import projectionsJson from "../../tests/fixtures/projections.json";
import resultsJson from "../../tests/fixtures/results.json";
import type { ElementStatus, LeagueDetails, Picks, Projections, Results } from "../types";
import { analyseLeague } from "./league";
import { benchPoints, currentSquadPoints, POSITIONS, seasonPointsByPosition, sortRows, startingXI } from "./seasonPoints";

const projections = projectionsJson as unknown as Projections;
const results = resultsJson as Results;
const status = classicStatus as ElementStatus;
const league = analyseLeague(classicDetails as LeagueDetails, status, projections);

// Recorded lineups: tests/fixtures/picks/{entry}-{gw}.json
const dir = new URL("../../tests/fixtures/picks/", import.meta.url);
const picks = new Map<number, Map<number, Picks>>();
for (const f of readdirSync(dir)) {
  const [entry, gw] = f.replace(".json", "").split("-").map(Number);
  if (!picks.has(entry)) picks.set(entry, new Map());
  picks.get(entry)!.set(gw, JSON.parse(readFileSync(new URL(f, dir), "utf8")));
}
const rows = seasonPointsByPosition({ managers: league.managers, picks, results, players: projections.players, status });

describe("startingXI", () => {
  const lineup: Picks = { picks: Array.from({ length: 15 }, (_, i) => ({ element: 100 + i, position: i + 1 })) };

  it("is picks 1–11 with no subs", () => {
    expect(startingXI(lineup).sort()).toEqual(Array.from({ length: 11 }, (_, i) => 100 + i));
  });

  it("applies auto-subs: the starter out, the bench Player in", () => {
    const xi = startingXI({ ...lineup, subs: [{ element_in: 112, element_out: 103 }] });
    expect(xi).toHaveLength(11);
    expect(xi).toContain(112);
    expect(xi).not.toContain(103);
  });

  it("keeps 11 starters in every recorded lineup", () => {
    for (const byGw of picks.values()) for (const p of byGw.values()) expect(startingXI(p)).toHaveLength(11);
  });
});

describe("seasonPointsByPosition on a recorded League", () => {
  it("has a row per Manager with lineups for every finished gameweek", () => {
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.gameweeks === 8)).toBe(true);
  });

  it("adds positions up to each Manager's total", () => {
    for (const r of rows) expect(POSITIONS.reduce((s, p) => s + r.byPosition[p], 0)).toBe(r.total);
  });

  it("matches the League's own points, counting starters after auto-subs", () => {
    // In a Classic League the table total is the sum of starting XI points.
    for (const r of rows) expect(r.total).toBe(r.manager.table.total);
  });

  it("lists the top 3 scorers, best first, and marks those no longer in the Squad", () => {
    for (const r of rows) {
      expect(r.top).toHaveLength(3);
      expect(r.top.map((s) => s.points)).toEqual([...r.top.map((s) => s.points)].sort((a, b) => b - a));
      for (const s of r.top) expect(s.stillOwned).toBe(r.manager.squad.includes(s.player.id));
    }
  });

  it("counts a Manager who joined late only from their first lineup", () => {
    const first = league.managers[0];
    const partial = new Map(picks);
    partial.set(first.entryId, new Map([...picks.get(first.entryId)!].filter(([gw]) => gw >= 5)));
    const row = seasonPointsByPosition({ managers: [first], picks: partial, results, players: projections.players, status })[0];
    expect(row.gameweeks).toBe(4);
    expect(row.total).toBeLessThan(rows.find((r) => r.manager.entryId === first.entryId)!.total);
  });
});

describe("sortRows", () => {
  it("sorts by total, by a position's points, or by its share", () => {
    const byTotal = sortRows(rows, null, "points").map((r) => r.total);
    expect(byTotal).toEqual([...byTotal].sort((a, b) => b - a));
    const byMid = sortRows(rows, 3, "points").map((r) => r.byPosition[3]);
    expect(byMid).toEqual([...byMid].sort((a, b) => b - a));
    const share = sortRows(rows, 2, "share").map((r) => r.byPosition[2] / r.total);
    expect(share).toEqual([...share].sort((a, b) => b - a));
  });
});

describe("currentSquadPoints", () => {
  const current = currentSquadPoints(league.managers, projections.players);
  const byId = new Map(projections.players.map((p) => [p.id, p]));

  it("sums the season points of the Players each Squad holds now, by position", () => {
    for (const r of current) {
      expect(r.total).toBe(r.manager.squad.reduce((s, id) => s + (byId.get(id)?.total_points ?? 0), 0));
      for (const pos of POSITIONS) {
        expect(r.byPosition[pos]).toBe(r.manager.squad.filter((id) => byId.get(id)?.position === pos)
          .reduce((s, id) => s + byId.get(id)!.total_points, 0));
      }
    }
  });

  it("is a different figure from the League score", () => {
    expect(current.some((r) => r.total !== r.manager.table.total)).toBe(true);
  });

  it("names each Squad's 3 highest scorers, all still owned", () => {
    for (const r of current) {
      expect(r.top).toHaveLength(3);
      expect(r.top.every((s) => s.stillOwned && r.manager.squad.includes(s.player.id))).toBe(true);
    }
  });
});

describe("benchPoints", () => {
  const sumOf = (ids: number[], i: number) => ids.reduce((t, id) => t + (results.players[String(id)]?.[i] ?? 0), 0);

  it("is everyone's points minus the starters', for every recorded gameweek", () => {
    for (const [entry, byGw] of picks) {
      const b = benchPoints(byGw, results);
      expect(b.rows.map((r) => r.gameweek)).toEqual(results.gameweeks);
      for (const r of b.rows) {
        const i = results.gameweeks.indexOf(r.gameweek);
        const p = byGw.get(r.gameweek)!;
        expect(r.points).toBe(sumOf(p.picks.map((x) => x.element), i) - sumOf(startingXI(p), i));
      }
      expect(b.total).toBe(b.rows.reduce((s, r) => s + r.points, 0));
      expect(entry).toBeGreaterThan(0);
    }
  });

  it("finds real bench points in the recorded League (the API's own figure is always 0)", () => {
    const totals = [...picks.values()].map((byGw) => benchPoints(byGw, results).total);
    expect(totals.some((t) => t > 0)).toBe(true);
  });

  it("counts a subbed-on bench Player as a starter, not as bench", () => {
    const lineup: Picks = {
      picks: Array.from({ length: 15 }, (_, i) => ({ element: 1000 + i, position: i + 1 })),
      subs: [{ element_in: 1012, element_out: 1003 }],
    };
    const fake: Results = { updated_at: "", gameweeks: [1], players: { 1012: [7], 1003: [0], 1013: [2] } };
    expect(benchPoints(new Map([[1, lineup]]), fake).rows[0].points).toBe(2);
  });
});
