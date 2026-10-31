import type { LeagueAnalysis } from "./league";

/** entry/{id}/history rows: points per gameweek. */
export interface EntryHistory {
  history: { event: number; points: number; points_on_bench: number }[];
}

export interface RankHistory {
  /** Finished gameweeks, in order. */
  gameweeks: number[];
  /** Entry id → League rank after each of those gameweeks (1 = top). */
  ranks: Map<number, number[]>;
  /** Entry id → points scored in each of those gameweeks (null if none). */
  points: Map<number, (number | null)[]>;
}

/** Ranks by score, best first; equal scores share a rank (1, 2, 2, 4). */
function competitionRanks(scores: Map<number, number[]>): Map<number, number> {
  const ids = [...scores.keys()];
  const cmp = (a: number, b: number) => {
    const x = scores.get(a)!, y = scores.get(b)!;
    for (let i = 0; i < x.length; i++) if (y[i] !== x[i]) return y[i] - x[i];
    return 0;
  };
  const sorted = [...ids].sort(cmp);
  const out = new Map<number, number>();
  sorted.forEach((id, i) => out.set(id, i > 0 && cmp(sorted[i - 1], id) === 0 ? out.get(sorted[i - 1])! : i + 1));
  return out;
}

/** Classic: ranked on total points after each finished gameweek. */
export function classicRanks(league: LeagueAnalysis, histories: Map<number, EntryHistory>, lastFinished: number): RankHistory {
  const gameweeks = [...new Set([...histories.values()].flatMap((h) => h.history.map((r) => r.event)))]
    .filter((gw) => gw <= lastFinished).sort((a, b) => a - b);
  const points = new Map(league.managers.map((m) => {
    const rows = new Map((histories.get(m.entryId)?.history ?? []).map((r) => [r.event, r.points]));
    return [m.entryId, gameweeks.map((gw) => rows.get(gw) ?? null)];
  }));
  const ranks = new Map<number, number[]>(league.managers.map((m) => [m.entryId, []]));
  const totals = new Map(league.managers.map((m) => [m.entryId, 0]));
  gameweeks.forEach((_, i) => {
    for (const m of league.managers) totals.set(m.entryId, totals.get(m.entryId)! + (points.get(m.entryId)![i] ?? 0));
    const r = competitionRanks(new Map([...totals].map(([id, t]) => [id, [t]])));
    for (const [id, rank] of r) ranks.get(id)!.push(rank);
  });
  return { gameweeks, ranks, points };
}

/** Head-to-head: 3 points for a win and 1 for a draw, then points scored,
 * after each finished gameweek. */
export function h2hRanks(league: LeagueAnalysis): RankHistory {
  const finished = league.matchups.filter((m) => m.finished);
  const gameweeks = [...new Set(finished.map((m) => m.gameweek))].sort((a, b) => a - b);
  const leaguePts = new Map(league.managers.map((m) => [m.entryId, 0]));
  const pointsFor = new Map(league.managers.map((m) => [m.entryId, 0]));
  const ranks = new Map<number, number[]>(league.managers.map((m) => [m.entryId, []]));
  const points = new Map<number, (number | null)[]>(league.managers.map((m) => [m.entryId, []]));
  for (const gw of gameweeks) {
    const scored = new Map<number, number>();
    for (const m of finished.filter((x) => x.gameweek === gw)) {
      for (const [me, mine, theirs] of [[m.home, m.homePoints, m.awayPoints], [m.away, m.awayPoints, m.homePoints]] as const) {
        if (!leaguePts.has(me)) continue;
        leaguePts.set(me, leaguePts.get(me)! + (mine > theirs ? 3 : mine === theirs ? 1 : 0));
        pointsFor.set(me, pointsFor.get(me)! + mine);
        scored.set(me, mine);
      }
    }
    const r = competitionRanks(new Map(league.managers.map((m) => [m.entryId, [leaguePts.get(m.entryId)!, pointsFor.get(m.entryId)!]])));
    for (const m of league.managers) {
      ranks.get(m.entryId)!.push(r.get(m.entryId)!);
      points.get(m.entryId)!.push(scored.get(m.entryId) ?? null);
    }
  }
  return { gameweeks, ranks, points };
}

export interface GameweekSummary {
  gameweek: number;
  /** League average of the Managers who played that gameweek. */
  average: number;
  /** The gameweek's best score. */
  best: number;
}

/** The League average and best score in each finished gameweek. */
export function gameweekSummaries(h: RankHistory): GameweekSummary[] {
  return h.gameweeks.map((gameweek, i) => {
    const scores = [...h.points.values()].map((p) => p[i]).filter((x): x is number => x != null);
    return {
      gameweek,
      average: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
      best: scores.length ? Math.max(...scores) : 0,
    };
  });
}
