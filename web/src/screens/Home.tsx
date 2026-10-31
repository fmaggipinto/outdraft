import { useState } from "react";
import { Link, navigate } from "../App";
import { Screen } from "../components/Screen";
import { claimManager } from "../claim";
import { fetchEntryPublic, fetchLeagueDetails, NotFoundError } from "../data";
import { findLeagues, type FoundLeague } from "../findLeague";
import { useRecent } from "../recent";

const ID = /^\d{1,9}$/;

export function Home() {
  const [recent, removeRecent] = useRecent();
  return (
    <Screen title="Find your League" kicker="League analysis for FPL Draft">
    <section className="home">
      <p className="lede">
        See who's really strongest in your Draft League: Squad strength for every Manager over the next 1, 3 or 6
        gameweeks, from xG-based Projections. No sign-in.
      </p>
      {recent.length > 0 && (
        <section className="card" aria-labelledby="recent-h">
          <h2 id="recent-h">Your Leagues</h2>
          <ul className="recent">
            {recent.map((l) => (
              <li key={l.id}>
                <Link to={`/league/${l.id}`}>{l.name}</Link>
                <button type="button" className="link muted" aria-label={`Remove ${l.name}`} onClick={() => removeRecent(l.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <p className="muted small">Remembered on this device only.</p>
        </section>
      )}
      <LeagueIdForm />
      <TeamIdForm />
    </section>
    </Screen>
  );
}

function LeagueIdForm() {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const open = (e: React.FormEvent) => {
    e.preventDefault();
    const id = value.trim();
    if (!ID.test(id)) return setError("A League ID is a number, like 12345.");
    navigate(`/league/${id}`);
  };
  return (
    <form onSubmit={open} className="card open-form" noValidate>
      <label htmlFor="league-id">League ID</label>
      <div className="row">
        <input id="league-id" inputMode="numeric" autoComplete="off" placeholder="e.g. 12345" value={value}
          onChange={(e) => { setValue(e.target.value); setError(""); }}
          aria-invalid={!!error} aria-describedby="league-help" />
        <button type="submit">Open League</button>
      </div>
      <p id="league-help" className={error ? "error" : "muted"}>
        {error || "Find it in the FPL Draft site's address bar on your League page: …/league/12345/…"}
      </p>
    </form>
  );
}

type Lookup =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "choose"; entryId: number; teamName: string; leagues: FoundLeague[] };

function TeamIdForm() {
  const [value, setValue] = useState("");
  const [state, setState] = useState<Lookup>({ kind: "idle" });

  const openAs = (leagueId: number, entryId: number) => {
    claimManager(leagueId, entryId);   // it's their own team, so claim it
    navigate(`/league/${leagueId}`);
  };

  const find = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = value.trim();
    if (!ID.test(id)) return setState({ kind: "error", message: "A team ID is a number, like 123456." });
    setState({ kind: "loading" });
    try {
      const { teamName, leagues } = await findLeagues(Number(id), { entry: fetchEntryPublic, details: fetchLeagueDetails });
      if (leagues.length === 1) return openAs(leagues[0].id, Number(id));
      if (!leagues.length) return setState({ kind: "error", message: `${teamName} isn't in a Draft League yet.` });
      setState({ kind: "choose", entryId: Number(id), teamName, leagues });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof NotFoundError
          ? `There's no FPL Draft team with ID ${id}.`
          : "Couldn't reach FPL Draft right now. Try again in a moment.",
      });
    }
  };

  return (
    <form onSubmit={find} className="card open-form" noValidate>
      <label htmlFor="team-id">Don't know your League ID? Use your team ID</label>
      <div className="row">
        <input id="team-id" inputMode="numeric" autoComplete="off" placeholder="e.g. 123456" value={value}
          onChange={(e) => { setValue(e.target.value); if (state.kind === "error") setState({ kind: "idle" }); }}
          aria-invalid={state.kind === "error"} aria-describedby="team-help" />
        <button type="submit" disabled={state.kind === "loading"}>{state.kind === "loading" ? "Finding…" : "Find my League"}</button>
      </div>
      <p id="team-help" className={state.kind === "error" ? "error" : "muted"} role={state.kind === "error" ? "alert" : undefined}>
        {state.kind === "error"
          ? state.message
          : "It's in the address on your team's Points page: …/entry/123456/…. We'll also mark you as that Manager."}
      </p>
      {state.kind === "choose" && (
        <div className="choose" role="group" aria-label="Choose a League">
          <p><b>{state.teamName}</b> is in {state.leagues.length} Leagues. Which one?</p>
          <ul className="recent">
            {state.leagues.map((l) => (
              <li key={l.id}>
                <button type="button" className="link" onClick={() => openAs(l.id, state.entryId)}>{l.name}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
