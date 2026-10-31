import { useEffect } from "react";
import { navigate } from "../App";
import { squadBreakdown, type SquadCell, type SquadRow } from "../analysis/squad";
import { useClaim } from "../claim";
import { StatusTag } from "../components/FreeAgentBrowser";
import { Screen } from "../components/Screen";
import { ordinal, pts } from "../format";
import { gwRange, HorizonToggle, useHorizon } from "../horizon";
import type { Position } from "../types";
import { LeagueStatus, useLeague } from "../useLeague";

const POSITION: Record<Position, { short: string; plural: string }> = {
  1: { short: "GKP", plural: "Goalkeepers" },
  2: { short: "DEF", plural: "Defenders" },
  3: { short: "MID", plural: "Midfielders" },
  4: { short: "FWD", plural: "Forwards" },
};

/** The Squad tab: the Claimed Manager's Squad, or any Manager's, as a team sheet. */
export function Squad({ leagueId, entryId }: { leagueId: number; entryId: number | null }) {
  const [state, retry] = useLeague(leagueId);
  const [horizon, setHorizon] = useHorizon();
  const [claim, setClaim] = useClaim(leagueId);
  const managers = state.kind === "ready" ? state.league.managers : [];
  // No Manager in the address: the Claimed Manager, else the League leader.
  const shownId = entryId ?? managers.find((m) => m.entryId === claim)?.entryId ?? managers[0]?.entryId;
  const manager = managers.find((m) => m.entryId === shownId);

  useEffect(() => {
    if (manager && state.kind === "ready") document.title = `${manager.teamName} · ${state.league.name} · Outdraft`;
  }, [manager, state]);

  if (state.kind !== "ready") return <LeagueStatus id={leagueId} state={state} retry={retry} tab="squad" title="Squad" />;
  const { league, projections } = state;
  const tabs = { id: leagueId, tab: "squad" as const, trades: league.trades };
  if (!manager || !league.drafted)
    return (
      <Screen title="Squad" kicker={league.name} projections={projections} league={tabs}>
        <div className="card status" role="alert">
          <p>{league.drafted ? "This Manager isn't in this League." : `${league.name} hasn't drafted yet, so there's no Squad to show.`}</p>
        </div>
      </Screen>
    );

  const b = squadBreakdown(manager, projections, horizon);
  const strengthRank = 1 + league.managers.filter((m) => m.strength[horizon] > manager.strength[horizon]).length;
  const mine = claim === manager.entryId;

  return (
    <Screen title={manager.teamName} kicker={`Squad · ${league.name}`} projections={projections} league={tabs}>
      <div className="manager-picker">
        <label className="sr-only" htmlFor="manager-select">Manager</label>
        <select id="manager-select" value={manager.entryId}
          onChange={(e) => navigate(`/league/${leagueId}/squad/${e.target.value}?h=${horizon}`)}>
          {league.managers.map((m) => (
            <option key={m.entryId} value={m.entryId}>{m.teamName}{m.entryId === claim ? " (you)" : ""}</option>
          ))}
        </select>
        {mine
          ? <button className="ghost" onClick={() => setClaim(null)}>Not me</button>
          : <button className="ghost" onClick={() => setClaim(manager.entryId)}>This is me</button>}
      </div>
      <p className="muted">
        {mine && <span className="tag you" style={{ marginLeft: 0, marginRight: 6 }}>You</span>}
        {manager.managerName} · {ordinal(manager.table.rank)} in the table · {ordinal(strengthRank)} for Squad strength
      </p>

      <section aria-labelledby="sheet-h">
        <div className="section-head">
          <h2 id="sheet-h">Team sheet</h2>
          <HorizonToggle value={horizon} onChange={setHorizon} />
        </div>
        <div className="card">
          <TeamSheet rows={b.rows} gameweeks={b.gameweeks} clubs={new Map(projections.teams.map((t) => [t.id, t.short_name]))} />
        </div>
      </section>

      <section aria-labelledby="split-h">
        <div className="section-head">
          <h2 id="split-h">Squad strength <span className="value-inline">{pts(b.strength)}</span></h2>
          <span className="note">{gwRange(b.gameweeks)}, by position</span>
        </div>
        <div className="card">
          <PositionSplit byPosition={b.byPosition} total={b.strength} />
        </div>
      </section>

      <section aria-labelledby="squad-h">
        <div className="section-head">
          <h2 id="squad-h">Gameweek by gameweek</h2>
        </div>
        <div className="card">
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
        </div>
      </section>
    </Screen>
  );
}

/** The Squad as a printed team sheet (docs/design.md §3): grouped by position,
 * a shirt-style number, the Player, "club · next fixture", and his Projection. */
function TeamSheet({ rows, gameweeks, clubs }: { rows: SquadRow[]; gameweeks: number[]; clubs: Map<number, string> }) {
  let number = 0;
  return (
    <ul className="sheet" aria-label="Team sheet">
      {([1, 2, 3, 4] as Position[]).map((pos) => {
        const group = rows.filter((r) => r.player.position === pos);
        if (!group.length) return null;
        return [
          <li key={`g${pos}`} className="group" aria-hidden="true">{POSITION[pos].plural}</li>,
          ...group.map((r) => {
            number += 1;
            const next = r.cells[0];
            const fixture = next?.opponents.length
              ? next.opponents.map((o) => (o.home ? o.team.toUpperCase() : o.team.toLowerCase())).join(" + ")
              : "no game";
            const projection = r.cells.reduce((s, c) => s + c.points, 0);
            return (
              <li key={r.player.id} className="sheet-row">
                <span className="num" aria-hidden="true">{number}</span>
                <span className="who">
                  <span><span className="name">{r.player.name}</span><StatusTag p={r.player} /></span>
                  <span className="muted small">{clubs.get(r.player.team)} · GW{gameweeks[0]} {fixture}</span>
                  {r.player.news && <span className="news">{r.player.news}</span>}
                </span>
                <span className="proj" aria-label={`Projection ${pts(projection)}`}>{pts(projection)}</span>
              </li>
            );
          }),
        ];
      })}
    </ul>
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
            <StatusTag p={r.player} />
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
