import { describe, expect, it } from "vitest";
import projectionsJson from "../../tests/fixtures/projections.json";
import type { Projections } from "../types";
import { difficulty, easeColour, fixturesFor, fixtureTicker, type TickerMode } from "./ticker";

const projections = projectionsJson as unknown as Projections;

describe.each(["attack", "defence"] as TickerMode[])("for %s", (mode) => {
  const rows = fixtureTicker(projections, mode);

  it("has every club, easiest run first", () => {
    expect(rows).toHaveLength(20);
    const runs = rows.map((r) => r.run);
    expect(runs).toEqual([...runs].sort((a, b) => b - a));
  });

  it("reads each side's ease from the published Fixtures", () => {
    const f = projections.fixtures[0];
    const home = rows.find((r) => r.team.id === f.home)!.gameweeks[0][0];
    const away = rows.find((r) => r.team.id === f.away)!.gameweeks[0][0];
    expect(home.home).toBe(true);
    expect(home.ease).toBe(mode === "attack" ? f.home_attack : f.home_defence);
    expect(away.ease).toBe(mode === "attack" ? f.away_attack : f.away_defence);
    expect(home.opponent).toBe(projections.teams.find((t) => t.id === f.away)!.short_name);
  });
});

it("orders clubs differently for attackers and defenders", () => {
  const a = fixtureTicker(projections, "attack").map((r) => r.team.id);
  const d = fixtureTicker(projections, "defence").map((r) => r.team.id);
  expect(a).not.toEqual(d);
});

it("shows a double gameweek as two Fixtures and a blank as none", () => {
  const [first, ...rest] = projections.fixtures;
  const gw = first.gameweek;
  const team = first.home;
  const withoutTeam = rest.filter((f) => !(f.gameweek === gw && (f.home === team || f.away === team)));
  const blank = fixtureTicker({ ...projections, fixtures: withoutTeam }, "attack").find((r) => r.team.id === team)!;
  expect(blank.gameweeks[0]).toEqual([]);

  const double = fixtureTicker({ ...projections, fixtures: [...projections.fixtures, { ...first, kickoff: null }] }, "attack")
    .find((r) => r.team.id === team)!;
  expect(double.gameweeks[0]).toHaveLength(2);
  const single = fixtureTicker(projections, "attack").find((r) => r.team.id === team)!;
  expect(double.run).toBeCloseTo(single.run + first.home_attack!);
});

it("colours easy Fixtures blue and hard ones orange, never red against green", () => {
  const rgb = (s: string) => s.match(/\d+/g)!.map(Number);
  const [r1, , b1] = rgb(easeColour(1.4));
  const [r2, , b2] = rgb(easeColour(0.6));
  expect(b1).toBeGreaterThan(r1);   // blue
  expect(r2).toBeGreaterThan(b2);   // orange
  expect(easeColour(1)).toBe("rgb(244,239,230)");
});

describe("difficulty", () => {
  it("maps ease to 1 (easiest) through 5 (hardest)", () => {
    expect([1.4, 1.15, 1.1, 1.0, 0.9, 0.85, 0.6].map(difficulty)).toEqual([1, 1, 2, 3, 4, 4, 5]);
  });

  it("never rates an easier Fixture harder", () => {
    for (let e = 0.5; e < 1.6; e += 0.01) expect(difficulty(e + 0.01)).toBeLessThanOrEqual(difficulty(e));
  });

  it("spreads the recorded Fixtures across the scale", () => {
    const seen = new Set(projections.fixtures.flatMap((f) => [f.home_attack!, f.away_defence!]).map(difficulty));
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });
});

describe("fixturesFor", () => {
  const f = projections.fixtures[0];

  it("uses attack ease for forwards and defence ease for defenders", () => {
    const fwd = fixturesFor(projections, f.home, 4, [f.gameweek])[0];
    const def = fixturesFor(projections, f.home, 2, [f.gameweek])[0];
    expect(fwd.ease).toBe(f.home_attack);
    expect(def.ease).toBe(f.home_defence);
    expect(fwd.home).toBe(true);
    expect(fixturesFor(projections, f.away, 2, [f.gameweek])[0]).toMatchObject({ home: false, ease: f.away_defence });
  });

  it("blends for midfielders", () => {
    const mid = fixturesFor(projections, f.home, 3, [f.gameweek])[0];
    expect(mid.ease).toBeCloseTo(0.7 * f.home_attack! + 0.3 * f.home_defence!);
  });

  it("returns one Fixture per gameweek normally", () => {
    expect(fixturesFor(projections, f.home, 3, projections.gameweeks.slice(0, 3))).toHaveLength(3);
  });
});
