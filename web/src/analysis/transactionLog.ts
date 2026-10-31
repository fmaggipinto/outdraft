import type { ProjectedPlayer, Transactions } from "../types";
import type { ManagerAnalysis } from "./league";

/** draft/league/{id}/trades */
export interface Trades {
  trades: {
    event: number;
    offered_entry: number;
    received_entry: number;
    state: string;   // "a" accepted, "p" processed; others were declined or withdrawn
    response_time: string | null;
    offer_time: string;
    tradeitem_set: { element_in: number; element_out: number }[];
  }[];
}

export interface LogEntry {
  gameweek: number;
  kind: "waiver" | "free" | "trade";
  /** Entry id of the Manager making the move (for a Trade, the one who offered). */
  manager: ManagerAnalysis;
  /** For a Trade: the Manager who accepted. */
  with?: ManagerAnalysis;
  /** Players the Manager gained and gave up. */
  in: (ProjectedPlayer | null)[];
  out: (ProjectedPlayer | null)[];
  at: string;
}

const ACCEPTED_TRADE = new Set(["a", "p"]);

/** The League's accepted waiver claims, free-agent moves and Trades, newest first. */
export function transactionLog(opts: {
  managers: ManagerAnalysis[];
  players: ProjectedPlayer[];
  transactions: Transactions | null;
  trades: Trades | null;
}): LogEntry[] {
  const managers = new Map(opts.managers.map((m) => [m.entryId, m]));
  const players = new Map(opts.players.map((p) => [p.id, p]));
  const player = (id: number) => players.get(id) ?? null;
  const out: LogEntry[] = [];

  for (const t of opts.transactions?.transactions ?? []) {
    const manager = managers.get(t.entry);
    if (t.result !== "a" || !manager) continue;
    out.push({
      gameweek: t.event, kind: t.kind === "w" ? "waiver" : "free", manager,
      in: [player(t.element_in)], out: [player(t.element_out)], at: (t as { added?: string }).added ?? "",
    });
  }
  for (const t of opts.trades?.trades ?? []) {
    const manager = managers.get(t.offered_entry), other = managers.get(t.received_entry);
    if (!ACCEPTED_TRADE.has(t.state) || !manager || !other) continue;
    // The offering Manager receives each item's element_in and gives its element_out.
    out.push({
      gameweek: t.event, kind: "trade", manager, with: other,
      in: t.tradeitem_set.map((i) => player(i.element_in)),
      out: t.tradeitem_set.map((i) => player(i.element_out)),
      at: t.response_time ?? t.offer_time,
    });
  }
  return out.sort((a, b) => b.gameweek - a.gameweek || b.at.localeCompare(a.at));
}
