import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import classicDetails from "../../tests/fixtures/classic-details.json";
import classicStatus from "../../tests/fixtures/classic-element-status.json";
import h2hDetails from "../../tests/fixtures/h2h-details.json";
import h2hStatus from "../../tests/fixtures/h2h-element-status.json";
import projectionsJson from "../../tests/fixtures/projections.json";
import type { ElementStatus, LeagueDetails, Projections } from "../types";
import { analyseLeague } from "./league";
import { classicRanks, h2hRanks, type EntryHistory } from "./ranks";

const projections = projectionsJson as unknown as Projections;
const classic = analyseLeague(classicDetails as LeagueDetails, classicStatus as ElementStatus, projections);
const h2h = analyseLeague(h2hDetails as LeagueDetails, h2hStatus as ElementStatus, projections);

const dir = new URL("../../tests/fixtures/history/", import.meta.url);
const histories = new Map<number, EntryHistory>(readdirSync(dir).map((f) =>
  [Number(f.replace(".json", "")), JSON.parse(readFileSync(new URL(f, dir), "utf8"))]));

describe("classicRanks", () => {
  const r = classicRanks(classic, histories, projections.based_on_gameweek);

  it("covers every finished gameweek and leaves out the one in progress", () => {
    expect(r.gameweeks).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("ends on the League table's ranks", () => {
    for (const m of classic.managers) expect(r.ranks.get(m.entryId)!.at(-1)).toBe(m.table.rank);
  });

  it("ranks on running totals, every gameweek a full 1…8", () => {
    for (let i = 0; i < r.gameweeks.length; i++) {
      const totals = classic.managers.map((m) => ({
        rank: r.ranks.get(m.entryId)![i],
        total: r.points.get(m.entryId)!.slice(0, i + 1).reduce<number>((s, x) => s + (x ?? 0), 0),
      }));
      for (const a of totals) for (const b of totals) if (a.total > b.total) expect(a.rank).toBeLessThan(b.rank);
      expect(Math.min(...totals.map((t) => t.rank))).toBe(1);
    }
  });

  it("gives equal totals the same rank", () => {
    const tied = new Map([...histories].map(([id, h]) => [id, { history: h.history.map((row) => ({ ...row, points: 10 })) }]));
    const t = classicRanks(classic, tied, 8);
    expect(new Set([...t.ranks.values()].map((x) => x.at(-1)))).toEqual(new Set([1]));
  });
});

describe("h2hRanks", () => {
  const r = h2hRanks(h2h);

  it("covers the finished Matchup gameweeks", () => {
    expect(r.gameweeks.length).toBeGreaterThan(0);
    expect(r.gameweeks).toEqual([...r.gameweeks].sort((a, b) => a - b));
  });

  it("ends on the League table's ranks (League points, then points scored)", () => {
    for (const m of h2h.managers) expect(r.ranks.get(m.entryId)!.at(-1)).toBe(m.table.rank);
  });

  it("records each Manager's score per gameweek", () => {
    for (const m of h2h.managers) {
      const sum = r.points.get(m.entryId)!.reduce<number>((s, x) => s + (x ?? 0), 0);
      expect(sum).toBe(m.table.pointsFor);
    }
  });
});
