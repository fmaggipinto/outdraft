import { useEffect } from "react";
import { Link } from "../App";
import { squadBreakdown, type SquadCell, type SquadRow } from "../analysis/squad";
import { ordinal, pts } from "../format";
import { gwRange, HorizonToggle, useHorizon } from "../horizon";
import type { Position, ProjectedPlayer } from "../types";
import { LeagueStatus, useLeague } from "../useLeague";

const POSITION: Record<Position, { short: string; plural: string }> = {
  1: { short: "GKP", plural: "Goalkeepers" },
  2: { short: "DEF", plural: "Defenders" },
  3: { short: "MID", plural: "Midfielders" },
  4: { short: "FWD", plural: "Forwards" },
};

export function Squad({ leagueId, entryId }: { leagueId: number; entryId: number }) {
  const [state, retry] = useLeague(leagueId);
  const [horizon, setHorizon] = useHorizon();
  const manager = state.kind === "ready" ? state.league.managers.find((m) => m.entryId === entryId) : undefined;

  useEffect(() => {
    if (manager && state.kind === "ready") document.title = `${manager.teamName} · ${state.league.name} · Outdraft`;
  }, [manager, state]);

  if (state.kind !== "ready") return <LeagueStatus id={leagueId} state={state} retry={retry} />;
  const { league, projections } = state;
  const back = (
    <Link to={`/league/${leagueId}?h=${horizon}`} className="back">← {league.name}</Link>
  );
  if (!manager || !league.drafted)
    return (
      <>
        {back}
        <div className="card status" role="alert">
          <p>{manager ? `${league.name} hasn't drafted yet, so there's no Squad to show.` : "This Manager isn't in this League."}</p>
        </div>
      </>
    );

  const b = squadBreakdown(manager, projections, horizon);
  const strengthRank = 1 + league.managers.filter((m) => m.strength[horizon] > manager.strength[horizon]).length;

  return (
    <>
      {back}
      <section className="league-head">
        <h1>{manager.teamName}</h1>
        <p className="muted">
          {manager.managerName} · {ordinal(manager.table.rank)} in the table · {ordinal(strengthRank)} for Squad strength
        </p>
      </section>

      <section className="card" aria-labelledby="split-h">
        <div className="title-row">
          <h2 id="split-h">Squad strength <span className="value-inline">{pts(b.strength)}</span></h2>
          <HorizonToggle value={horizon} onChange={setHorizon} />
        </div>
        <p className="muted">
          Best XI Projections over {gwRange(b.gameweeks)}, split by position.
        </p>
        <PositionSplit byPosition={b.byPosition} total={b.strength} />
      </section>

      <section className="card" aria-labelledby="squad-h">
        <h2 id="squad-h">Squad</h2>
        <p className="muted small">
          <span className="key starter" /> in that gameweek's Best XI · <span className="key" /> on the bench.
          Opponents in capitals are at home. "Adds" is what the Player adds to Squad strength.
        </p>
        <div className="scroll">
          <table className="squad">
            <thead>
              <tr>
                <th scope="col" className="left player-col">Player</th>
                {b.gameweeks.map((gw) => <th key={gw} scope="col">GW{gw}</th>)}
                <th scope="col" title="Points this Player adds to Squad strength">Adds</th>
              </tr>
            </thead>
            {([1, 2, 3, 4] as Position[]).map((pos) => (
              <PositionGroup key={pos} pos={pos} rows={b.rows.filter((r) => r.player.position === pos)} span={b.gameweeks.length + 2} />
            ))}
          </table>
        </div>
      </section>
    </>
  );
}

function PositionSplit({ byPosition, total }: { byPosition: Record<Position, number>; total: number }) {
  return (
    <>
      <div className="split" aria-hidden="true">
        {([1, 2, 3, 4] as Position[]).map((p) => (
          <span key={p} className={`seg p${p}`} style={{ width: `${total ? (byPosition[p] / total) * 100 : 25}%` }} />
        ))}
      </div>
      <ul className="split-legend">
        {([1, 2, 3, 4] as Position[]).map((p) => (
          <li key={p}>
            <span className={`dot p${p}`} />
            {POSITION[p].short} <b>{pts(byPosition[p])}</b>
            <span className="muted"> ({total ? Math.round((byPosition[p] / total) * 100) : 0}%)</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function PositionGroup({ pos, rows, span }: { pos: Position; rows: SquadRow[]; span: number }) {
  if (!rows.length) return null;
  return (
    <tbody>
      <tr className="pos-row">
        <th scope="rowgroup" colSpan={span} className="left">{POSITION[pos].plural}</th>
      </tr>
      {rows.map((r) => (
        <tr key={r.player.id}>
          <th scope="row" className="left player-col">
            <span className="team">{r.player.name}</span>
            <StatusTag player={r.player} />
            {r.player.news && <span className="news">{r.player.news}</span>}
          </th>
          {r.cells.map((c) => <Cell key={c.gameweek} cell={c} />)}
          <td className="strong">{pts(r.contribution)}</td>
        </tr>
      ))}
    </tbody>
  );
}

function Cell({ cell }: { cell: SquadCell }) {
  return (
    <td className={cell.starter ? "gw starter" : "gw"}>
      <span className="pts">{cell.opponents.length ? pts(cell.points) : "–"}</span>
      <span className="opp">
        {cell.opponents.length
          ? cell.opponents.map((o, i) => <span key={i}>{o.home ? o.team.toUpperCase() : o.team.toLowerCase()}</span>)
          : "no game"}
      </span>
    </td>
  );
}

function StatusTag({ player }: { player: ProjectedPlayer }) {
  const text = {
    d: player.chance_next != null ? `Doubt ${player.chance_next}%` : "Doubt",
    i: "Injured",
    s: "Suspended",
    u: "Unavailable",
    n: "Unavailable",
  }[player.status];
  if (!text) return null;
  return <span className={`tag ${player.status === "d" ? "warn" : "bad"}`}>{text}</span>;
}
