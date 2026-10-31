import { useEffect, useMemo } from "react";
import { Link } from "../App";
import type { Horizon, LeagueAnalysis, ManagerAnalysis } from "../analysis/league";
import { useClaim } from "../claim";
import { ClaimCard, YouTag } from "../components/ClaimCard";
import { MatchupsSection } from "../components/MatchupsSection";
import { PointsPerGameweek } from "../components/PointsPerGameweek";
import { RankOverTime } from "../components/RankOverTime";
import { Screen } from "../components/Screen";
import { TransactionLog } from "../components/TransactionLog";
import { useRankHistory } from "../seasonHistory";
import { PositionStacks, SeasonByPosition } from "../components/SeasonByPosition";
import { currentSquadPoints } from "../analysis/seasonPoints";
import { ordinal, pts, relative, when } from "../format";
import { gwRange, HorizonToggle, useHorizon } from "../horizon";
import type { Projections } from "../types";
import { LeagueStatus, useLeague } from "../useLeague";

export const squadPath = (league: LeagueAnalysis, m: ManagerAnalysis, h: Horizon) =>
  `/league/${league.id}/squad/${m.entryId}?h=${h}`;

/** The League tab (home): table, this gameweek's Matchups, Squad strength. */
export function League({ id }: { id: number }) {
  const [state, retry] = useLeague(id);
  const [horizon, setHorizon] = useHorizon();
  const [claim, setClaim] = useClaim(id);

  useEffect(() => {
    if (state.kind === "ready") document.title = `${state.league.name} · Outdraft`;
  }, [state]);

  if (state.kind !== "ready") return <LeagueStatus id={id} state={state} retry={retry} tab="league" title="League" />;

  const { league, projections } = state;
  // A claim for a Manager no longer in the League is ignored.
  const me = league.managers.find((m) => m.entryId === claim)?.entryId ?? null;
  const kicker = `${league.format === "h2h" ? "Head-to-head" : "Classic"} · ${league.managers.length} Manager${league.managers.length === 1 ? "" : "s"}`;
  return (
    <Screen title={league.name} kicker={kicker} projections={projections} league={{ id, tab: "league", trades: league.trades }}>
      <Deadlines projections={projections} />
      {league.drafted ? (
        <>
          {me == null && <ClaimCard league={league} me={me} setClaim={setClaim} />}
          <LeagueTable league={league} horizon={horizon} me={me} lastFinished={projections.based_on_gameweek} />
          {league.format === "h2h" && <MatchupsSection league={league} me={me} />}
          <SquadStrength league={league} horizon={horizon} setHorizon={setHorizon} me={me} />
          <h2 className="season-title">Season</h2>
          <RankOverTime league={league} lastFinished={projections.based_on_gameweek} me={me} />
          <PointsPerGameweek league={league} lastFinished={projections.based_on_gameweek} me={me} />
          <SeasonByPosition league={league} projections={projections} status={state.status} me={me} />
          <PositionStacks id="holding-h" title="Current Squad's season points by position" me={me} status={null}
            rows={currentSquadPoints(league.managers, projections.players)}
            note="Season points of the Players each Manager holds now, wherever they earned them: another Squad, the bench, or before being signed. Not the League score, and not Squad strength. Below each bar: the Squad's top 3 scorers." />
          <TransactionLog league={league} projections={projections} me={me} />
        </>
      ) : (
        <div className="card" role="status">
          <p>{league.name} hasn't drafted yet. Squad strength appears once every Manager has a Squad.</p>
        </div>
      )}
    </Screen>
  );
}

function Deadlines({ projections }: { projections: Projections }) {
  const next = projections.events[0];
  if (!next) return null;
  return (
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
  );
}

function SquadStrength({ league, horizon, setHorizon, me }: {
  league: LeagueAnalysis; horizon: Horizon; setHorizon: (h: Horizon) => void; me: number | null;
}) {
  const rows = useMemo(
    () => [...league.managers].sort((a, b) => b.strength[horizon] - a.strength[horizon]),
    [league, horizon],
  );
  const max = rows[0]?.strength[horizon] || 1;
  const min = Math.min(...rows.map((m) => m.strength[horizon]));
  return (
    <section aria-labelledby="strength-h">
      <div className="section-head">
        <h2 id="strength-h">Squad strength</h2>
        <HorizonToggle value={horizon} onChange={setHorizon} />
      </div>
      <div className="card">
        <p className="muted small">
          Best XI Projections summed over {gwRange(league.gameweeks.slice(0, horizon))}, with today's Squads and
          optimal lineups. It shows each Squad's potential, not what its Manager will do. Tap a Manager to see their Squad.
        </p>
        <ol className="strength">
          {rows.map((m, i) => {
            // Bars start a little below the weakest Squad so differences are visible.
            const floor = Math.max(0, min - (max - min) * 0.5);
            const width = max > floor ? 8 + ((m.strength[horizon] - floor) / (max - floor)) * 92 : 100;
            return (
              <li key={m.entryId} className={m.entryId === me ? "me" : undefined}>
                <Link to={squadPath(league, m, horizon)} className="strength-row">
                  <span className="pos">{i + 1}</span>
                  <div className="who">
                    <span className="team">{m.teamName} <YouTag show={m.entryId === me} /></span>
                    <span className="muted small">{m.managerName} · {ordinal(m.table.rank)} in table</span>
                    <span className="bar" style={{ width: `${width}%` }} />
                  </div>
                  <span className="value">{pts(m.strength[horizon])}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function LeagueTable({ league, horizon, me, lastFinished }: {
  league: LeagueAnalysis; horizon: Horizon; me: number | null; lastFinished: number;
}) {
  const h2h = league.format === "h2h";
  // Each Manager's last 3 finished gameweek scores, oldest first (dashboard parity).
  const history = useRankHistory(league, lastFinished);
  const last3 = (entryId: number) => {
    if (history.kind !== "ready") return history.kind === "loading" ? "…" : "–";
    const pts = history.data.points.get(entryId) ?? [];
    return pts.slice(-3).map((x) => x ?? "–").join(" · ") || "–";
  };
  const last3Gws = history.kind === "ready" ? history.data.gameweeks.slice(-3) : [];
  return (
    <section aria-labelledby="table-h">
      <div className="section-head">
        <h2 id="table-h">League table</h2>
      </div>
      <div className="card">
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
                  <th scope="col">Total</th>
                )}
              </tr>
            </thead>
            <tbody>
              {league.managers.map((m) => (
                <tr key={m.entryId} className={m.entryId === me ? "me" : undefined}>
                  <td>{m.table.rank}</td>
                  <td className="left">
                    <Link to={squadPath(league, m, horizon)} className="team">{m.teamName}</Link> <YouTag show={m.entryId === me} />
                    <span className="muted small block">{m.managerName}</span>
                    <span className="last3 block" title={last3Gws.length ? `GW${last3Gws.join(", GW")}` : undefined}>
                      Last 3: {last3(m.entryId)}
                    </span>
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
                    <td className="strong">{m.table.total}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
