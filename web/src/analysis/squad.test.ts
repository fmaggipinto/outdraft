import { describe, expect, it } from "vitest";
import classicDetails from "../../tests/fixtures/classic-details.json";
import classicStatus from "../../tests/fixtures/classic-element-status.json";
import projectionsJson from "../../tests/fixtures/projections.json";
import type { ElementStatus, LeagueDetails, Projections } from "../types";
import { analyseLeague, HORIZONS } from "./league";
import { squadBreakdown } from "./squad";

const projections = projectionsJson as unknown as Projections;
const league = analyseLeague(classicDetails as LeagueDetails, classicStatus as ElementStatus, projections);

describe.each(HORIZONS)("over %i gameweeks", (h) => {
  it("marks exactly each gameweek's Best XI as starters", () => {
    for (const m of league.managers) {
      const b = squadBreakdown(m, projections, h);
      expect(b.gameweeks).toHaveLength(h);
      b.gameweeks.forEach((_, i) => {
        const starters = b.rows.filter((r) => r.cells[i].starter).map((r) => r.player.id).sort();
        expect(starters).toEqual([...m.bestXIs[i].ids].sort());
      });
      expect(b.rows).toHaveLength(15);
    }
  });

  it("splits Squad strength by position without losing any of it", () => {
    for (const m of league.managers) {
      const b = squadBreakdown(m, projections, h);
      expect(b.strength).toBeCloseTo(m.strength[h]);
      expect(b.rows.reduce((s, r) => s + r.contribution, 0)).toBeCloseTo(m.strength[h]);
      expect(b.byPosition[1] + b.byPosition[2] + b.byPosition[3] + b.byPosition[4]).toBeCloseTo(m.strength[h]);
    }
  });
});

it("orders rows by position, then by contribution", () => {
  const rows = squadBreakdown(league.managers[0], projections, 3).rows;
  for (let i = 1; i < rows.length; i++) {
    const [a, b] = [rows[i - 1], rows[i]];
    expect(a.player.position <= b.player.position).toBe(true);
    if (a.player.position === b.player.position) expect(a.contribution).toBeGreaterThanOrEqual(b.contribution);
  }
});

it("shows home and away opponents, doubles and blanks", () => {
  const m = league.managers[0];
  const player = projections.players.find((p) => p.id === m.squad[0])!;
  const gw = projections.gameweeks[0];
  const others = projections.fixtures.filter((f) => !(f.gameweek === gw && (f.home === player.team || f.away === player.team)));
  const opp = projections.teams.find((t) => t.id !== player.team)!;

  const blank = squadBreakdown(m, { ...projections, fixtures: others }, 1);
  expect(blank.rows.find((r) => r.player.id === player.id)!.cells[0].opponents).toEqual([]);

  const double = squadBreakdown(m, {
    ...projections,
    fixtures: [...others,
      { gameweek: gw, home: player.team, away: opp.id, kickoff: null },
      { gameweek: gw, home: opp.id, away: player.team, kickoff: null }],
  }, 1);
  expect(double.rows.find((r) => r.player.id === player.id)!.cells[0].opponents).toEqual([
    { team: opp.short_name, home: true },
    { team: opp.short_name, home: false },
  ]);
});
