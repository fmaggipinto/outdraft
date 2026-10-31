import { useEffect, useState } from "react";
import type { LeagueAnalysis } from "./analysis/league";
import { classicRanks, h2hRanks, type EntryHistory, type RankHistory } from "./analysis/ranks";
import { fetchHistory } from "./data";

export type HistoryLoad = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: RankHistory };

// One load per League per screen visit, shared by the Season charts.
const pending = new Map<string, Promise<RankHistory>>();

function load(league: LeagueAnalysis, lastFinished: number): Promise<RankHistory> {
  if (league.format === "h2h") return Promise.resolve(h2hRanks(league));
  const key = `${league.id}:${lastFinished}`;
  if (!pending.has(key)) {
    const p = Promise.all(league.managers.map(async (m) => [m.entryId, await fetchHistory(m.entryId)] as [number, EntryHistory]))
      .then((list) => classicRanks(league, new Map(list), lastFinished));
    // Don't keep a failure: the next visit tries again.
    p.catch(() => pending.delete(key));
    pending.set(key, p);
  }
  return pending.get(key)!;
}

/** Points and ranks per finished gameweek for every Manager in the League. */
export function useRankHistory(league: LeagueAnalysis, lastFinished: number): HistoryLoad {
  const [state, setState] = useState<HistoryLoad>({ kind: "loading" });
  useEffect(() => {
    let live = true;
    load(league, lastFinished)
      .then((data) => live && setState({ kind: "ready", data }))
      .catch((e) => {
        console.error("Loading League history failed", e);
        if (live) setState({ kind: "error" });
      });
    return () => { live = false; };
  }, [league, lastFinished]);
  return state;
}
