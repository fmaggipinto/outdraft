import { useEffect, useMemo, useState } from "react";
import type { LeagueAnalysis, ManagerAnalysis } from "../analysis/league";
import {
  lockedOnWaivers, TARGET_HORIZON, waiverPhase, waiverTargets, type Phase, type WaiverTarget,
} from "../analysis/waivers";
import { useClaim } from "../claim";
import { ClaimCard, YouTag } from "../components/ClaimCard";
import { LeagueTabs } from "../components/LeagueTabs";
import { fetchGame, fetchTransactions } from "../data";
import { ordinal, pts, relative, when } from "../format";
import { gwRange, useHorizon } from "../horizon";
import type { ElementStatus, Game, ProjectedPlayer, Projections, Transactions } from "../types";
import { LeagueStatus, useLeague } from "../useLeague";

const POS = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" } as const;
const SHOWN = 10;

type Extra = { kind: "loading" } | { kind: "error" } | { kind: "ready"; game: Game; transactions: Transactions | null };

export function Waivers({ id }: { id: number }) {
  const [state, retry] = useLeague(id);
  const [horizon] = useHorizon();
  const [claim, setClaim] = useClaim(id);
  const [extra, setExtra] = useState<Extra>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    // Transactions only sharpen which Players are locked; the screen works without them.
    Promise.all([fetchGame(), fetchTransactions(id).catch(() => null)])
      .then(([game, transactions]) => live && setExtra({ kind: "ready", game, transactions }))
      .catch((e) => {
        console.error("Loading FPL game state failed", e);
        if (live) setExtra({ kind: "error" });
      });
    return () => { live = false; };
  }, [id]);

  useEffect(() => {
    if (state.kind === "ready") document.title = `Waivers · ${state.league.name} · Outdraft`;
  }, [state]);

  if (state.kind !== "ready") return <LeagueStatus id={id} state={state} retry={retry} />;
  const { league, projections, status } = state;
  const manager = league.managers.find((m) => m.entryId === claim);

  return (
    <>
      <section className="league-head">
        <h1>{league.name}</h1>
      </section>
      <LeagueTabs league={league} active="waivers" horizon={horizon} />
      {!league.drafted ? (
        <div className="card" role="status"><p>{league.name} hasn't drafted yet.</p></div>
      ) : extra.kind === "loading" ? (
        <p className="status" role="status">Loading waivers…</p>
      ) : extra.kind === "error" ? (
        <div className="card status" role="alert">
          <p>Couldn't reach FPL Draft to check the waiver phase. Try again in a moment.</p>
          <button onClick={() => location.reload()}>Try again</button>
        </div>
      ) : (
        <WaiverView
          league={league} projections={projections} manager={manager} setClaim={setClaim}
          game={extra.game} transactions={extra.transactions} status={status}
        />
      )}
    </>
  );
}

function WaiverView({ league, projections, manager, setClaim, game, transactions, status }: {
  league: LeagueAnalysis;
  projections: Projections;
  manager: ManagerAnalysis | undefined;
  setClaim: (entryId: number | null) => void;
  game: Game;
  transactions: Transactions | null;
  status: ElementStatus;
}) {
  const nextGw = game.next_event;
  const transactionsKnown = transactions != null;
  const phase = waiverPhase(game, projections, Date.now());
  const locked = useMemo(() => lockedOnWaivers(status, transactions, nextGw), [status, transactions, nextGw]);
  const targets = useMemo(
    () => (manager ? waiverTargets({ manager, status, projections, locked, phase }) : []),
    [manager, status, projections, locked, phase],
  );
  const event = projections.events.find((e) => e.gameweek === nextGw) ?? projections.events[0];
  const short = new Map(projections.teams.map((t) => [t.id, t.short_name]));
  const gws = gwRange(projections.gameweeks.slice(0, TARGET_HORIZON));

  return (
    <>
      <PhaseBanner phase={phase} event={event} />
      {!manager ? (
        <>
          <ClaimCard league={league} me={null} setClaim={setClaim} />
          <p className="muted">Claim your Manager to see your Waiver targets.</p>
        </>
      ) : (
        <section className="card" aria-labelledby="targets-h">
          <h2 id="targets-h">{phase === "free" ? "Free agent targets" : "Waiver targets"}</h2>
          <p className="muted">
            For <b>{manager.teamName}</b>: each swap is ranked by how much it raises your Squad strength over {gws}.
            {phase !== "free" && " Lower targets are backups if earlier ones are taken."}
          </p>
          {targets.length ? (
            <ol className="targets">
              {targets.slice(0, SHOWN).map((t, i) => (
                <Target key={t.in.id} rank={i + 1} t={t} short={short} phase={phase} />
              ))}
            </ol>
          ) : (
            <p>No clear upgrades right now: no Free agent raises your Squad strength by at least 0.5.</p>
          )}
          <p className="muted small">
            Players averaging 4.5+ points or drafted in the top 40 are never suggested as drops. Check the news before
            dropping anyone.{!transactionsKnown && " Recent drops couldn't be loaded, so a just-dropped Player may show as free."}
          </p>
        </section>
      )}
      <WaiverOrder league={league} me={manager?.entryId ?? null} />
    </>
  );
}

