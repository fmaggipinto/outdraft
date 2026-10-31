import type { ElementStatus, LeagueDetails, ProjectedPlayer, Projections } from "../types";
import { bestXI, DRAFT_SQUAD_RULES, type BestXI } from "./bestXI";

export const HORIZONS = [1, 3, 6] as const;
export type Horizon = (typeof HORIZONS)[number];

export interface ManagerAnalysis {
  entryId: number;
  leagueEntryId: number;
  teamName: string;
  managerName: string;
  /** Position in the Waiver order: 1 = first claim. */
  waiverPick: number;
  squad: number[];
  /** Best XI for each published gameweek, in Projections order. */
  bestXIs: BestXI[];
  /** Squad strength over the next 1, 3 and 6 gameweeks. */
  strength: Record<Horizon, number>;
  table: {
    rank: number;
    total: number;
    gameweekPoints?: number;
    won?: number;
    drawn?: number;
    lost?: number;
    pointsFor?: number;
  };
}

export interface Matchup {
  gameweek: number;
  /** Entry ids, matching ManagerAnalysis.entryId. */
  home: number;
  away: number;
  finished: boolean;
  started: boolean;
  homePoints: number;
  awayPoints: number;
}

export interface LeagueAnalysis {
  id: number;
  name: string;
  format: "classic" | "h2h";
  drafted: boolean;
  gameweeks: number[];
  /** In League table order. */
  managers: ManagerAnalysis[];
  /** Head-to-head Matchups for the season (empty in Classic Leagues). */
  matchups: Matchup[];
}

/** Squad strength: the sum of a Squad's Best XI Projections over the first
 * `horizon` published gameweeks (fewer near the end of the season). */
export function squadStrength(bestXIs: BestXI[], horizon: number): number {
  return bestXIs.slice(0, horizon).reduce((s, xi) => s + xi.total, 0);
}

export function analyseLeague(
  details: LeagueDetails,
  status: ElementStatus,
  projections: Projections,
): LeagueAnalysis {
  const players = new Map<number, ProjectedPlayer>(projections.players.map((p) => [p.id, p]));
  const rules = projections.squad_rules ?? DRAFT_SQUAD_RULES;
  const standings = new Map(details.standings.map((s) => [s.league_entry, s]));
  const h2h = details.league.scoring === "h";

  // element-status owners are entry ids, not league-entry ids.
  const squads = new Map<number, number[]>();
  for (const es of status.element_status) {
    if (es.owner == null) continue;
    if (!squads.has(es.owner)) squads.set(es.owner, []);
    squads.get(es.owner)!.push(es.element);
  }

  const managers = details.league_entries.map((e): ManagerAnalysis => {
    const squad = (squads.get(e.entry_id) ?? []).sort((a, b) => a - b);
    const bestXIs = projections.gameweeks.map((_, i) =>
      bestXI(
        squad.flatMap((id) => {
          const p = players.get(id);
          // A Player new to FPL since the last Model run has no Projection yet.
          return p ? [{ id, position: p.position, points: p.projections[i] ?? 0 }] : [];
        }),
        rules,
      ),
    );
    const s = standings.get(e.id);
    return {
      entryId: e.entry_id,
      leagueEntryId: e.id,
      teamName: e.entry_name,
      managerName: `${e.player_first_name} ${e.player_last_name}`.trim(),
      waiverPick: e.waiver_pick,
      squad,
      bestXIs,
      strength: { 1: squadStrength(bestXIs, 1), 3: squadStrength(bestXIs, 3), 6: squadStrength(bestXIs, 6) },
      table: {
        rank: s?.rank ?? details.league_entries.length,
        total: s?.total ?? 0,
        ...(h2h
          ? { won: s?.matches_won, drawn: s?.matches_drawn, lost: s?.matches_lost, pointsFor: s?.points_for }
          : { gameweekPoints: s?.event_total }),
      },
    };
  });
  managers.sort((a, b) => a.table.rank - b.table.rank || a.teamName.localeCompare(b.teamName));

  const entryOf = new Map(details.league_entries.map((e) => [e.id, e.entry_id]));
  const matchups = (h2h ? details.matches ?? [] : []).flatMap((m): Matchup[] => {
    const home = entryOf.get(m.league_entry_1), away = entryOf.get(m.league_entry_2);
    return home && away ? [{
      gameweek: m.event, home, away, finished: m.finished, started: m.started,
      homePoints: m.league_entry_1_points, awayPoints: m.league_entry_2_points,
    }] : [];
  });

  return {
    id: details.league.id,
    name: details.league.name,
    format: h2h ? "h2h" : "classic",
    drafted: squads.size > 0,
    gameweeks: projections.gameweeks,
    managers,
    matchups,
  };
}
