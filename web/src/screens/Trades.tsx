import { useEffect, useMemo, useState } from "react";
import { winWinTrades, type Trade } from "../analysis/trades";
import { TARGET_HORIZON } from "../analysis/waivers";
import { useClaim } from "../claim";
import { ClaimCard } from "../components/ClaimCard";
import { Screen } from "../components/Screen";
import { pts } from "../format";
import { gwRange } from "../horizon";
import type { ProjectedPlayer } from "../types";
import { LeagueStatus, useLeague } from "../useLeague";

const POS = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" } as const;
const SHOWN = 15;
const PER_RIVAL = 3;   // in the All rivals view, so one rival's variations don't fill the list

export function Trades({ id }: { id: number }) {
  const [state, retry] = useLeague(id);
  const [claim, setClaim] = useClaim(id);
  const [rival, setRival] = useState<number | "all">("all");

  const manager = state.kind === "ready" ? state.league.managers.find((m) => m.entryId === claim) : undefined;
  const trades = useMemo(
    () => (state.kind === "ready" && manager ? winWinTrades(manager, state.league.managers, state.projections) : []),
    [state, manager],
  );

  useEffect(() => {
    if (state.kind === "ready") document.title = `Trades · ${state.league.name} · Outdraft`;
  }, [state]);

  if (state.kind !== "ready") return <LeagueStatus id={id} state={state} retry={retry} tab="trades" title="Trades" />;
  const { league, projections } = state;
  const short = new Map(projections.teams.map((t) => [t.id, t.short_name]));
  const perRival = new Map<number, number>();
  const shown = trades.filter((t) => {
    if (rival !== "all") return t.rival.entryId === rival;
    const n = (perRival.get(t.rival.entryId) ?? 0) + 1;
    perRival.set(t.rival.entryId, n);
    return n <= PER_RIVAL;
  });
  const rivals = league.managers.filter((m) => m.entryId !== manager?.entryId);

  return (
    <Screen title="Trades" kicker={league.name} projections={projections} league={{ id, tab: "trades", trades: league.trades }}>
      {!league.drafted ? (
        <div className="card" role="status"><p>{league.name} hasn't drafted yet.</p></div>
      ) : !manager ? (
        <>
          <ClaimCard league={league} me={null} setClaim={setClaim} />
          <p className="muted">Claim your Manager to see Win-win trades.</p>
        </>
      ) : (
        <section className="card" aria-labelledby="trades-h">
          <div className="title-row">
            <h2 id="trades-h">Win-win trades</h2>
            <select
              aria-label="Trade with"
              value={rival}
              onChange={(e) => setRival(e.target.value === "all" ? "all" : Number(e.target.value))}
            >
              <option value="all">All rivals</option>
              {rivals.map((m) => <option key={m.entryId} value={m.entryId}>{m.teamName}</option>)}
            </select>
          </div>
          <p className="muted">
            For <b>{manager.teamName}</b>: Trades that raise both your Squad strength and your rival's over{" "}
            {gwRange(projections.gameweeks.slice(0, TARGET_HORIZON))}, ranked by the smaller gain, so the fairest
            offers come first.
          </p>
          {shown.length ? (
            <ol className="trades">
              {shown.slice(0, SHOWN).map((t) => (
                <TradeCard key={`${t.rival.entryId}:${t.give.map((p) => p.id)}:${t.get.map((p) => p.id)}`} t={t} short={short} />
              ))}
            </ol>
          ) : (
            <p>
              No Win-win trades {rival === "all" ? "in this League" : "with this Manager"} right now: no swap raises
              both Squads by at least 0.5.
            </p>
          )}
          <p className="muted small">
            Players are swapped position for position, so both Squads keep a valid shape. 2-for-2 Trades only use
            the 8 Players each side would miss least. All rivals shows up to {PER_RIVAL} Trades per rival; pick one
            to see all of theirs. Both sides have to accept a Trade, so treat these as starting
            points for an offer.
          </p>
        </section>
      )}
    </Screen>
  );
}

function TradeCard({ t, short }: { t: Trade; short: Map<number, string> }) {
  const names = (ps: ProjectedPlayer[]) =>
    ps.map((p, i) => (
      <span key={p.id}>
        {i > 0 && " + "}
        <b>{p.name}</b> <span className="muted small">{POS[p.position]} · {short.get(p.team)}</span>
      </span>
    ));
  return (
    <li>
      <p className="with muted small">With <b>{t.rival.teamName}</b></p>
      <p><span className="muted small">You give </span>{names(t.give)}</p>
      <p><span className="muted small">You get </span>{names(t.get)}</p>
      <p className="gains">
        <span className="gain">You +{pts(t.myGain)}</span>
        <span className="muted"> · </span>
        <span className="their">{t.rival.teamName} +{pts(t.rivalGain)}</span>
      </p>
    </li>
  );
}
