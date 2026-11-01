import { useEffect, useMemo, useState } from "react";
import type { ManagerAnalysis } from "../analysis/league";
import { modelCheck, squadCheck, type CheckRow, type Manifest, type Snapshot } from "../analysis/modelCheck";
import { fetchManifest, fetchResults, fetchSnapshot } from "../data";
import { pts } from "../format";
import type { ProjectedPlayer, Results } from "../types";

type Load =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; manifest: Manifest; results: Results; snapshots: Map<number, Snapshot> };

async function loadAll() {
  const [manifest, results] = await Promise.all([fetchManifest(), fetchResults()]);
  // Only Snapshots of finished gameweeks are needed.
  const due = manifest.snapshots.filter((gw) => results.gameweeks.includes(gw));
  const snapshots = new Map(await Promise.all(due.map(async (gw) => [gw, await fetchSnapshot(gw)] as const)));
  return { manifest, results, snapshots };
}

const W = 340, H = 140, LEFT = 30, RIGHT = 8, TOP = 16, BOTTOM = 22;

/** More › Model check (ADR-0001, docs/design.md §4): Snapshots against actual
 * points, gameweek by gameweek, and the Claimed Manager's Squad last time. */
export function ModelCheck({ me, players }: { me: ManagerAnalysis | undefined; players: ProjectedPlayer[] }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    loadAll()
      .then((data) => live && setLoad({ kind: "ready", ...data }))
      .catch((e) => {
        console.error("Loading the Model check failed", e);
        if (live) setLoad({ kind: "error" });
      });
    return () => { live = false; };
  }, []);

  const rows = useMemo(() => (load.kind === "ready" ? modelCheck(load.manifest, load.snapshots, load.results) : []), [load]);
  const checked = rows.filter((r): r is Extract<CheckRow, { kind: "checked" }> => r.kind === "checked");
  const latest = checked.at(-1);

  let body;
  if (load.kind === "loading") body = <p className="muted" role="status">Loading the Model check…</p>;
  else if (load.kind === "error") body = <p className="muted" role="status">Couldn't load the Model check right now.</p>;
  else {
    const params = load.manifest.model.params;
    body = (
      <>
        <p className="muted small">
          How each gameweek's frozen Snapshot compared with the points Players actually scored. Correlation 0 is no
          better than guessing and 1 is perfect; for single-gameweek FPL points, around 0.3 is decent. Past
          Projections are never recomputed.
        </p>
        {!checked.length ? (
          <p role="status">
            The first Snapshot is GW{load.manifest.first_snapshot_gameweek}. The Model check starts once that gameweek
            finishes.
          </p>
        ) : (
          <>
            {checked.length < 4 && <p className="muted small">Only {checked.length} gameweek{checked.length === 1 ? "" : "s"} so far: don't read too much into it yet.</p>}
            <CorrelationBars rows={checked} />
          </>
        )}
        <div className="scroll">
          <table className="check-table">
            <thead>
              <tr><th scope="col" className="left">GW</th><th scope="col">Correlation</th><th scope="col">Avg error</th><th scope="col">Players</th><th scope="col">Model</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.gameweek} className={r.kind}>
                  <th scope="row" className="left">GW{r.gameweek}</th>
                  {r.kind === "checked" ? (
                    <>
                      <td>{r.correlation.toFixed(2)}</td>
                      <td>{r.error.toFixed(2)} pts</td>
                      <td>{r.players}</td>
                      <td>v{r.modelVersion}</td>
                    </>
                  ) : (
                    <td colSpan={4} className="left muted">
                      {r.kind === "gap" ? "No Snapshot: missed, and never filled in" : "Snapshot taken; waiting for the gameweek to finish"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          Current Model: v{load.manifest.model.version}
          {params && `, xG weight ${params.w}, opponent effect ${params.k}`}.
        </p>
        {me && latest && <SquadCheck me={me} players={players} snapshot={load.snapshots.get(latest.gameweek)!} results={load.results} />}
      </>
    );
  }

  return (
    <section aria-labelledby="model-h">
      <div className="section-head">
        <h2 id="model-h">Model check</h2>
      </div>
      <div className="card">{body}</div>
    </section>
  );
}

function CorrelationBars({ rows }: { rows: Extract<CheckRow, { kind: "checked" }>[] }) {
  const max = Math.max(0.5, ...rows.map((r) => r.correlation));
  const band = (W - LEFT - RIGHT) / rows.length;
  const y = (v: number) => H - BOTTOM - (Math.max(0, v) / max) * (H - TOP - BOTTOM);
  return (
    <svg className="check-chart" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Correlation by gameweek: ${rows.map((r) => `GW${r.gameweek} ${r.correlation.toFixed(2)}`).join(", ")}`}>
      <line x1={LEFT} x2={W - RIGHT} y1={y(0.3)} y2={y(0.3)} className="mark" />
      <text x={LEFT - 4} y={y(0.3) + 4} textAnchor="end" className="axis">0.3</text>
      <line x1={LEFT} x2={W - RIGHT} y1={y(0)} y2={y(0)} className="base" />
      {rows.map((r, i) => {
        const cx = LEFT + band * i + band / 2;
        return (
          <g key={r.gameweek}>
            <rect x={cx - band * 0.32} width={band * 0.64} y={y(r.correlation)} height={y(0) - y(r.correlation)} />
            <text x={cx} y={y(r.correlation) - 4} textAnchor="middle" className="value">{r.correlation.toFixed(2)}</text>
            <text x={cx} y={H - 5} textAnchor="middle" className="axis">{r.gameweek}</text>
          </g>
        );
      })}
    </svg>
  );
}

function SquadCheck({ me, players, snapshot, results }: {
  me: ManagerAnalysis; players: ProjectedPlayer[]; snapshot: Snapshot; results: Results;
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const rows = squadCheck(snapshot, results, me.squad);
  return (
    <>
      <h3 className="label xi-title">Your Squad in GW{snapshot.gameweek}: predicted vs actual</h3>
      <div className="scroll">
        <table className="check-table">
          <thead><tr><th scope="col" className="left">Player</th><th scope="col">Predicted</th><th scope="col">Actual</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const diff = r.actual - r.predicted;
              const mark = diff >= 2 ? "▲ beat it" : diff <= -2 ? "▼ fell short" : "";
              return (
                <tr key={r.id}>
                  <th scope="row" className="left">{byId.get(r.id)?.name ?? `Player ${r.id}`}</th>
                  <td>{pts(r.predicted)}</td>
                  <td className={diff >= 2 ? "beat" : diff <= -2 ? "short" : undefined}>{r.actual} <span className="small">{mark}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
