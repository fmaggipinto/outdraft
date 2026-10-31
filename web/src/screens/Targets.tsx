import { useEffect, useMemo, useRef, useState } from "react";
import type { LeagueAnalysis, ManagerAnalysis } from "../analysis/league";
import {
  bestXIAfterSwap, isProtected, lockedOnWaivers, rivalInterest, TARGET_HORIZON, waiverPhase, waiverTargets, type Phase, type Rival, type WaiverTarget,
} from "../analysis/waivers";
import { useClaim } from "../claim";
import { ClaimCard, YouTag } from "../components/ClaimCard";
import { FreeAgentBrowser } from "../components/FreeAgentBrowser";
import { PlayerTags, PlayerTagsProvider } from "../components/PlayerTags";
import { CompareTable, PlayerCompare } from "../components/PlayerCompare";
import { Screen } from "../components/Screen";
import { fetchGame, fetchTransactions } from "../data";
import { ordinal, pts, relative, when } from "../format";
import { gwRange } from "../horizon";
import type { ElementStatus, Game, Projections, Transactions } from "../types";
import { LeagueStatus, useLeague } from "../useLeague";

const POS = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" } as const;
const SHOWN = 10;

type Extra = { kind: "loading" } | { kind: "error" } | { kind: "ready"; game: Game; transactions: Transactions | null };

