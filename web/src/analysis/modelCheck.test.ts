import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import resultsJson from "../../tests/fixtures/results.json";
import type { Results } from "../types";
import { meanAbsError, modelCheck, pearson, squadCheck, type Manifest, type Snapshot } from "./modelCheck";

const results = resultsJson as Results;   // GW1–8 finished
const ids = Object.keys(results.players);

/** A made-up Snapshot for a finished gameweek: each Player's actual score
 * plus a fixed error, so the expected numbers are known. */
function snapshot(gameweek: number, error = 0): Snapshot {
  const i = results.gameweeks.indexOf(gameweek);
  return {
    gameweek, deadline: "", model_version: 1, params: { w: 0.5, k: 1 },
    projections: Object.fromEntries(ids.map((id) => [id, Math.max(0.1, results.players[id][i] + error)])),
  };
}

describe("pearson and meanAbsError", () => {
  it("measure agreement", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1);
    expect(pearson([1, 2], [1, 2])).toBe(0);   // too few to say
    expect(meanAbsError([1, 2, 3], [2, 2, 5])).toBe(1);
  });
});

describe("modelCheck", () => {
  const manifest: Manifest = { first_snapshot_gameweek: 6, snapshots: [6, 8, 9], gaps: [7], model: { version: 1 } };
  const rows = modelCheck(manifest, new Map([[6, snapshot(6)], [8, snapshot(8, 1)], [9, snapshot(8)]]), results);

  it("has a row per gameweek: checked, a gap, or waiting for results", () => {
    expect(rows.map((r) => [r.gameweek, r.kind])).toEqual([[6, "checked"], [7, "gap"], [8, "checked"], [9, "pending"]]);
  });

  it("scores a perfect Snapshot as a perfect fit and a shifted one by its error", () => {
    const [gw6, , gw8] = rows;
    expect(gw6.kind === "checked" && gw6.correlation).toBeGreaterThan(0.99);
    expect(gw8.kind === "checked" && gw8.error).toBeGreaterThan(0.9);
    expect(gw8.kind === "checked" && gw8.players).toBeGreaterThan(100);
  });

  it("shows a missed Snapshot as a gap, never as zeros", () => {
    const gap = rows.find((r) => r.gameweek === 7)!;
    expect(gap).toEqual({ kind: "gap", gameweek: 7 });
  });

  it("only uses Snapshots and Results: it never calls the Model", () => {
    const source = readFileSync(new URL("./modelCheck.ts", import.meta.url), "utf8");
    const imports = [...source.matchAll(/^import .* from "(.+)";$/gm)].map((m) => m[1]);
    expect(imports).toEqual(["../types"]);
    expect(source).toMatch(/^import type /m);
  });
});

describe("squadCheck", () => {
  it("lists each Squad Player's Snapshot Projection against what he scored", () => {
    const squad = ids.slice(0, 15).map(Number);
    const rows = squadCheck(snapshot(8, 1), results, squad);
    expect(rows).toHaveLength(15);
    for (const r of rows) {
      const actual = results.players[String(r.id)][7];
      expect(r.actual).toBe(actual);
      expect(r.predicted).toBeCloseTo(Math.max(0.1, actual + 1));
    }
    expect(rows.map((r) => r.predicted)).toEqual([...rows.map((r) => r.predicted)].sort((a, b) => b - a));
  });
});
