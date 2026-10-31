import { describe, expect, it } from "vitest";
import classicDetails from "../../tests/fixtures/classic-details.json";
import classicStatus from "../../tests/fixtures/classic-element-status.json";
import classicTransactions from "../../tests/fixtures/classic-transactions.json";
import gameJson from "../../tests/fixtures/game.json";
import projectionsJson from "../../tests/fixtures/projections.json";
import type { ElementStatus, Game, LeagueDetails, Projections, Transactions } from "../types";
import { analyseLeague } from "./league";
import { isProtected, lockedOnWaivers, waiverPhase, waiverTargets } from "./waivers";

const projections = projectionsJson as unknown as Projections;
const status = classicStatus as ElementStatus;
const details = classicDetails as LeagueDetails;
const transactions = classicTransactions as Transactions;
const game = gameJson as Game;   // recorded during GW9: next is GW10, waivers not processed
const league = analyseLeague(details, status, projections);
const players = new Map(projections.players.map((p) => [p.id, p]));
const gw10 = projections.events.find((e) => e.gameweek === 10)!;
const waiversDeadline = Date.parse(gw10.waivers_deadline!);

describe("waiverPhase", () => {
  it("is waivers before the Waiver deadline", () => {
    expect(waiverPhase(game, projections, waiversDeadline - 60_000)).toBe("waivers");
  });
  it("is processing after the deadline until FPL processes claims", () => {
    expect(waiverPhase({ ...game, waivers_processed: false }, projections, waiversDeadline + 60_000)).toBe("processing");
  });
  it("is free agency once waivers are processed", () => {
    expect(waiverPhase({ ...game, waivers_processed: true }, projections, waiversDeadline + 60_000)).toBe("free");
  });
});

describe("lockedOnWaivers", () => {
  const free = status.element_status.filter((e) => e.owner == null).map((e) => e.element);
  const owner = details.league_entries[0].entry_id;

  it("locks Players dropped for the coming gameweek, but not ones re-signed or from older gameweeks", () => {
    const [dropped, oldDrop] = free;
    const owned = status.element_status.find((e) => e.owner != null)!.element;
    const t: Transactions = { transactions: [
      { element_in: 1, element_out: dropped, entry: owner, event: 10, kind: "w", result: "a" },
      { element_in: 1, element_out: oldDrop, entry: owner, event: 9, kind: "w", result: "a" },
      { element_in: 1, element_out: owned, entry: owner, event: 10, kind: "f", result: "a" },
      { element_in: 1, element_out: free[2], entry: owner, event: 10, kind: "w", result: "r" },
    ] };
    expect([...lockedOnWaivers(status, t, 10)]).toEqual([dropped]);
  });

  it("locks Players FPL marks as on waivers", () => {
    const s = { element_status: status.element_status.map((e) => (e.element === free[0] ? { ...e, status: "w" } : e)) };
    expect(lockedOnWaivers(s, null, 10).has(free[0])).toBe(true);
  });

  it("reads the recorded League's transactions without error", () => {
    expect(lockedOnWaivers(status, transactions, game.next_event)).toBeInstanceOf(Set);
  });
});

describe.each(league.managers.map((m) => [m.teamName, m] as const))("Waiver targets for %s", (_, manager) => {
  const targets = waiverTargets({ manager, status, projections, locked: new Set(), phase: "waivers" });

  it("gains exactly the Squad strength difference the League analysis computes", () => {
    for (const t of targets.slice(0, 3)) {
      const swapped = {
        element_status: status.element_status.map((e) =>
          e.element === t.out.id ? { ...e, owner: null } : e.element === t.in.id ? { ...e, owner: manager.entryId } : e),
      };
      const after = analyseLeague(details, swapped, projections).managers.find((m) => m.entryId === manager.entryId)!;
      expect(t.gain).toBeCloseTo(after.strength[3] - manager.strength[3], 6);
    }
  });

  it("only offers unowned Players for a same-position, non-protected drop, best first", () => {
    const owned = new Set(status.element_status.filter((e) => e.owner != null).map((e) => e.element));
    for (const t of targets) {
      expect(owned.has(t.in.id)).toBe(false);
      expect(manager.squad).toContain(t.out.id);
      expect(t.in.position).toBe(t.out.position);
      expect(isProtected(t.out, projections.based_on_gameweek)).toBe(false);
      expect(t.gain).toBeGreaterThanOrEqual(0.5);
    }
    expect(targets.map((t) => t.gain)).toEqual([...targets.map((t) => t.gain)].sort((a, b) => b - a));
  });
});

it("finds Waiver targets for most Managers in a real League", () => {
  const withTargets = league.managers.filter((manager) =>
    waiverTargets({ manager, status, projections, locked: new Set(), phase: "waivers" }).length > 0);
  expect(withTargets.length).toBeGreaterThan(4);
});

it("protects consistent scorers and top draft picks", () => {
  const p = projections.players[0];
  expect(isProtected({ ...p, points_avg_capped: 5, draft_rank: 300 }, 8)).toBe(true);
  expect(isProtected({ ...p, points_avg_capped: 2, draft_rank: 12 }, 8)).toBe(true);
  expect(isProtected({ ...p, points_avg_capped: 2, draft_rank: 300 }, 8)).toBe(false);
  // Older Projections files without the capped average fall back to points per gameweek.
  expect(isProtected({ ...p, points_avg_capped: undefined, total_points: 40, draft_rank: 300 }, 8)).toBe(true);
});

it("never offers a locked Player as a Free agent signing, but lets it be claimed", () => {
  const manager = league.managers[0];
  const open = waiverTargets({ manager, status, projections, locked: new Set(), phase: "waivers" });
  expect(open.length).toBeGreaterThan(0);
  const locked = new Set([open[0].in.id]);

  const claims = waiverTargets({ manager, status, projections, locked, phase: "waivers" });
  expect(claims.find((t) => t.in.id === open[0].in.id)?.claimOnly).toBe(true);

  const signings = waiverTargets({ manager, status, projections, locked, phase: "free" });
  expect(signings.some((t) => t.in.id === open[0].in.id)).toBe(false);
  expect(signings.every((t) => !t.claimOnly)).toBe(true);
  expect(players.has(open[0].in.id)).toBe(true);
});
