import { useEffect, useMemo, useState } from "react";
import { navigate } from "../App";
import { forecastMatchups, type MatchupForecast, type SideForecast } from "../analysis/matchups";
import { useClaim } from "../claim";
import { YouTag } from "../components/ClaimCard";
import { LeagueTabs } from "../components/LeagueTabs";
import { fetchDistributions, NotFoundError } from "../data";
import { pts } from "../format";
import { useHorizon } from "../horizon";
import type { Distributions } from "../types";
import { LeagueStatus, useLeague } from "../useLeague";

type DistState = { kind: "loading" } | { kind: "missing" } | { kind: "error" } | { kind: "ready"; dists: Distributions };

const pct = (x: number) => (x > 0 && x < 0.005 ? "<1%" : `${Math.round(x * 100)}%`);

export function Matchups({ id }: { id: number }) {
  const [state, retry] = useLeague(id);
  const [horizon] = useHorizon();
  const [claim] = useClaim(id);
  const [dist, setDist] = useState<DistState>({ kind: "loading" });
  const [gw, setGw] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    fetchDistributions()
      .then((dists) => live && setDist({ kind: "ready", dists }))
      .catch((e) => {
        console.error("Loading Score distributions failed", e);
        if (live) setDist(e instanceof NotFoundError ? { kind: "missing" } : { kind: "error" });
      });
    return () => { live = false; };
  }, []);

  const forecasts = useMemo(
    () => (state.kind === "ready" && dist.kind === "ready" ? forecastMatchups(state.league, dist.dists) : []),
    [state, dist],
  );

  useEffect(() => {
    if (state.kind === "ready") document.title = `Matchups · ${state.league.name} · Outdraft`;
    // A Classic League has no Matchups.
    if (state.kind === "ready" && state.league.format !== "h2h") navigate(`/league/${id}`);
  }, [state, id]);

  if (state.kind !== "ready") return <LeagueStatus id={id} state={state} retry={retry} />;
  const { league } = state;
  const gameweeks = [...new Set(forecasts.map((f) => f.matchup.gameweek))];
  const shown = gw != null && gameweeks.includes(gw) ? gw : gameweeks[0];
  const me = league.managers.some((m) => m.entryId === claim) ? claim : null;
  const list = forecasts
    .filter((f) => f.matchup.gameweek === shown)
    .sort((a, b) => Number(isMine(b, me)) - Number(isMine(a, me)));

  return (
    <>
      <section className="league-head">
        <h1>{league.name}</h1>
      </section>
      <LeagueTabs league={league} active="matchups" horizon={horizon} />
      {dist.kind === "loading" ? (
        <p className="status" role="status">Loading Matchups…</p>
      ) : dist.kind !== "ready" ? (
        <div className="card status" role="alert">
          <p>
            {dist.kind === "missing"
              ? "Win probabilities appear after the next Model update, usually within the hour."
              : "Couldn't load Win probabilities right now."}
          </p>
          {dist.kind === "error" && <button onClick={() => location.reload()}>Try again</button>}
        </div>
      ) : !gameweeks.length ? (
        <div className="card" role="status"><p>No upcoming Matchups to forecast.</p></div>
      ) : (
        <>
          <div className="segmented gw-picker" role="radiogroup" aria-label="Gameweek">
            {gameweeks.map((g) => (
              <button key={g} role="radio" aria-checked={g === shown} className={g === shown ? "on" : ""} onClick={() => setGw(g)}>
                GW{g}
              </button>
            ))}
          </div>
          <section aria-label={`GW${shown} Matchups`}>
            {list.map((f) => <MatchupCard key={`${f.matchup.home}-${f.matchup.away}`} f={f} me={me} />)}
          </section>
          <p className="muted small">
            Win probability assumes both Managers field their Best XI, and comes from each Player's Score
            distribution. Players' scores are treated as independent, so real upsets are a little more likely than
            shown.
          </p>
        </>
      )}
    </>
  );
}

const isMine = (f: MatchupForecast, me: number | null) => me != null && (f.matchup.home === me || f.matchup.away === me);

function MatchupCard({ f, me }: { f: MatchupForecast; me: number | null }) {
  const draw = f.home.chances.draw;
  return (
    <article className={`card matchup${isMine(f, me) ? " mine" : ""}`} aria-label={`${f.home.manager.teamName} v ${f.away.manager.teamName}`}>
      <Side side={f.home} me={me} />
      <Side side={f.away} me={me} />
      <div className="wdl" aria-hidden="true">
        <span className="h" style={{ width: `${f.home.chances.win * 100}%` }} />
        <span className="d" style={{ width: `${draw * 100}%` }} />
        <span className="a" style={{ width: `${f.away.chances.win * 100}%` }} />
      </div>
      <p className="muted small wdl-text">
        {f.home.manager.teamName} {pct(f.home.chances.win)} · Draw {pct(draw)} · {f.away.manager.teamName} {pct(f.away.chances.win)}
      </p>
    </article>
  );
}

function Side({ side, me }: { side: SideForecast; me: number | null }) {
  return (
    <div className="side">
      <div className="who">
        <span className="team">{side.manager.teamName} <YouTag show={side.manager.entryId === me} /></span>
        <span className="muted small">Projected {pts(side.projected)} · likely {side.low}–{side.high}</span>
      </div>
      <span className="win" title="Win probability">{pct(side.chances.win)}</span>
    </div>
  );
}
