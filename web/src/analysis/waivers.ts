import type { ElementStatus, Game, ProjectedPlayer, Projections, SquadRules, Transactions } from "../types";
import { bestXI, DRAFT_SQUAD_RULES } from "./bestXI";
import { squadStrength, type ManagerAnalysis } from "./league";

// Rules carried over from docs/fpl_draft.py.
export const TARGET_HORIZON = 3;   // gameweeks a swap is judged over
const CANDIDATES = 15;             // Free agents per position tried as swaps
const MIN_GAIN = 0.5;              // smallest Squad strength gain worth a claim
const MIN_SHARE = 0.3;             // Free agents need 30% of possible minutes…
const MIN_MINUTES_FLOOR = 180;     // …and at least this many
const PROTECT_AVG = 4.5;           // never drop a Player averaging this (capped)…
const PROTECT_RANK = 40;           // …or a top-40 draft pick

/**
 * - `waivers`: before the Waiver deadline. Claims are processed in Waiver order.
 * - `processing`: the Waiver deadline has passed but FPL hasn't processed claims yet.
 * - `free`: waivers are done; Free agents can be signed, first come first served.
 */
export type Phase = "waivers" | "processing" | "free";

export function waiverPhase(game: Game, projections: Projections, now: number): Phase {
  const event = projections.events.find((e) => e.gameweek === game.next_event) ?? projections.events[0];
  const deadline = event?.waivers_deadline ? Date.parse(event.waivers_deadline) : null;
  if (deadline != null && now < deadline) return "waivers";
  return game.waivers_processed ? "free" : "processing";
}

/** Players not in any Squad but locked on waivers: flagged by FPL, or dropped
 * by a Manager for the coming gameweek (FPL's list can lag behind drops). */
export function lockedOnWaivers(status: ElementStatus, transactions: Transactions | null, nextGw: number | null): Set<number> {
  const owned = new Set(status.element_status.filter((e) => e.owner != null).map((e) => e.element));
  const locked = new Set(status.element_status.filter((e) => e.owner == null && e.status === "w").map((e) => e.element));
  for (const t of transactions?.transactions ?? []) {
    if (t.result === "a" && t.event === nextGw && !owned.has(t.element_out)) locked.add(t.element_out);
  }
  return locked;
}

export function isProtected(p: ProjectedPlayer, basedOnGameweek: number): boolean {
  const avg = p.points_avg_capped ?? (basedOnGameweek ? p.total_points / basedOnGameweek : 0);
  return avg >= PROTECT_AVG || (p.draft_rank != null && p.draft_rank > 0 && p.draft_rank <= PROTECT_RANK);
}

export interface WaiverTarget {
  in: ProjectedPlayer;
  out: ProjectedPlayer;
  /** Squad strength gain over TARGET_HORIZON gameweeks. */
  gain: number;
  /** Locked on waivers: can only be claimed, not signed as a Free agent. */
  claimOnly: boolean;
}

/** Squad strength of a list of Player ids over the first `horizon` gameweeks. */
export function strengthOf(ids: number[], players: Map<number, ProjectedPlayer>, projections: Projections, horizon: number, rules: SquadRules) {
  const xis = projections.gameweeks.slice(0, horizon).map((_, i) =>
    bestXI(ids.flatMap((id) => {
      const p = players.get(id);
      return p ? [{ id, position: p.position, points: p.projections[i] ?? 0 }] : [];
    }), rules));
  return squadStrength(xis, horizon);
}

/** Free agents whose swap for one of the Manager's non-protected Players of the
 * same position raises Squad strength the most, best first. */
export function waiverTargets(opts: {
  manager: ManagerAnalysis;
  status: ElementStatus;
  projections: Projections;
  locked: Set<number>;
  phase: Phase;
}): WaiverTarget[] {
  const { manager, status, projections, locked, phase } = opts;
  const rules = projections.squad_rules ?? DRAFT_SQUAD_RULES;
  const players = new Map(projections.players.map((p) => [p.id, p]));
  const owned = new Set(status.element_status.filter((e) => e.owner != null).map((e) => e.element));
  const horizon = Math.min(TARGET_HORIZON, projections.gameweeks.length);
  const value = (p: ProjectedPlayer) => p.projections.slice(0, horizon).reduce((a, b) => a + b, 0);
  const minMinutes = Math.max(MIN_MINUTES_FLOOR, MIN_SHARE * 90 * Math.max(projections.based_on_gameweek, 1));

  const free = projections.players.filter((p) =>
    !owned.has(p.id) && !manager.squad.includes(p.id) && p.minutes >= minMinutes
    && !(phase === "free" && locked.has(p.id)));

  const current = strengthOf(manager.squad, players, projections, horizon, rules);
  const targets: WaiverTarget[] = [];
  for (const pos of [1, 2, 3, 4] as const) {
    const candidates = free.filter((p) => p.position === pos).sort((a, b) => value(b) - value(a) || a.id - b.id).slice(0, CANDIDATES);
    const drops = manager.squad
      .map((id) => players.get(id))
      .filter((p): p is ProjectedPlayer => !!p && p.position === pos && !isProtected(p, projections.based_on_gameweek));
    for (const c of candidates) {
      let best: { out: ProjectedPlayer; gain: number } | null = null;
      for (const d of drops) {
        const gain = strengthOf([...manager.squad.filter((id) => id !== d.id), c.id], players, projections, horizon, rules) - current;
        if (gain > (best?.gain ?? 0)) best = { out: d, gain };
      }
      if (best && best.gain >= MIN_GAIN) targets.push({ in: c, out: best.out, gain: best.gain, claimOnly: locked.has(c.id) });
    }
  }
  return targets.sort((a, b) => b.gain - a.gain || a.in.id - b.in.id);
}
