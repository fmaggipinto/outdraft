import type { Position, ProjectedPlayer, Projections } from "../types";
import type { ManagerAnalysis } from "./league";

export interface Opponent {
  team: string;   // short name, e.g. "ARS"
  home: boolean;
}

export interface SquadCell {
  gameweek: number;
  points: number;
  /** In that gameweek's Best XI. */
  starter: boolean;
  /** Empty for a blank gameweek, two entries for a double. */
  opponents: Opponent[];
}

export interface SquadRow {
  player: ProjectedPlayer;
  cells: SquadCell[];
  /** Points this Player adds to Squad strength: Projections in gameweeks he starts. */
  contribution: number;
}

export interface SquadBreakdown {
  gameweeks: number[];
  /** By position, then by contribution. */
  rows: SquadRow[];
  byPosition: Record<Position, number>;
  strength: number;
}

/** A Manager's Squad over the first `horizon` gameweeks: who starts in each
 * gameweek's Best XI, against whom, and how Squad strength splits by position. */
export function squadBreakdown(manager: ManagerAnalysis, projections: Projections, horizon: number): SquadBreakdown {
  const n = Math.min(horizon, projections.gameweeks.length);
  const gameweeks = projections.gameweeks.slice(0, n);
  const players = new Map(projections.players.map((p) => [p.id, p]));
  const short = new Map(projections.teams.map((t) => [t.id, t.short_name]));

  const opponents = (team: number, gw: number): Opponent[] =>
    projections.fixtures
      .filter((f) => f.gameweek === gw && (f.home === team || f.away === team))
      .map((f) => (f.home === team
        ? { team: short.get(f.away) ?? "?", home: true }
        : { team: short.get(f.home) ?? "?", home: false }));

  const rows = manager.squad.flatMap((id): SquadRow[] => {
    const player = players.get(id);
    if (!player) return [];
    const cells = gameweeks.map((gw, i) => ({
      gameweek: gw,
      points: player.projections[i] ?? 0,
      starter: manager.bestXIs[i].ids.includes(id),
      opponents: opponents(player.team, gw),
    }));
    const contribution = cells.reduce((s, c) => s + (c.starter ? c.points : 0), 0);
    return [{ player, cells, contribution }];
  });
  rows.sort((a, b) =>
    a.player.position - b.player.position || b.contribution - a.contribution || a.player.id - b.player.id);

  const byPosition = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<Position, number>;
  rows.forEach((r) => (byPosition[r.player.position] += r.contribution));
  return { gameweeks, rows, byPosition, strength: Object.values(byPosition).reduce((a, b) => a + b, 0) };
}
