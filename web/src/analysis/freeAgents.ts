import type { ElementStatus, Position, ProjectedPlayer, Projections } from "../types";

export const SORTS = {
  projection: "Projection",
  xgi: "xG+xA /90",
  minutes: "Minutes",
  points: "Points",
} as const;
export type SortKey = keyof typeof SORTS;

export interface FreeAgentRow {
  player: ProjectedPlayer;
  /** Projections summed over the first `horizon` gameweeks. */
  projection: number;
  xgi: number;
}

/** Lower-case and strip accents, so "jorgensen" finds "Jørgensen" and "Jörgensen". */
export const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ø/gi, "o").replace(/æ/gi, "ae").toLowerCase();

export function matchesQuery(p: ProjectedPlayer, query: string): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  return [p.name, p.first_name, p.second_name, `${p.first_name} ${p.second_name}`].some((n) => fold(n ?? "").includes(q));
}

/** Free agents: Players in no Squad in the League, filtered and sorted best first. */
export function freeAgents(status: ElementStatus, projections: Projections, opts: {
  position?: Position | null;
  query?: string;
  sort: SortKey;
  horizon: number;
}): FreeAgentRow[] {
  const owned = new Set(status.element_status.filter((e) => e.owner != null).map((e) => e.element));
  const rows = projections.players
    .filter((p) => !owned.has(p.id) && (!opts.position || p.position === opts.position) && matchesQuery(p, opts.query ?? ""))
    .map((player) => ({
      player,
      projection: player.projections.slice(0, opts.horizon).reduce((a, b) => a + b, 0),
      xgi: (player.xg90 ?? 0) + (player.xa90 ?? 0),
    }));
  const value = (r: FreeAgentRow) => ({
    projection: r.projection,
    xgi: r.xgi,
    minutes: r.player.minutes,
    points: r.player.total_points,
  })[opts.sort];
  return rows.sort((a, b) => value(b) - value(a) || b.projection - a.projection || a.player.id - b.player.id);
}
