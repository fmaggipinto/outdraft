import type { ElementStatus, Picks, Position, ProjectedPlayer, Results } from "../types";
import type { ManagerAnalysis } from "./league";

export const POSITIONS: Position[] = [1, 2, 3, 4];

/** The Players who actually started: picks 1–11, after auto-subs. */
export function startingXI(p: Picks): number[] {
  const xi = new Set(p.picks.filter((x) => x.position <= 11).map((x) => x.element));
  for (const s of p.subs ?? []) {
    xi.delete(s.element_out);
    xi.add(s.element_in);
  }
  return [...xi];
}

export interface Scorer {
  player: ProjectedPlayer;
  points: number;
  /** Still in this Manager's Squad today. */
  stillOwned: boolean;
}

export interface SeasonPositionRow {
  manager: ManagerAnalysis;
  byPosition: Record<Position, number>;
  total: number;
  /** The 3 Players who scored the most for this Manager while starting. */
  top: Scorer[];
  /** Finished gameweeks with a lineup (a Manager who joined late has fewer). */
  gameweeks: number;
}

/**
 * Season points by position: the points each Manager actually scored, from
 * Players in their starting XI after auto-subs, split by the Players'
 * positions, with their top 3 scorers.
 */
export function seasonPointsByPosition(opts: {
  managers: ManagerAnalysis[];
  /** entry id → gameweek → that gameweek's picks (missing if none). */
  picks: Map<number, Map<number, Picks>>;
  results: Results;
  players: ProjectedPlayer[];
  status: ElementStatus;
}): SeasonPositionRow[] {
  const { managers, picks, results, status } = opts;
  const players = new Map(opts.players.map((p) => [p.id, p]));
  const owner = new Map(status.element_status.map((e) => [e.element, e.owner]));
  const pointsIn = (id: number, gw: number) => {
    const i = results.gameweeks.indexOf(gw);
    return i < 0 ? 0 : results.players[String(id)]?.[i] ?? 0;
  };

  return managers.map((manager) => {
    const byPosition = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<Position, number>;
    const perPlayer = new Map<number, number>();
    let gameweeks = 0;
    for (const gw of results.gameweeks) {
      const p = picks.get(manager.entryId)?.get(gw);
      if (!p) continue;
      gameweeks += 1;
      for (const id of startingXI(p)) {
        const player = players.get(id);
        if (!player) continue;
        const pts = pointsIn(id, gw);
        byPosition[player.position] += pts;
        perPlayer.set(id, (perPlayer.get(id) ?? 0) + pts);
      }
    }
    const top = [...perPlayer.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, 3)
      .map(([id, points]) => ({ player: players.get(id)!, points, stillOwned: owner.get(id) === manager.entryId }));
    const total = POSITIONS.reduce((s, pos) => s + byPosition[pos], 0);
    return { manager, byPosition, total, top, gameweeks };
  });
}

export type ShareMode = "points" | "share";

/** Sort rows by total, or by one position's points or share of the total. */
export function sortRows(rows: SeasonPositionRow[], by: Position | null, mode: ShareMode): SeasonPositionRow[] {
  const value = (r: SeasonPositionRow) =>
    by == null ? r.total : mode === "share" ? (r.total ? r.byPosition[by] / r.total : 0) : r.byPosition[by];
  return [...rows].sort((a, b) => value(b) - value(a) || a.manager.table.rank - b.manager.table.rank);
}

/**
 * Current Squad's season points by position (dashboard parity): the season
 * points of the Players each Manager holds now, wherever they earned them
 * (another Squad, the bench, before signing). Not the League score, and not
 * Squad strength, which is projected Best XI points.
 */
export function currentSquadPoints(managers: ManagerAnalysis[], players: ProjectedPlayer[]): SeasonPositionRow[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  return managers.map((manager) => {
    const byPosition = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<Position, number>;
    const squad = manager.squad.map((id) => byId.get(id)).filter((p): p is ProjectedPlayer => !!p);
    for (const p of squad) byPosition[p.position] += p.total_points;
    const top = [...squad].sort((a, b) => b.total_points - a.total_points || a.id - b.id).slice(0, 3)
      .map((player) => ({ player, points: player.total_points, stillOwned: true }));
    return { manager, byPosition, total: POSITIONS.reduce((s, pos) => s + byPosition[pos], 0), top, gameweeks: 0 };
  });
}

/**
 * Points left on the bench in each finished gameweek: the points of the
 * Players who didn't start after auto-subs. Worked out from lineups because
 * the Draft API's own points_on_bench is always 0.
 */
export function benchPoints(picks: Map<number, Picks>, results: Results) {
  const pointsIn = (id: number, i: number) => results.players[String(id)]?.[i] ?? 0;
  const rows = results.gameweeks.flatMap((gameweek, i) => {
    const p = picks.get(gameweek);
    if (!p) return [];
    const starters = new Set(startingXI(p));
    const bench = p.picks.map((x) => x.element).filter((id) => !starters.has(id));
    return [{ gameweek, points: bench.reduce((s, id) => s + pointsIn(id, i), 0) }];
  });
  return { rows, total: rows.reduce((s, r) => s + r.points, 0) };
}
