import { useEffect, useMemo, useState } from "react";
import { easeColour, fixtureTicker, type TickerMode } from "../analysis/ticker";
import { LeagueTabs } from "../components/LeagueTabs";
import { useHorizon } from "../horizon";
import { LeagueStatus, useLeague } from "../useLeague";

function useDark() {
  const query = "(prefers-color-scheme: dark)";
  const [dark, setDark] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const update = () => setDark(m.matches);
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  return dark;
}

export function Fixtures({ id }: { id: number }) {
  const [state, retry] = useLeague(id);
  const [horizon] = useHorizon();
  const [mode, setMode] = useState<TickerMode>("attack");
  const dark = useDark();
  const rows = useMemo(() => (state.kind === "ready" ? fixtureTicker(state.projections, mode) : []), [state, mode]);

  useEffect(() => {
    if (state.kind === "ready") document.title = `Fixtures · ${state.league.name} · Outdraft`;
  }, [state]);

  if (state.kind !== "ready") return <LeagueStatus id={id} state={state} retry={retry} />;
  const { league, projections } = state;
  const rated = projections.fixtures.some((f) => f.home_attack != null);

  return (
    <>
      <section className="league-head">
        <h1>{league.name}</h1>
      </section>
      <LeagueTabs league={league} active="fixtures" horizon={horizon} />
      <section className="card" aria-labelledby="ticker-h">
        <div className="title-row">
          <h2 id="ticker-h">Fixture ticker</h2>
          <div className="segmented" role="radiogroup" aria-label="Difficulty for">
            {(["attack", "defence"] as const).map((m) => (
              <button key={m} role="radio" aria-checked={m === mode} className={m === mode ? "on" : ""} onClick={() => setMode(m)}>
                {m === "attack" ? "For attackers" : "For defenders"}
              </button>
            ))}
          </div>
        </div>
        <p className="muted small">
          Green is easy, red is hard, judged on this season's expected goals: the opponent's{" "}
          {mode === "attack" ? <b>defence</b> : <b>attack</b>}, adjusted for home and away. Capitals are home games.
          Clubs are sorted by easiest run; a double gameweek counts twice and a blank is grey.
        </p>
        {!rated && <p className="muted small">Difficulty colours appear after the next Model update.</p>}
        <div className="scroll">
          <table className="ticker">
            <thead>
              <tr>
                <th scope="col" className="left club">Club</th>
                {projections.gameweeks.map((gw) => <th key={gw} scope="col">GW{gw}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.team.id}>
                  <th scope="row" className="left club" title={r.team.name}>{r.team.short_name}</th>
                  {r.gameweeks.map((fixtures, i) => (
                    <td key={i} className={fixtures.length ? (fixtures.length > 1 ? "double" : "") : "blank"}>
                      {fixtures.length ? fixtures.map((f, j) => (
                        <span key={j} className="fx" style={{ background: easeColour(f.ease, dark) }}
                          title={`${f.home ? "Home" : "Away"} v ${f.opponent}: ${f.ease.toFixed(2)}× average`}>
                          {f.home ? f.opponent.toUpperCase() : f.opponent.toLowerCase()}
                        </span>
                      )) : <span className="fx">–</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
