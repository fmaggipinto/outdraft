import type { Position, Projections } from "../types";

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

/** A cell colour from orange (hard) through paper to blue (easy): never red
 * against green (docs/design.md). Light tints in both themes, so the cell
 * text is always dark ink. */
export function easeColour(ease: number): string {
  const t = Math.max(-1, Math.min(1, (ease - 1) / 0.35));
  const base = [244, 239, 230];
  const target = t > 0 ? [143, 182, 228] : [240, 172, 104];
  const s = Math.abs(t);
  return `rgb(${base.map((c, i) => Math.round(c + (target[i] - c) * s)).join(",")})`;
}

/** FPL-style difficulty, 1 (easiest) to 5 (hardest), from a Fixture's ease.
 * Fixed thresholds, so the same ease always gets the same number. */
export function difficulty(ease: number): 1 | 2 | 3 | 4 | 5 {
  if (ease >= 1.15) return 1;
  if (ease >= 1.05) return 2;
  if (ease >= 0.95) return 3;
  if (ease >= 0.85) return 4;
  return 5;
}

/** How easy a Fixture is for a Player, as the Model weighs it: attack ease for
 * forwards, defence ease for goalkeepers and defenders, a blend for midfielders. */
export function easeFor(position: Position, attack: number, defence: number): number {
  return position === 4 ? attack : position === 3 ? 0.7 * attack + 0.3 * defence : defence;
}

export interface PlayerFixture {
  gameweek: number;
  opponent: string;   // short name
  home: boolean;
  ease: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
}

/** A club's Fixtures in the given gameweeks, from a Player's point of view. */
export function fixturesFor(projections: Projections, team: number, position: Position, gameweeks: number[]): PlayerFixture[] {
  const short = new Map(projections.teams.map((t) => [t.id, t.short_name]));
  return gameweeks.flatMap((gw) => projections.fixtures
    .filter((f) => f.gameweek === gw && (f.home === team || f.away === team))
    .map((f) => {
      const home = f.home === team;
      const ease = easeFor(position,
        (home ? f.home_attack : f.away_attack) ?? 1,
        (home ? f.home_defence : f.away_defence) ?? 1);
      return { gameweek: gw, opponent: short.get(home ? f.away : f.home) ?? "?", home, ease, difficulty: difficulty(ease) };
    }));
}
