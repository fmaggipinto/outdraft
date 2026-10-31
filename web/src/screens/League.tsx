import { useEffect, useMemo, useState } from "react";
import { Link } from "../App";
import type { Horizon, LeagueAnalysis, ManagerAnalysis } from "../analysis/league";
import { ordinal, pts, relative, when } from "../format";
import { gwRange, HorizonToggle, useHorizon } from "../horizon";
import type { Projections } from "../types";
import { LeagueStatus, useLeague } from "../useLeague";

export const squadPath = (league: LeagueAnalysis, m: ManagerAnalysis, h: Horizon) =>
  `/league/${league.id}/manager/${m.entryId}?h=${h}`;

export function League({ id }: { id: number }) {
  const [state, retry] = useLeague(id);
  const [horizon, setHorizon] = useHorizon();

  useEffect(() => {
    if (state.kind === "ready") document.title = `${state.league.name} · Outdraft`;
  }, [state]);

  if (state.kind !== "ready") return <LeagueStatus id={id} state={state} retry={retry} />;

  const { league, projections } = state;
  return (
    <>
      <LeagueHeader league={league} projections={projections} />
      {league.drafted ? (
        <>
          <SquadStrength league={league} horizon={horizon} setHorizon={setHorizon} />
          <LeagueTable league={league} horizon={horizon} />
        </>
      ) : (
        <div className="card" role="status">
          <p>{league.name} hasn't drafted yet. Squad strength appears once every Manager has a Squad.</p>
        </div>
      )}
    </>
  );
}

function LeagueHeader({ league, projections }: { league: LeagueAnalysis; projections: Projections }) {
  const next = projections.events[0];
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = location.href;
    if (navigator.share) await navigator.share({ title: league.name, url }).catch(() => {});
    else {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <section className="league-head">
      <div className="title-row">
        <h1>{league.name}</h1>
        <button className="ghost" onClick={share}>{copied ? "Link copied" : "Share"}</button>
      </div>
      <p className="muted">
        {league.format === "h2h" ? "Head-to-head" : "Classic"} · {league.managers.length} Manager{league.managers.length === 1 ? "" : "s"} ·
        Projections updated {relative(projections.updated_at)}, using data to GW{projections.based_on_gameweek}
      </p>
      {next && (
        <dl className="deadlines">
          {next.waivers_deadline && (
            <div>
              <dt>GW{next.gameweek} Waiver deadline</dt>
              <dd>{when(next.waivers_deadline)} <span className="muted">({relative(next.waivers_deadline)})</span></dd>
            </div>
          )}
          <div>
            <dt>GW{next.gameweek} Gameweek deadline</dt>
            <dd>{when(next.deadline)} <span className="muted">({relative(next.deadline)})</span></dd>
          </div>
        </dl>
      )}
    </section>
  );
}

function SquadStrength({ league, horizon, setHorizon }: {
  league: LeagueAnalysis; horizon: Horizon; setHorizon: (h: Horizon) => void;
}) {
  const rows = useMemo(
    () => [...league.managers].sort((a, b) => b.strength[horizon] - a.strength[horizon]),
    [league, horizon],
  );
  const max = rows[0]?.strength[horizon] || 1;
  const min = Math.min(...rows.map((m) => m.strength[horizon]));
  return (
    <section className="card" aria-labelledby="strength-h">
      <div className="title-row">
        <h2 id="strength-h">Squad strength</h2>
        <HorizonToggle value={horizon} onChange={setHorizon} />
      </div>
      <p className="muted">
        Best XI Projections summed over {gwRange(league.gameweeks.slice(0, horizon))}, with today's Squads and
        optimal lineups. It shows each Squad's potential, not what its Manager will do. Tap a Manager to see their Squad.
      </p>
      <ol className="strength">
        {rows.map((m, i) => {
          // Bars start a little below the weakest Squad so differences are visible.
          const floor = Math.max(0, min - (max - min) * 0.5);
          const width = max > floor ? 8 + ((m.strength[horizon] - floor) / (max - floor)) * 92 : 100;
          return (
            <li key={m.entryId}>
              <Link to={squadPath(league, m, horizon)} className="strength-row">
                <span className="pos">{i + 1}</span>
                <div className="who">
                  <span className="team">{m.teamName}</span>
                  <span className="muted small">{m.managerName} · {ordinal(m.table.rank)} in table</span>
                  <span className="bar" style={{ width: `${width}%` }} />
                </div>
                <span className="value">{pts(m.strength[horizon])}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function LeagueTable({ league, horizon }: { league: LeagueAnalysis; horizon: Horizon }) {
  const h2h = league.format === "h2h";
  return (
    <section className="card" aria-labelledby="table-h">
      <h2 id="table-h">League table</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col" className="left">Manager</th>
              {h2h ? (
                <>
                  <th scope="col" title="Won">W</th>
                  <th scope="col" title="Drawn">D</th>
                  <th scope="col" title="Lost">L</th>
                  <th scope="col" title="Points scored">For</th>
                  <th scope="col">Pts</th>
                </>
              ) : (
                <>
                  <th scope="col" title="Points this gameweek">GW</th>
                  <th scope="col">Total</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {league.managers.map((m) => (
              <tr key={m.entryId}>
                <td>{m.table.rank}</td>
                <td className="left">
                  <Link to={squadPath(league, m, horizon)} className="team">{m.teamName}</Link>
                  <span className="muted small block">{m.managerName}</span>
                </td>
                {h2h ? (
                  <>
                    <td>{m.table.won ?? "–"}</td>
                    <td>{m.table.drawn ?? "–"}</td>
                    <td>{m.table.lost ?? "–"}</td>
                    <td>{m.table.pointsFor ?? "–"}</td>
                    <td className="strong">{m.table.total}</td>
                  </>
                ) : (
                  <>
                    <td>{m.table.gameweekPoints ?? "–"}</td>
                    <td className="strong">{m.table.total}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