function PhaseBanner({ phase, event }: { phase: Phase; event: Projections["events"][number] | undefined }) {
  if (!event) return null;
  const gw = `GW${event.gameweek}`;
  return (
    <section className={`card phase phase-${phase}`} aria-label="Waiver phase">
      {phase === "waivers" && event.waivers_deadline && (
        <p>
          <b>Waiver claims for {gw}</b> close {when(event.waivers_deadline)} ({relative(event.waivers_deadline)}).
          Claims are processed in Waiver order.
        </p>
      )}
      {phase === "processing" && (
        <p><b>The {gw} Waiver deadline has passed.</b> FPL is processing claims; free agency opens once it's done.</p>
      )}
      {phase === "free" && (
        <p>
          <b>Waivers for {gw} are done.</b> Free agents can be signed now, first come first served, until the
          Gameweek deadline {when(event.deadline)} ({relative(event.deadline)}).
        </p>
      )}
    </section>
  );
}

function Target({ rank, t, short, phase }: { rank: number; t: WaiverTarget; short: Map<number, string>; phase: Phase }) {
  const verb = phase === "free" ? "Sign" : "Claim";
  return (
    <li>
      <span className="pos">{rank}</span>
      <div className="who">
        <span>
          <span className="muted small">{verb} </span>
          <span className="team">{t.in.name}</span>{" "}
          <span className="muted small">{POS[t.in.position]} · {short.get(t.in.team)}</span>
          {t.claimOnly && phase !== "free" && <span className="tag warn">On waivers</span>}
          <StatusTag p={t.in} />
        </span>
        <span>
          <span className="muted small">for </span>
          <span>{t.out.name}</span>
          <StatusTag p={t.out} />
        </span>
        <span className="muted small proj">
          {t.in.projections.slice(0, TARGET_HORIZON).map(pts).join(" · ")}
          {" vs "}
          {t.out.projections.slice(0, TARGET_HORIZON).map(pts).join(" · ")}
        </span>
      </div>
      <span className="gain">+{pts(t.gain)}</span>
    </li>
  );
}

function StatusTag({ p }: { p: ProjectedPlayer }) {
  const text = { d: "Doubt", i: "Injured", s: "Suspended", u: "Unavailable", n: "Unavailable" }[p.status];
  return text ? <span className={`tag ${p.status === "d" ? "warn" : "bad"}`}>{text}</span> : null;
}

function WaiverOrder({ league, me }: { league: LeagueAnalysis; me: number | null }) {
  const order = [...league.managers].sort((a, b) => a.waiverPick - b.waiverPick);
  const mine = order.findIndex((m) => m.entryId === me);
  return (
    <section className="card" aria-labelledby="order-h">
      <h2 id="order-h">Waiver order</h2>
      <p className="muted">
        {mine >= 0 ? `You're ${ordinal(mine + 1)} of ${order.length}. ` : ""}
        The first Manager in the order gets a contested Player.
      </p>
      <ol className="order">
        {order.map((m) => (
          <li key={m.entryId} className={m.entryId === me ? "me" : undefined}>
            <span className="team">{m.teamName}</span> <YouTag show={m.entryId === me} />
            <span className="muted small"> {m.managerName}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
