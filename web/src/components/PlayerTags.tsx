import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ManagerAnalysis } from "../analysis/league";
import { isProtected, lockedOnWaivers, waiverPhase, type Phase } from "../analysis/waivers";
import { fetchGame, fetchTransactions } from "../data";
import type { ElementStatus, ProjectedPlayer, Projections } from "../types";

/** What the tags need to know beyond the Player: which Players are locked on
 * waivers right now, and which of the Claimed Manager's are protected. */
export interface TagContext {
  phase: Phase | null;
  locked: Set<number>;
  protectedIds: Set<number>;
}

const EMPTY: TagContext = { phase: null, locked: new Set(), protectedIds: new Set() };
const Ctx = createContext<TagContext>(EMPTY);

export function PlayerTagsProvider({ value, children }: { value: TagContext; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The tags a Player carries, in display order. */
export function playerTags(p: ProjectedPlayer, ctx: TagContext): { text: string; kind: "warn" | "bad" | "plain" }[] {
  const out: { text: string; kind: "warn" | "bad" | "plain" }[] = [];
  const status = {
    d: p.chance_next != null ? `Doubt ${p.chance_next}%` : "Doubt",
    i: "Injured", s: "Suspended", u: "Unavailable", n: "Unavailable",
  }[p.status];
  if (status) out.push({ text: status, kind: p.status === "d" ? "warn" : "bad" });
  // Claim only: locked on waivers, and waivers haven't been processed yet.
  if (ctx.locked.has(p.id) && ctx.phase !== "free" && ctx.phase != null) out.push({ text: "Claim only", kind: "warn" });
  if (ctx.protectedIds.has(p.id)) out.push({ text: "Protected", kind: "plain" });
  return out;
}

/** Every Player's tags, wherever he appears (docs/design.md §4): doubt with
 * chance, injured, suspended, unavailable, claim only and protected. */
export function PlayerTags({ p }: { p: ProjectedPlayer }) {
  const ctx = useContext(Ctx);
  const tags = playerTags(p, ctx);
  return (
    <span className="ptags">
      {tags.map((t) => <span key={t.text} className={`tag ${t.kind === "plain" ? "" : t.kind}`.trim()}>{t.text}</span>)}
    </span>
  );
}

/** Loads the waiver phase and locked Players, and works out which of the
 * Claimed Manager's Players are protected. Tags work without it meanwhile. */
export function useTagContext(leagueId: number, status: ElementStatus | undefined, projections: Projections | undefined, me: ManagerAnalysis | undefined): TagContext {
  const [waivers, setWaivers] = useState<{ phase: Phase; locked: Set<number> } | null>(null);
  useEffect(() => {
    if (!status || !projections) return;
    let live = true;
    Promise.all([fetchGame(), fetchTransactions(leagueId).catch(() => null)])
      .then(([game, transactions]) => live && setWaivers({
        phase: waiverPhase(game, projections, Date.now()),
        locked: lockedOnWaivers(status, transactions, game.next_event),
      }))
      .catch(() => {});   // without them, tags just leave out "claim only"
    return () => { live = false; };
  }, [leagueId, status, projections]);
  return useMemo(() => {
    if (!projections) return EMPTY;
    const players = new Map(projections.players.map((p) => [p.id, p]));
    const protectedIds = new Set((me?.squad ?? []).filter((id) => {
      const p = players.get(id);
      return p && isProtected(p, projections.based_on_gameweek);
    }));
    return { phase: waivers?.phase ?? null, locked: waivers?.locked ?? new Set(), protectedIds };
  }, [waivers, me, projections]);
}
