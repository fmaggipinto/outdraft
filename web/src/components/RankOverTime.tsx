import { useEffect, useMemo, useState } from "react";
import type { LeagueAnalysis } from "../analysis/league";
import { classicRanks, h2hRanks, type EntryHistory, type RankHistory } from "../analysis/ranks";
import { fetchHistory } from "../data";
import { ordinal } from "../format";
import { YouTag } from "./ClaimCard";

type Load = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: RankHistory };

// Drawn at roughly phone width, so text keeps its size on a phone.
const W = 340, H = 220, LEFT = 22, RIGHT = 10, TOP = 10, BOTTOM = 22;

/** League › Season: every Manager's rank after each finished gameweek. The
 * Claimed Manager's line is accent and thicker; tapping a Manager in the
 * legend highlights theirs (docs/design.md §4). */
export function RankOverTime({ league, lastFinished, me }: { league: LeagueAnalysis; lastFinished: number; me: number | null }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    if (league.format === "h2h") {
      setLoad({ kind: "ready", data: h2hRanks(league) });
      return;
    }
    Promise.all(league.managers.map(async (m) => [m.entryId, await fetchHistory(m.entryId)] as [number, EntryHistory]))
      .then((list) => live && setLoad({ kind: "ready", data: classicRanks(league, new Map(list), lastFinished) }))
      .catch((e) => {
        console.error("Loading League history failed", e);
        if (live) setLoad({ kind: "error" });
      });
    return () => { live = false; };
  }, [league, lastFinished]);

  const n = league.managers.length;
  const chart = useMemo(() => {
    if (load.kind !== "ready" || load.data.gameweeks.length < 2) return null;
    const gws = load.data.gameweeks;
    const x = (i: number) => LEFT + (i * (W - LEFT - RIGHT)) / (gws.length - 1);
    const y = (rank: number) => TOP + ((rank - 1) * (H - TOP - BOTTOM)) / Math.max(1, n - 1);
    return { gws, x, y };
  }, [load, n]);

  // Draw muted lines first, then the highlighted ones on top.
  const order = [...league.managers].sort((a, b) =>
    Number(a.entryId === me || a.entryId === picked) - Number(b.entryId === me || b.entryId === picked));

  return (
    <section aria-labelledby="rank-h">
      <div className="section-head">
        <h2 id="rank-h">Rank over time</h2>
        <span className="note">Tap a Manager to highlight</span>
      </div>
      <div className="card">
        {load.kind === "loading" ? (
          <p className="muted" role="status">Loading League history…</p>
        ) : load.kind === "error" ? (
          <p className="muted" role="status">Couldn't load the League's history right now.</p>
        ) : !chart ? (
          <p className="muted">The chart appears after two finished gameweeks.</p>
        ) : (
          <>
            <svg className="rank-chart" viewBox={`0 0 ${W} ${H}`} role="img"
              aria-label={`League rank after each gameweek, GW${chart.gws[0]} to GW${chart.gws.at(-1)}`}>
              {Array.from({ length: n }, (_, i) => (
                <g key={i}>
                  <line x1={LEFT} x2={W - RIGHT} y1={chart.y(i + 1)} y2={chart.y(i + 1)} className="grid" />
                  <text x={LEFT - 6} y={chart.y(i + 1) + 4} textAnchor="end" className="axis">{i + 1}</text>
                </g>
              ))}
              {chart.gws.map((gw, i) => (
                <text key={gw} x={chart.x(i)} y={H - 4} textAnchor="middle" className="axis">{gw}</text>
              ))}
              {order.map((m) => {
                const ranks = load.kind === "ready" ? load.data.ranks.get(m.entryId)! : [];
                const mine = m.entryId === me, chosen = m.entryId === picked;
                const cls = chosen ? "line picked" : mine ? "line mine" : picked != null ? "line dim" : "line";
                return (
                  <g key={m.entryId}>
                    <polyline className={cls} points={ranks.map((r, i) => `${chart.x(i)},${chart.y(r)}`).join(" ")} />
                    {(mine || chosen) && (
                      <circle className={cls} cx={chart.x(ranks.length - 1)} cy={chart.y(ranks.at(-1)!)} r={4} />
                    )}
                  </g>
                );
              })}
            </svg>
            <p className="muted small chart-note">Gameweek along the bottom; 1st at the top.</p>
            <ul className="rank-legend">
              {league.managers.map((m) => {
                const ranks = load.kind === "ready" ? load.data.ranks.get(m.entryId)! : [];
                const mine = m.entryId === me, chosen = m.entryId === picked;
                return (
                  <li key={m.entryId}>
                    <button type="button" aria-pressed={chosen} className={chosen ? "on" : mine ? "mine" : undefined}
                      onClick={() => setPicked(chosen ? null : m.entryId)}>
                      <span className="swatch" aria-hidden="true" />
                      <span className="name">{m.teamName}</span> <YouTag show={mine} />
                      <span className="path" aria-hidden="true">{ordinal(ranks[0])} → {ordinal(ranks.at(-1)!)}</span>
                      <span className="sr-only">Ranks by gameweek: {ranks.join(", ")}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
