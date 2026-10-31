import { useEffect, useMemo, useState } from "react";
import { navigate } from "../App";
import { analyseLeague, HORIZONS, type Horizon, type LeagueAnalysis } from "../analysis/league";
import { fetchLeague, fetchProjections, NotFoundError } from "../data";
import { pts, relative, when } from "../format";
import type { Projections } from "../types";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string; retry: boolean }
  | { kind: "ready"; league: LeagueAnalysis; projections: Projections };

const HORIZON_LABEL: Record<Horizon, string> = { 1: "Next GW", 3: "Next 3", 6: "Next 6" };

export function League({ id }: { id: number }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setState({ kind: "loading" });
    Promise.all([fetchLeague(id), fetchProjections()])
      .then(([[details, status], projections]) => {
        if (live) setState({ kind: "ready", league: analyseLeague(details, status, projections), projections });
      })
      .catch((e) => {
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

  useEffect(() => {
    if (state.kind === "ready") document.title = `${state.league.name} · Outdraft`;
  }, [state]);

  if (state.kind === "loading") return <p className="status" role="status">Loading League {id}…</p>;
  if (state.kind === "error")
    return (
      <div className="card status" role="alert">
        <p>{state.message}</p>
        {state.retry
          ? <button onClick={() => setAttempt((n) => n + 1)}>Try again</button>
          : <button onClick={() => navigate("/")}>Enter another League ID</button>}
      </div>
    );

  const { league, projections } = state;
  return (
    <>
      <LeagueHeader league={league} projections={projections} />
      {league.drafted ? (
        <>
          <SquadStrength league={league} />
          <LeagueTable league={league} />
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

function SquadStrength({ league }: { league: LeagueAnalysis }) {
  const [horizon, setHorizon] = useState<Horizon>(3);
  const available = league.gameweeks.length;
  const rows = useMemo(
    () => [...league.managers].sort((a, b) => b.strength[horizon] - a.strength[horizon]),
    [league, horizon],
  );
  const max = rows[0]?.strength[horizon] || 1;
  const min = Math.min(...rows.map((m) => m.strength[horizon]));
  const first = league.gameweeks[0];
  const last = league.gameweeks[Math.min(horizon, available) - 1];

  return (
    <section className="card" aria-labelledby="strength-h">
      <div className="title-row">
        <h2 id="strength-h">Squad strength</h2>
        <div className="segmented" role="radiogroup" aria-label="Gameweeks ahead">
          {HORIZONS.map((h) => (
            <button
              key={h}
              role="radio"
              aria-checked={h === horizon}
              className={h === horizon ? "on" : ""}
              onClick={() => setHorizon(h)}
            >
              {HORIZON_LABEL[h]}
            </button>
          ))}
        </div>
      </div>
      <p className="muted">
        Best XI Projections summed over GW{first}{last !== first ? `–${last}` : ""}, with today's Squads and
        optimal lineups. It shows each Squad's potential, not what its Manager will do.
      </p>
      <ol className="strength">
        {rows.map((m, i) => {
          // Bars start a little below the weakest Squad so differences are visible.
          const floor = Math.max(0, min - (max - min) * 0.5);
          const width = max > floor ? 8 + ((m.strength[horizon] - floor) / (max - floor)) * 92 : 100;
          return (
            <li key={m.entryId}>
              <span className="pos">{i + 1}</span>
              <div className="who">
                <span className="team">{m.teamName}</span>
                <span className="muted small">{m.managerName} · {ordinal(m.table.rank)} in table</span>
                <span className="bar" style={{ width: `${width}%` }} />
              </div>
              <span className="value">{pts(m.strength[horizon])}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function LeagueTable({ league }: { league: LeagueAnalysis }) {
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
                  <span className="team">{m.teamName}</span>
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

function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}
