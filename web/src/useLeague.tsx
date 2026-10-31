import { useEffect, useState } from "react";
import { navigate } from "./App";
import { analyseLeague, type LeagueAnalysis } from "./analysis/league";
import { fetchLeague, fetchProjections, isStale, leagueUrls, NotFoundError, projectionsUrl } from "./data";
import { Screen } from "./components/Screen";
import type { TabKey } from "./components/TabBar";
import { rememberLeague } from "./recent";
import type { ElementStatus, Projections } from "./types";

export type LeagueState =
  | { kind: "loading" }
  | { kind: "error"; message: string; retry: boolean }
  | { kind: "ready"; league: LeagueAnalysis; projections: Projections; status: ElementStatus };

// Kept for the session so moving between the League and Squad screens is instant.
const cache = new Map<number, Extract<LeagueState, { kind: "ready" }>>();

export function useLeague(id: number): [LeagueState, () => void] {
  const [state, setState] = useState<LeagueState>(() => cache.get(id) ?? { kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const hit = cache.get(id);
    if (hit) return setState(hit);
    let live = true;
    setState({ kind: "loading" });
    Promise.all([fetchLeague(id), fetchProjections()])
      .then(([[details, status], projections]) => {
        const ready = { kind: "ready" as const, league: analyseLeague(details, status, projections), projections, status };
        // Saved copies aren't kept in memory, so the next screen tries the network again.
        if (!isStale([...leagueUrls(id), projectionsUrl])) cache.set(id, ready);
        rememberLeague({ id, name: ready.league.name });
        if (live) setState(ready);
      })
      .catch((e) => {
        console.error(`Loading League ${id} failed`, e);
        if (!live) return;
        const unknown = e instanceof NotFoundError && String(e.message).includes("/league/");
        setState({
          kind: "error",
          retry: !unknown,
          message: unknown
            ? `There's no FPL Draft League with ID ${id}. Check the number in your League's address.`
            : "Couldn't load this League right now. FPL Draft may be busy (it often is around deadlines).",
        });
      });
    return () => { live = false; };
  }, [id, attempt]);

  return [state, () => { cache.delete(id); setAttempt((n) => n + 1); }];
}

/** Loading and error states shared by every League screen, inside the header band. */
export function LeagueStatus({ id, state, retry, tab, title }: {
  id: number; state: LeagueState; retry: () => void; tab: TabKey; title: string;
}) {
  if (state.kind === "ready") return null;
  return (
    <Screen title={title} kicker={`League ${id}`} league={{ id, tab, trades: true }}>
      {state.kind === "loading" ? (
        <p className="status" role="status">Loading League {id}…</p>
      ) : (
        <div className="card status" role="alert">
          <p>{state.message}</p>
          {state.retry
            ? <button onClick={retry}>Try again</button>
            : <button onClick={() => navigate("/")}>Enter another League ID</button>}
        </div>
      )}
    </Screen>
  );
}
