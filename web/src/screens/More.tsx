import { useEffect, useState } from "react";
import { Link } from "../App";
import { useClaim } from "../claim";
import { CalendarLinks } from "../components/CalendarLinks";
import { ClaimCard } from "../components/ClaimCard";
import { Screen } from "../components/Screen";
import { useRecent } from "../recent";
import { LeagueStatus, useLeague } from "../useLeague";
import { FixtureTicker } from "./Fixtures";

/** The More tab: Fixture ticker, Model check, deadlines calendar and settings. */
export function More({ id }: { id: number }) {
  const [state, retry] = useLeague(id);
  const [claim, setClaim] = useClaim(id);
  const [recent] = useRecent();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (state.kind === "ready") document.title = `More · ${state.league.name} · Outdraft`;
  }, [state]);

  if (state.kind !== "ready") return <LeagueStatus id={id} state={state} retry={retry} tab="more" title="More" />;
  const { league, projections } = state;
  const me = league.managers.find((m) => m.entryId === claim)?.entryId ?? null;
  const leagueUrl = `${location.origin}/league/${id}`;
  const share = async () => {
    if (navigator.share) await navigator.share({ title: league.name, url: leagueUrl }).catch(() => {});
    else {
      await navigator.clipboard?.writeText(leagueUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Screen title="More" kicker={league.name} projections={projections} league={{ id, tab: "more", trades: league.trades }}>
      {/* With Trades off, Fixtures has its own tab instead. */}
      {league.trades && <FixtureTicker projections={projections} />}

      <section aria-labelledby="model-h">
        <div className="section-head">
          <h2 id="model-h">Model check</h2>
        </div>
        <div className="card">
          <p>
            How each gameweek's frozen Snapshot compared with the points Players actually scored. It starts once the
            first Snapshot gameweek has finished.
          </p>
        </div>
      </section>

      <section aria-labelledby="calendar-h">
        <div className="section-head">
          <h2 id="calendar-h">Deadlines calendar</h2>
        </div>
        <div className="card">
          <p className="muted small">Waiver and Gameweek deadlines in your calendar, with a reminder 2 hours before.</p>
          <CalendarLinks />
        </div>
      </section>

      <section aria-labelledby="settings-h">
        <div className="section-head">
          <h2 id="settings-h">Settings</h2>
        </div>
        {league.drafted && <ClaimCard league={league} me={me} setClaim={setClaim} />}
        <div className="card">
          <div className="title-row">
            <h2 className="label" style={{ fontSize: 15 }}>This League</h2>
            <button type="button" className="ghost" onClick={share}>{copied ? "Link copied" : "Share"}</button>
          </div>
          <h3 className="label" style={{ fontSize: 15, marginTop: 12 }}>Switch League</h3>
          <ul className="recent">
            {recent.filter((l) => l.id !== id).map((l) => (
              <li key={l.id}><Link to={`/league/${l.id}`}>{l.name}</Link></li>
            ))}
            <li><Link to="/">Open another League</Link></li>
          </ul>
        </div>
      </section>
    </Screen>
  );
}
