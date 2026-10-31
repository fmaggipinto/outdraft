import { useEffect, useMemo, useState } from "react";
import type { LeagueAnalysis } from "../analysis/league";
import { POSITIONS, seasonPointsByPosition, sortRows, type SeasonPositionRow, type ShareMode } from "../analysis/seasonPoints";
import { fetchPicks, fetchResults } from "../data";
import type { ElementStatus, Picks, Position, Projections, Results } from "../types";
import { YouTag } from "./ClaimCard";

const POS: Record<Position, string> = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };
const CONCURRENCY = 6;   // lineup requests at a time, to go easy on the relay

type Load =
  | { kind: "loading"; done: number; of: number }
  | { kind: "error" }
  | { kind: "ready"; results: Results; picks: Map<number, Map<number, Picks>> };

async function loadAll(league: LeagueAnalysis, onProgress: (done: number, of: number) => void) {
  const results = await fetchResults();
  const jobs = league.managers.flatMap((m) => results.gameweeks.map((gw) => ({ entry: m.entryId, gw })));
  const picks = new Map<number, Map<number, Picks>>(league.managers.map((m) => [m.entryId, new Map()]));
  let next = 0, done = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const { entry, gw } = jobs[next++];
      const p = await fetchPicks(entry, gw);
      if (p) picks.get(entry)!.set(gw, p);
      onProgress(++done, jobs.length);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { results, picks };
}

/** League › Season: the points each Manager actually scored from starting XIs,
 * split by position, with their top 3 scorers (docs/design.md §4). */
export function SeasonByPosition({ league, projections, status, me }: {
  league: LeagueAnalysis; projections: Projections; status: ElementStatus; me: number | null;
}) {
  const [load, setLoad] = useState<Load>({ kind: "loading", done: 0, of: 0 });

  useEffect(() => {
    let live = true;
    loadAll(league, (done, of) => live && setLoad({ kind: "loading", done, of }))
      .then((data) => live && setLoad({ kind: "ready", ...data }))
      .catch((e) => {
        console.error("Loading lineups failed", e);
        if (live) setLoad({ kind: "error" });
      });
    return () => { live = false; };
  }, [league]);

  const rows = useMemo(() => (load.kind === "ready"
    ? seasonPointsByPosition({ managers: league.managers, picks: load.picks, results: load.results, players: projections.players, status })
    : null), [load, league, projections, status]);

  return (
    <PositionStacks id="bypos-h" title="Season points by position" me={me} rows={rows}
      note="Points each Manager actually scored, from their starting XI after auto-subs, split by the position of the Players who earned them. Below each bar: their top 3 scorers."
      status={load.kind === "loading"
        ? `Loading lineups${load.of ? ` (${load.done} of ${load.of})` : ""}…`
        : load.kind === "error" ? "Couldn't load the lineups right now." : null} />
  );
}

/** Stacked bars by position, one per Manager, with a Points / % share toggle,
 * sorting by total or position, values in text and each row's top 3. */
export function PositionStacks({ id, title, note, rows, status, me }: {
  id: string; title: string; note: string; rows: SeasonPositionRow[] | null; status: string | null; me: number | null;
}) {
  const [mode, setMode] = useState<ShareMode>("points");
  const [sortBy, setSortBy] = useState<Position | null>(null);
  const sorted = rows ? sortRows(rows, sortBy, mode) : [];
  const max = Math.max(1, ...sorted.map((r) => r.total));

  return (
    <section aria-labelledby={id}>
      <div className="section-head">
        <h2 id={id}>{title}</h2>
        <div className="segmented" role="radiogroup" aria-label="Show">
          {(["points", "share"] as const).map((m) => (
            <button key={m} role="radio" aria-checked={m === mode} className={m === mode ? "on" : ""} onClick={() => setMode(m)}>
              {m === "points" ? "Points" : "% share"}
            </button>
          ))}
        </div>
      </div>
      <div className="card">
        <p className="muted small">{note}</p>
        {!rows ? (
          <p className="muted" role="status">{status}</p>
        ) : (
          <>
            <div className="segmented sort-by" role="radiogroup" aria-label="Sort by">
              {([null, ...POSITIONS] as const).map((p) => (
                <button key={p ?? 0} role="radio" aria-checked={p === sortBy} className={p === sortBy ? "on" : ""} onClick={() => setSortBy(p)}>
                  {p ? POS[p] : "Total"}
                </button>
              ))}
            </div>
            <ol className="bypos">
              {sorted.map((r) => {                const share = (p: Position) => (r.total ? (r.byPosition[p] / r.total) * 100 : 0);
                const label = (p: Position) => (mode === "share" ? `${Math.round(share(p))}%` : String(r.byPosition[p]));
                const width = mode === "share" ? 100 : (r.total / max) * 100;
                const headline = sortBy == null
                  ? (mode === "share" ? "" : `${r.total} pts`)
                  : `${label(sortBy)} ${POS[sortBy]}`;
                return (
                  <li key={r.manager.entryId} className={r.manager.entryId === me ? "me" : undefined}>
                    <div className="bypos-head">
                      <span className="team">{r.manager.teamName} <YouTag show={r.manager.entryId === me} /></span>
                      <span className="figure">{headline}</span>
                    </div>
                    <div className="stack" style={{ width: `${Math.max(width, 2)}%` }}
                      role="img" aria-label={POSITIONS.map((p) => `${POS[p]} ${label(p)}`).join(", ")}>
                      {POSITIONS.map((p) => (
                        <span key={p} className={`seg p${p}${sortBy && sortBy !== p ? " dim" : ""}`} style={{ width: `${share(p)}%` }} />
                      ))}
                    </div>
                    {/* Values as text under the bar: colour alone never carries meaning. */}
                    <p className="values small" aria-hidden="true">
                      {POSITIONS.map((p) => (
                        <span key={p} className={sortBy === p ? "strong" : undefined}><span className={`dot p${p}`} />{POS[p]} {label(p)}</span>
                      ))}
                    </p>
                    <p className="top3 small">
                      {r.top.map((s, i) => (
                        <span key={s.player.id}>
                          {i > 0 && <span className="muted"> · </span>}
                          <span className="muted">{i + 1}.</span> {s.player.name} <b>{s.points}</b>
                          {!s.stillOwned && <span className="left-squad" title="No longer in this Squad"> (left)</span>}
                        </span>
                      ))}
                    </p>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </section>
  );
}
