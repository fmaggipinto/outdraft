import { useEffect, useMemo, useState } from "react";
import type { LeagueAnalysis } from "../analysis/league";
import { forecastMatchups, type MatchupForecast, type SideForecast } from "../analysis/matchups";
import { fetchDistributions, NotFoundError } from "../data";
import { pts } from "../format";
import type { Distributions } from "../types";
import { YouTag } from "./ClaimCard";

type DistState = { kind: "loading" } | { kind: "missing" } | { kind: "error" } | { kind: "ready"; dists: Distributions };

const pct = (x: number) => (x > 0 && x < 0.005 ? "<1%" : `${Math.round(x * 100)}%`);
const isMine = (f: MatchupForecast, me: number | null) => me != null && (f.matchup.home === me || f.matchup.away === me);

/** This gameweek's Head-to-head Matchups with Win probability (League tab). */
export function MatchupsSection({ league, me }: { league: LeagueAnalysis; me: number | null }) {
  const [dist, setDist] = useState<DistState>({ kind: "loading" });

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

  const forecasts = useMemo(() => (dist.kind === "ready" ? forecastMatchups(league, dist.dists) : []), [league, dist]);
  const gameweek = forecasts[0]?.matchup.gameweek;
  const list = forecasts
    .filter((f) => f.matchup.gameweek === gameweek)
    .sort((a, b) => Number(isMine(b, me)) - Number(isMine(a, me)));

  return (
    <section aria-labelledby="matchups-h">
      <div className="section-head">
        <h2 id="matchups-h">{gameweek ? `GW${gameweek} Matchups` : "Matchups"}</h2>
        <span className="note">Win probability</span>
      </div>
      {dist.kind === "loading" ? (
        <p className="muted" role="status">Loading Matchups…</p>
      ) : dist.kind !== "ready" ? (
        <p className="muted" role="status">
          {dist.kind === "missing"
            ? "Win probabilities appear after the next Model update, usually within the hour."
            : "Couldn't load Win probabilities right now."}
        </p>
      ) : !list.length ? (
        <p className="muted">No upcoming Matchups to forecast.</p>
      ) : (
        <>
          {list.map((f) => <MatchupCard key={`${f.matchup.home}-${f.matchup.away}`} f={f} me={me} />)}
          <p className="muted small">
            Assumes both Managers field their Best XI, using each Player's Score distribution. Players' scores are
            treated as independent, so real upsets are a little more likely than shown.
          </p>
        </>
      )}
    </section>
  );
}

function MatchupCard({ f, me }: { f: MatchupForecast; me: number | null }) {
  // The Claimed Manager's side comes first, so their win share is always blue
  // and their loss share orange (docs/design.md); otherwise home comes first.
  const [first, second] = f.away.manager.entryId === me ? [f.away, f.home] : [f.home, f.away];
  const draw = f.home.chances.draw;
  return (
    <article className={`card matchup${isMine(f, me) ? " mine" : ""}`} aria-label={`${f.home.manager.teamName} v ${f.away.manager.teamName}`}>
      <Side side={first} me={me} />
      <Side side={second} me={me} />
      <div className="wdl" aria-hidden="true">
        <span className="h" style={{ width: `${first.chances.win * 100}%` }} />
        <span className="d" style={{ width: `${draw * 100}%` }} />
        <span className="a" style={{ width: `${second.chances.win * 100}%` }} />
      </div>
      <p className="muted small wdl-text">
        {first.manager.teamName} {pct(first.chances.win)} · Draw {pct(draw)} · {second.manager.teamName} {pct(second.chances.win)}
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
