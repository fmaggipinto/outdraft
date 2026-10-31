// Shapes of the published Model files (docs/data-format.md) and of the
// FPL Draft API responses the app reads through the relay.

export type Position = 1 | 2 | 3 | 4;

export interface SquadRules {
  size: number;
  play: number;
  min_play: Record<string, number>;
  max_play: Record<string, number>;
}

export interface ProjectedPlayer {
  id: number;
  name: string;
  team: number;
  position: Position;
  status: string;
  chance_next: number | null;
  news: string;
  draft_rank: number | null;
  minutes: number;
  total_points: number;
  /** Missing from files published before the Model job added it. */
  points_avg_capped?: number;
  projections: number[];
}

export interface Projections {
  updated_at: string;
  model_version: number;
  based_on_gameweek: number;
  gameweeks: number[];
  events: { gameweek: number; deadline: string; waivers_deadline: string | null }[];
  teams: { id: number; name: string; short_name: string }[];
  squad_rules?: SquadRules;
  fixtures: { gameweek: number; home: number; away: number; kickoff: string | null }[];
  players: ProjectedPlayer[];
}

export interface LeagueEntry {
  id: number;        // league-entry id: used by standings and matches
  entry_id: number;  // entry id: used by element-status owners
  entry_name: string;
  player_first_name: string;
  player_last_name: string;
  waiver_pick: number;
}

export interface Standing {
  league_entry: number;
  rank: number;
  total: number;
  event_total?: number;
  matches_won?: number;
  matches_drawn?: number;
  matches_lost?: number;
  points_for?: number;
}

export interface Match {
  event: number;
  league_entry_1: number;
  league_entry_2: number;
  league_entry_1_points: number;
  league_entry_2_points: number;
  finished: boolean;
  started: boolean;
}

export interface LeagueDetails {
  league: { id: number; name: string; scoring: "c" | "h" };
  league_entries: LeagueEntry[];
  standings: Standing[];
  /** Head-to-head only: the whole season's Matchups. */
  matches?: Match[];
}

/** distributions.json: per Player, one [points, probabilities] pair per gameweek. */
export interface Distributions {
  updated_at: string;
  model_version: number;
  gameweeks: number[];
  players: Record<string, [number[], number[]][]>;
}

export interface Game {
  current_event: number;
  current_event_finished: boolean;
  next_event: number | null;
  waivers_processed: boolean;
}

export interface Transactions {
  transactions: {
    element_in: number;
    element_out: number;
    entry: number;
    event: number;
    kind: string;    // "w" waiver claim, "f" free-agent signing
    result: string;  // "a" accepted
  }[];
}

export interface ElementStatus {
  element_status: { element: number; owner: number | null; status: string }[];
}
