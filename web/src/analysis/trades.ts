import type { ProjectedPlayer, Projections } from "../types";
import { DRAFT_SQUAD_RULES } from "./bestXI";
import type { ManagerAnalysis } from "./league";
import { strengthOf, TARGET_HORIZON } from "./waivers";

const MIN_GAIN = 0.5;          // each side must gain at least this much Squad strength
const PAIR_CANDIDATES = 8;     // per side, Players considered for 2-for-2 Trades

export interface Trade {
  rival: ManagerAnalysis;
  give: ProjectedPlayer[];     // from the Claimed Manager
  get: ProjectedPlayer[];      // from the rival
  myGain: number;
  rivalGain: number;
}

/**
 * Win-win trades: 1-for-1 and 2-for-2 Trades between the Claimed Manager and
 * each rival that raise both Squads' strength over the next 3 gameweeks,
 * ranked by the smaller of the two gains.
 *
 * Players are only exchanged position for position, so both Squads keep the
 * Draft's 2/5/5/3 shape and can always field a valid Best XI. Every 1-for-1 is
 * tried; for 2-for-2 each side only offers the PAIR_CANDIDATES Players it would
 * miss least, which keeps the search fast on a phone.
 */
export function winWinTrades(me: ManagerAnalysis, managers: ManagerAnalysis[], projections: Projections): Trade[] {
  const rules = projections.squad_rules ?? DRAFT_SQUAD_RULES;
  const players = new Map(projections.players.map((p) => [p.id, p]));
  const horizon = Math.min(TARGET_HORIZON, projections.gameweeks.length);
  const strength = (ids: number[]) => strengthOf(ids, players, projections, horizon, rules);
  const known = (m: ManagerAnalysis) => m.squad.filter((id) => players.has(id));
  const pos = (id: number) => players.get(id)!.position;

  // The Players a Manager would miss least: the smallest drop in Squad strength without them.
  const cheapest = (squad: number[], base: number) =>
    squad
      .map((id) => ({ id, loss: base - strength(squad.filter((x) => x !== id)) }))
      .sort((a, b) => a.loss - b.loss || a.id - b.id)
      .slice(0, PAIR_CANDIDATES)
      .map((x) => x.id);

  const mine = known(me);
  const myBase = strength(mine);
  const myCheap = cheapest(mine, myBase);
  const trades: Trade[] = [];

  for (const rival of managers) {
    if (rival.entryId === me.entryId) continue;
    const theirs = known(rival);
    const theirBase = strength(theirs);

    const consider = (give: number[], get: number[]) => {
      const myGain = strength([...mine.filter((id) => !give.includes(id)), ...get]) - myBase;
      if (myGain < MIN_GAIN) return;
      const rivalGain = strength([...theirs.filter((id) => !get.includes(id)), ...give]) - theirBase;
      if (rivalGain < MIN_GAIN) return;
      trades.push({
        rival, myGain, rivalGain,
        give: give.map((id) => players.get(id)!), get: get.map((id) => players.get(id)!),
      });
    };

    for (const a of mine) for (const b of theirs) if (pos(a) === pos(b)) consider([a], [b]);

    const theirCheap = cheapest(theirs, theirBase);
    const pairs = (ids: number[]) => ids.flatMap((x, i) => ids.slice(i + 1).map((y) => [x, y]));
    const shape = (pair: number[]) => pair.map(pos).sort().join();
    for (const give of pairs(myCheap)) {
      for (const get of pairs(theirCheap)) if (shape(give) === shape(get)) consider(give, get);
    }
  }

  const key = (t: Trade) => Math.min(t.myGain, t.rivalGain);
  return trades.sort((a, b) => key(b) - key(a) || b.myGain + b.rivalGain - (a.myGain + a.rivalGain));
}
