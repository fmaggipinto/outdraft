import type { Projections } from "../types";

export type TickerMode = "attack" | "defence";

export interface TickerFixture {
  opponent: string;   // short name
  home: boolean;
  /** How easy, 1.0 = average: above is easier, below is harder. */
  ease: number;
}

export interface TickerRow {
  team: { id: number; name: string; short_name: string };
  /** One entry per gameweek: empty for a blank, two Fixtures for a double. */
  gameweeks: TickerFixture[][];
  /** Sum of every Fixture's ease: doubles count twice, blanks add nothing. */
  run: number;
}

/** Every club's next Fixtures, easiest run first, for attackers (judged on the
 * opponent's defence) or defenders (judged on the opponent's attack). */
export function fixtureTicker(projections: Projections, mode: TickerMode): TickerRow[] {
  const short = new Map(projections.teams.map((t) => [t.id, t.short_name]));
  const rows = projections.teams.map((team): TickerRow => {
    const gameweeks = projections.gameweeks.map((gw) =>
      projections.fixtures
        .filter((f) => f.gameweek === gw && (f.home === team.id || f.away === team.id))
        .map((f) => {
          const home = f.home === team.id;
          const ease = (home
            ? (mode === "attack" ? f.home_attack : f.home_defence)
            : (mode === "attack" ? f.away_attack : f.away_defence)) ?? 1;
          return { opponent: short.get(home ? f.away : f.home) ?? "?", home, ease };
        }));
    return { team, gameweeks, run: gameweeks.flat().reduce((s, f) => s + f.ease, 0) };
  });
  return rows.sort((a, b) => b.run - a.run || a.team.short_name.localeCompare(b.team.short_name));
}

/** A cell colour from red (hard) through neutral to green (easy). */
export function easeColour(ease: number, dark: boolean): string {
  const t = Math.max(-1, Math.min(1, (ease - 1) / 0.35));
  const base = dark ? [42, 50, 46] : [245, 245, 240];
  const target = t > 0 ? (dark ? [47, 140, 90] : [81, 207, 102]) : (dark ? [170, 60, 55] : [255, 107, 107]);
  const s = Math.abs(t);
  return `rgb(${base.map((c, i) => Math.round(c + (target[i] - c) * s)).join(",")})`;
}
