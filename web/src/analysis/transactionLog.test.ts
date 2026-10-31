import { describe, expect, it } from "vitest";
import classicDetails from "../../tests/fixtures/classic-details.json";
import classicStatus from "../../tests/fixtures/classic-element-status.json";
import classicTransactions from "../../tests/fixtures/classic-transactions.json";
import projectionsJson from "../../tests/fixtures/projections.json";
import type { ElementStatus, LeagueDetails, Projections, Transactions } from "../types";
import { analyseLeague } from "./league";
import { transactionLog, type Trades } from "./transactionLog";

const projections = projectionsJson as unknown as Projections;
const league = analyseLeague(classicDetails as LeagueDetails, classicStatus as ElementStatus, projections);
const transactions = classicTransactions as Transactions;
const [a, b] = league.managers;
const [p1, p2, p3, p4] = projections.players;

describe("transactionLog", () => {
  const log = transactionLog({ managers: league.managers, players: projections.players, transactions, trades: null });

  it("lists every accepted waiver and free-agent move from the recorded League", () => {
    const accepted = transactions.transactions.filter((t) => t.result === "a");
    expect(log).toHaveLength(accepted.length);
    expect(log.filter((e) => e.kind === "waiver").length).toBe(accepted.filter((t) => t.kind === "w").length);
  });

  it("is newest first", () => {
    const gws = log.map((e) => e.gameweek);
    expect(gws).toEqual([...gws].sort((x, y) => y - x));
  });

  it("leaves out rejected moves", () => {
    const t: Transactions = { transactions: [{ element_in: p1.id, element_out: p2.id, entry: a.entryId, event: 9, kind: "w", result: "r" }] };
    expect(transactionLog({ managers: league.managers, players: projections.players, transactions: t, trades: null })).toEqual([]);
  });

  it("shows accepted Trades from the offering Manager's side, and leaves out declined ones", () => {
    const trades: Trades = { trades: [
      { event: 9, offered_entry: a.entryId, received_entry: b.entryId, state: "p", response_time: "2026-10-30T10:00:00Z", offer_time: "2026-10-29T10:00:00Z",
        tradeitem_set: [{ element_in: p1.id, element_out: p2.id }, { element_in: p3.id, element_out: p4.id }] },
      { event: 9, offered_entry: b.entryId, received_entry: a.entryId, state: "r", response_time: null, offer_time: "2026-10-29T11:00:00Z",
        tradeitem_set: [{ element_in: p1.id, element_out: p2.id }] },
    ] };
    const t = transactionLog({ managers: league.managers, players: projections.players, transactions: null, trades });
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ kind: "trade", manager: a, with: b });
    expect(t[0].in.map((p) => p!.id)).toEqual([p1.id, p3.id]);
    expect(t[0].out.map((p) => p!.id)).toEqual([p2.id, p4.id]);
  });
});
