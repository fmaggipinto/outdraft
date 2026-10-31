import { useEffect, useState } from "react";
import { benchPoints } from "../analysis/seasonPoints";
import { fetchPicks, fetchResults } from "../data";
import type { Picks, Results } from "../types";

type Load = { kind: "loading" } | { kind: "error" } | { kind: "ready"; results: Results; picks: Map<number, Picks> };

/** This Manager's lineups for every finished gameweek, and everyone's points. */
async function loadLineups(entryId: number) {
  const results = await fetchResults();
  const picks = new Map<number, Picks>();
  await Promise.all(results.gameweeks.map(async (gw) => {
    const p = await fetchPicks(entryId, gw);
    if (p) picks.set(gw, p);
  }));
  return { results, picks };
}

const W = 340, H = 150, LEFT = 8, RIGHT = 8, TOP = 18, BOTTOM = 22;

/** Squad tab: points this Manager left on the bench, per finished gameweek
 * and for the season (docs/design.md §4, dashboard parity). */
export function BenchPoints({ entryId, teamName }: { entryId: number; teamName: string }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    setLoad({ kind: "loading" });
    loadLineups(entryId)
      .then((data) => live && setLoad({ kind: "ready", ...data }))
      .catch((e) => {
        console.error("Loading lineups failed", e);
        if (live) setLoad({ kind: "error" });
      });
    return () => { live = false; };
  }, [entryId]);

  const bench = load.kind === "ready" ? benchPoints(load.picks, load.results) : null;

  return (
    <section aria-labelledby="bench-h">
      <div className="section-head">
        <h2 id="bench-h">Points left on the bench</h2>
        {bench && <span className="note">{bench.total} pts in {bench.rows.length} gameweek{bench.rows.length === 1 ? "" : "s"}</span>}
      </div>
      <div className="card">
        {load.kind === "loading" ? (
          <p className="muted" role="status">Loading…</p>
        ) : load.kind === "error" ? (
          <p className="muted" role="status">Couldn't load {teamName}'s lineups right now.</p>
        ) : !bench!.rows.length ? (
          <p className="muted">Nothing yet: no finished gameweeks.</p>
        ) : (
          <BenchChart rows={bench!.rows} teamName={teamName} />
        )}
      </div>
    </section>
  );
}

function BenchChart({ rows, teamName }: { rows: { gameweek: number; points: number }[]; teamName: string }) {
  const max = Math.max(10, ...rows.map((r) => r.points));
  const band = (W - LEFT - RIGHT) / rows.length;
  const y = (v: number) => H - BOTTOM - (v / max) * (H - TOP - BOTTOM);
  return (
    <svg className="bench-chart" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`${teamName}'s points left on the bench: ${rows.map((r) => `GW${r.gameweek} ${r.points}`).join(", ")}`}>
      <line x1={LEFT} x2={W - RIGHT} y1={y(0)} y2={y(0)} className="base" />
      {rows.map((r, i) => {
        const cx = LEFT + band * i + band / 2;
        return (
          <g key={r.gameweek}>
            <rect x={cx - band * 0.32} width={band * 0.64} y={y(r.points)} height={y(0) - y(r.points)} />
            <text x={cx} y={y(r.points) - 4} textAnchor="middle" className="value">{r.points}</text>
            <text x={cx} y={H - 5} textAnchor="middle" className="axis">{r.gameweek}</text>
          </g>
        );
      })}
    </svg>
  );
}
