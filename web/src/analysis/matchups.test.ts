import { describe, expect, it } from "vitest";
import distributionsJson from "../../tests/fixtures/distributions.json";
import h2hDetails from "../../tests/fixtures/h2h-details.json";
import h2hStatus from "../../tests/fixtures/h2h-element-status.json";
import classicDetails from "../../tests/fixtures/classic-details.json";
import classicStatus from "../../tests/fixtures/classic-element-status.json";
import projectionsJson from "../../tests/fixtures/projections.json";
import type { Distributions, ElementStatus, LeagueDetails, Projections } from "../types";
import { analyseLeague } from "./league";
import { convolve, forecastMatchups, lineupDist, mean, quantile, winProbability } from "./matchups";

const projections = projectionsJson as unknown as Projections;
const dists = distributionsJson as unknown as Distributions;
const league = analyseLeague(h2hDetails as LeagueDetails, h2hStatus as ElementStatus, projections);
const forecasts = forecastMatchups(league, dists);

it("forecasts every upcoming Matchup the distributions cover", () => {
  // 8 Managers: 4 Matchups a gameweek, for GW10–15.
  expect(forecasts).toHaveLength(4 * 6);
  expect(new Set(forecasts.map((f) => f.matchup.gameweek))).toEqual(new Set([10, 11, 12, 13, 14, 15]));
});

it("maps Matchups to Managers by entry id", () => {
  const ids = new Set(league.managers.map((m) => m.entryId));
  for (const m of league.matchups) {
    expect(ids.has(m.home)).toBe(true);
    expect(ids.has(m.away)).toBe(true);
  }
  expect(league.matchups.length).toBe(140);
});

describe.each(forecasts.slice(0, 8).map((f) => [`GW${f.matchup.gameweek} ${f.home.manager.teamName} v ${f.away.manager.teamName}`, f] as const))(
  "%s", (_, f) => {
    it("has win, draw and loss chances that sum to 1 and mirror between the sides", () => {
      const { win, draw, loss } = f.home.chances;
      expect(win + draw + loss).toBeCloseTo(1, 9);
      expect(f.away.chances.win).toBeCloseTo(loss, 9);
      expect(f.away.chances.loss).toBeCloseTo(win, 9);
      expect(f.away.chances.draw).toBeCloseTo(draw, 9);
    });

    it("projects each side close to its Best XI total, inside its own range", () => {
      for (const side of [f.home, f.away]) {
        const gw = league.gameweeks.indexOf(f.matchup.gameweek);
        // Each Player's distribution is rounded to 3 decimals, so allow a little drift.
        expect(Math.abs(side.projected - side.manager.bestXIs[gw].total)).toBeLessThan(0.5);
        expect(side.low).toBeLessThanOrEqual(side.projected);
        expect(side.high).toBeGreaterThanOrEqual(side.projected);
      }
    });
  });

it("gives two identical Squads equal chances", () => {
  const m = league.managers[0];
  const d = lineupDist(m.bestXIs[0].ids, dists, 0);
  const p = winProbability(d, d);
  expect(p.win).toBeCloseTo(p.loss, 12);
  expect(p.draw).toBeGreaterThan(0);
});

it("favours the clearly stronger side", () => {
  const strong = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];   // always 10
  const weak = [0.5, 0, 0.5];                          // 0 or 2
  expect(winProbability(strong, weak)).toEqual({ win: 1, draw: 0, loss: 0 });
  expect(winProbability([0, 1], [0, 1]).draw).toBe(1);
});

it("combines distributions correctly", () => {
  const d = convolve([0.5, 0.5], [0.5, 0.5]);
  expect(d).toEqual([0.25, 0.5, 0.25]);
  expect(mean(d)).toBe(1);
  expect(quantile(d, 0.1)).toBe(0);
  expect(quantile(d, 0.9)).toBe(2);
});

it("has no Matchups in a Classic League", () => {
  const classic = analyseLeague(classicDetails as LeagueDetails, classicStatus as ElementStatus, projections);
  expect(classic.matchups).toEqual([]);
  expect(forecastMatchups(classic, dists)).toEqual([]);
});
