import type { Distributions } from "../types";
import type { LeagueAnalysis, ManagerAnalysis, Matchup } from "./league";

/** A score distribution as an array: dist[points] = probability. */
export type Dist = number[];

export function convolve(a: Dist, b: Dist): Dist {
  const out = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    if (!a[i]) continue;
    for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
  }
  return out;
}

export const mean = (d: Dist) => d.reduce((s, p, x) => s + p * x, 0);

/** Smallest score with at least `q` of the probability at or below it. */
export function quantile(d: Dist, q: number): number {
  let acc = 0;
  for (let x = 0; x < d.length; x++) {
    acc += d[x];
    if (acc >= q - 1e-9) return x;
  }
  return d.length - 1;
}

function playerDist(dists: Distributions, id: number, gwIndex: number): Dist {
  const entry = dists.players[String(id)]?.[gwIndex];
  if (!entry) return [1];   // not published: always 0
  const [pts, probs] = entry;
  const d: Dist = new Array(Math.max(...pts) + 1).fill(0);
  pts.forEach((x, i) => (d[x] += probs[i]));
  return d;
}

/** Score distribution of a Best XI: its Players' distributions combined,
 * treating them as independent. */
export function lineupDist(ids: number[], dists: Distributions, gwIndex: number): Dist {
  return ids.reduce<Dist>((acc, id) => convolve(acc, playerDist(dists, id, gwIndex)), [1]);
}

export interface WinProbability {
  win: number;
  draw: number;
  loss: number;
}

/** Chances that a scores more than, the same as, or less than b. */
export function winProbability(a: Dist, b: Dist): WinProbability {
  // cb[x] = P(b <= x)
  const cb: number[] = [];
  b.reduce((acc, p, x) => (cb[x] = acc + p), 0);
  const below = (x: number) => (x < 0 ? 0 : cb[Math.min(x, cb.length - 1)]);
  let win = 0, draw = 0;
  a.forEach((p, x) => {
    if (!p) return;
    win += p * below(x - 1);
    draw += p * (x < b.length ? b[x] : 0);
  });
  return { win, draw, loss: Math.max(0, 1 - win - draw) };
}

export interface SideForecast {
  manager: ManagerAnalysis;
  projected: number;
  /** 10th and 90th percentile scores. */
  low: number;
  high: number;
  chances: WinProbability;
}

export interface MatchupForecast {
  matchup: Matchup;
  home: SideForecast;
  away: SideForecast;
}

/** Forecasts for each unfinished Matchup in a gameweek the Score distributions
 * cover, assuming both Managers field their Best XI. */
export function forecastMatchups(league: LeagueAnalysis, dists: Distributions): MatchupForecast[] {
  const managers = new Map(league.managers.map((m) => [m.entryId, m]));
  return league.matchups.flatMap((matchup): MatchupForecast[] => {
    const gw = league.gameweeks.indexOf(matchup.gameweek);
    const di = dists.gameweeks.indexOf(matchup.gameweek);
    const home = managers.get(matchup.home), away = managers.get(matchup.away);
    if (matchup.started || gw < 0 || di < 0 || !home || !away) return [];
    const a = lineupDist(home.bestXIs[gw].ids, dists, di);
    const b = lineupDist(away.bestXIs[gw].ids, dists, di);
    const ab = winProbability(a, b);
    const side = (manager: ManagerAnalysis, d: Dist, chances: WinProbability): SideForecast => ({
      manager, projected: mean(d), low: quantile(d, 0.1), high: quantile(d, 0.9), chances,
    });
    return [{
      matchup,
      home: side(home, a, ab),
      away: side(away, b, { win: ab.loss, draw: ab.draw, loss: ab.win }),
    }];
  });
}
