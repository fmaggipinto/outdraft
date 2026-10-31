import { useEffect, useMemo, useState } from "react";
import type { LeagueAnalysis } from "../analysis/league";
import { transactionLog, type Trades } from "../analysis/transactionLog";
import { fetchTrades, fetchTransactions } from "../data";
import type { ProjectedPlayer, Projections, Transactions } from "../types";
import { YouTag } from "./ClaimCard";

type Load = { kind: "loading" } | { kind: "error" } | { kind: "ready"; transactions: Transactions | null; trades: Trades | null };

const PAGE = 20;
const KIND = { waiver: "Waiver", free: "Free agent", trade: "Trade" } as const;

/** League › Season: waiver claims, free-agent moves and Trades, newest first. */
export function TransactionLog({ league, projections, me }: { league: LeagueAnalysis; projections: Projections; me: number | null }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    let live = true;
    // Either list alone is still worth showing.
    Promise.all([fetchTransactions(league.id).catch(() => null), fetchTrades(league.id).catch(() => null)])
      .then(([transactions, trades]) => live && setLoad(transactions || trades ? { kind: "ready", transactions, trades } : { kind: "error" }));
    return () => { live = false; };
  }, [league.id]);

  const log = useMemo(() => (load.kind === "ready"
    ? transactionLog({ managers: league.managers, players: projections.players, transactions: load.transactions, trades: load.trades })
    : []), [load, league, projections]);
  const names = (ps: (ProjectedPlayer | null)[]) => ps.map((p) => p?.name ?? "a Player no longer listed").join(", ");

  return (
    <section aria-labelledby="log-h">
      <div className="section-head">
        <h2 id="log-h">Transaction log</h2>
        {load.kind === "ready" && <span className="note">{log.length} moves</span>}
      </div>
      <div className="card">
        {load.kind === "loading" ? (
          <p className="muted" role="status">Loading transactions…</p>
        ) : load.kind === "error" ? (
          <p className="muted" role="status">Couldn't load the League's transactions right now.</p>
        ) : !log.length ? (
          <p className="muted">No waiver claims, free-agent moves or Trades yet.</p>
        ) : (
          <>
            <ol className="log">
              {log.slice(0, limit).map((e, i) => {
                const mine = e.manager.entryId === me || e.with?.entryId === me;
                return (
                  <li key={i} className={mine ? "me" : undefined}>
                    <p className="log-head">
                      <span className="gw">GW{e.gameweek}</span>
                      <span className="team">{e.manager.teamName}</span> <YouTag show={e.manager.entryId === me} />
                      {e.with && <> <span className="muted">with</span> <span className="team">{e.with.teamName}</span> <YouTag show={e.with.entryId === me} /></>}
                      <span className={`tag kind-${e.kind}`}>{KIND[e.kind]}</span>
                    </p>
                    <p className="log-move small">
                      <span className="in"><span aria-hidden="true">+ </span><span className="sr-only">In: </span>{names(e.in)}</span>
                      <span className="out"><span aria-hidden="true">− </span><span className="sr-only">Out: </span>{names(e.out)}</span>
                    </p>
                  </li>
                );
              })}
            </ol>
            {log.length > limit && (
              <button type="button" className="ghost" onClick={() => setLimit((n) => n + PAGE)}>Show more ({log.length - limit} left)</button>
            )}
            <p className="muted small">For Trades, "+" is what the Manager who offered received.</p>
          </>
        )}
      </div>
    </section>
  );
}