/** The Targets tab: Waiver targets with Rival interest, the Waiver order, Free agents and comparison. */
export function Targets({ id }: { id: number }) {
  const [state, retry] = useLeague(id);
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
    if (state.kind === "ready") document.title = `Targets · ${state.league.name} · Outdraft`;
  }, [state]);

  if (state.kind !== "ready") return <LeagueStatus id={id} state={state} retry={retry} tab="targets" title="Targets" />;
  const { league, projections, status } = state;
  const manager = league.managers.find((m) => m.entryId === claim);

  return (
    <Screen title="Targets" kicker={league.name} projections={projections} league={{ id, tab: "targets", trades: league.trades }}>
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
    </Screen>
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
  const [compare, setCompare] = useState<[number | null, number | null] | null>(null);
  const compareRef = useRef<HTMLElement>(null);
  const [openTarget, setOpenTarget] = useState<number | null>(null);
  const targets = useMemo(
    () => (manager ? waiverTargets({ manager, status, projections, locked, phase }) : []),
    [manager, status, projections, locked, phase],
  );
  const rivals = useMemo(
    () => (manager
      ? rivalInterest({ me: manager, managers: league.managers, status, projections, playerIds: targets.slice(0, SHOWN).map((t) => t.in.id) })
      : new Map<number, Rival[]>()),
    [manager, league, status, projections, targets],
  );
  // Compare your top Waiver target with the Player he'd replace, until you pick others.
  const compareIds: [number | null, number | null] = compare ?? (targets[0] ? [targets[0].in.id, targets[0].out.id] : [null, null]);
  const compareWith = (id: number) => {
    setCompare([id, targets.find((t) => t.in.id === id)?.out.id ?? compareIds[1] ?? compareIds[0]]);
    compareRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const event = projections.events.find((e) => e.gameweek === nextGw) ?? projections.events[0];
  const short = new Map(projections.teams.map((t) => [t.id, t.short_name]));
  const gws = gwRange(projections.gameweeks.slice(0, TARGET_HORIZON));
  // Tags on every Player here: claim only from this phase and lock list, and
  // protected for the Claimed Manager's Players the Waiver rules never drop.
  const tagContext = useMemo(() => {
    const players = new Map(projections.players.map((p) => [p.id, p]));
    const protectedIds = new Set((manager?.squad ?? []).filter((id) => {
      const p = players.get(id);
      return p && isProtected(p, projections.based_on_gameweek);
    }));
    return { phase, locked, protectedIds };
  }, [phase, locked, manager, projections]);

  return (
    <PlayerTagsProvider value={tagContext}>
      <PhaseBanner phase={phase} event={event} />
      {!manager ? (
        <>
          <ClaimCard league={league} me={null} setClaim={setClaim} />
          <p className="muted">Claim your Manager to see your Waiver targets.</p>
        </>
      ) : (
        <section className="card" aria-labelledby="targets-h">
          <h2 id="targets-h">{phase === "free" ? "Free-agent targets" : "Waiver targets"}</h2>
          <p className="muted">
            For <b>{manager.teamName}</b>: each swap is ranked by how much it raises your Squad strength over {gws}.
            {phase !== "free" && " Lower targets are backups if earlier ones are taken."}
          </p>
          {targets.length ? (
            <ol className="targets">
              {targets.slice(0, SHOWN).map((t, i) => (
                <Target key={t.in.id} rank={i + 1} t={t} short={short} phase={phase} rivals={rivals.get(t.in.id) ?? []}
                  open={openTarget === t.in.id} onToggle={() => setOpenTarget(openTarget === t.in.id ? null : t.in.id)}
                  manager={manager} projections={projections} />
              ))}
            </ol>
          ) : (
            <p>No clear upgrades right now: no Free agent raises your Squad strength by at least 0.5.</p>
          )}
          <p className="muted small">
            Rival interest shows which other Managers would gain most from each Player, and whether they're ahead
            of you in the Waiver order. "Contested" means a Manager ahead of you would gain at least as much. It
            estimates who should want a Player, not who will claim him.
          </p>
          <p className="muted small">
            Players averaging 4.5+ points or drafted in the top 40 are never suggested as drops. Check the news before
            dropping anyone.{!transactionsKnown && " Recent drops couldn't be loaded, so a just-dropped Player may show as free."}
          </p>
        </section>
      )}
      <WaiverOrder league={league} me={manager?.entryId ?? null} />
      <FreeAgentBrowser status={status} projections={projections} onCompare={compareWith} />
      <PlayerCompare ref={compareRef} league={league} status={status} projections={projections} ids={compareIds} setIds={setCompare} />
    </PlayerTagsProvider>
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

function Target({ rank, t, short, phase, rivals, open, onToggle, manager, projections }: {
  rank: number; t: WaiverTarget; short: Map<number, string>; phase: Phase; rivals: Rival[];
  open: boolean; onToggle: () => void; manager: ManagerAnalysis; projections: Projections;
}) {
  const panel = `target-${t.in.id}`;
  const verb = phase === "free" ? "Sign" : "Claim";
  const order = phase !== "free";   // the Waiver order only matters until waivers are processed
  // Contested: a Manager ahead of you in the Waiver order would gain at least as much as you.
  const contested = order && rivals.some((r) => r.ahead && r.gain >= t.gain);
  return (
    <li>
      <span className="pos">{rank}</span>
      <div className="who">
        <span>
          <span className="muted small">{verb} </span>
          <span className="team">{t.in.name}</span>{" "}
          <span className="muted small">{POS[t.in.position]} · {short.get(t.in.team)}</span>
          {contested && <span className="tag bad">Contested</span>}
          <PlayerTags p={t.in} />
        </span>
        <span>
          <span className="muted small">for </span>
          <span>{t.out.name}</span>
          <PlayerTags p={t.out} />
        </span>
        <span className="muted small proj">
          {t.in.projections.slice(0, TARGET_HORIZON).map(pts).join(" · ")}
          {" vs "}
          {t.out.projections.slice(0, TARGET_HORIZON).map(pts).join(" · ")}
        </span>
        <span className="rivals small">
          {rivals.length ? (
            <>
              <span className="muted">Rival interest: </span>
              {rivals.slice(0, 3).map((r, i) => (
                <span key={r.manager.entryId}>
                  {i > 0 && <span className="muted"> · </span>}
                  <span className={order && r.ahead ? "ahead" : undefined}>
                    {r.manager.teamName} +{pts(r.gain)}{order && (r.ahead ? " (ahead of you)" : " (behind you)")}
                  </span>
                </span>
              ))}
              {rivals.length > 3 && <span className="muted"> and {rivals.length - 3} more</span>}
            </>
          ) : (
            <span className="muted">No rival would gain much from him.</span>
          )}
        </span>
        <button type="button" className="link compare-toggle" aria-expanded={open} aria-controls={panel} onClick={onToggle}>
          {open ? "Hide comparison" : `Compare with ${t.out.name}`}
        </button>
      </div>
      <span className="gain">+{pts(t.gain)}</span>
      {open && <TargetComparison id={panel} t={t} manager={manager} projections={projections} short={short} />}
    </li>
  );
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

/** A Waiver target side by side with the Player you'd drop, and your Best XI
 * for the next gameweek after the swap (docs/design.md §4). */
function TargetComparison({ id, t, manager, projections, short }: {
  id: string; t: WaiverTarget; manager: ManagerAnalysis; projections: Projections; short: Map<number, string>;
}) {
  const players = new Map(projections.players.map((p) => [p.id, p]));
  const xi = bestXIAfterSwap(manager, t.out.id, t.in.id, projections)
    .map((pid) => players.get(pid)!)
    .sort((a, b) => a.position - b.position || b.projections[0] - a.projections[0]);
  return (
    <div className="target-compare" id={id}>
      <CompareTable a={t.in} b={t.out} projections={projections}
        sub={(p) => (p.id === t.in.id ? `${POS[p.position]} · ${short.get(p.team)} · in` : `${POS[p.position]} · ${short.get(p.team)} · out`)} />
      <h3 className="label xi-title">Your GW{projections.gameweeks[0]} Best XI after the swap</h3>
      <ul className="xi-chips" aria-label="Best XI after the swap">
        {xi.map((p) => (
          <li key={p.id} className={p.id === t.in.id ? "new" : undefined}>
            {p.name}{p.id === t.in.id && <span className="sr-only"> (new)</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
