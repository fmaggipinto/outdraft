import type { Position, SquadRules } from "../types";

export const DRAFT_SQUAD_RULES: SquadRules = {
  size: 15,
  play: 11,
  min_play: { "1": 1, "2": 3, "3": 2, "4": 1 },
  max_play: { "1": 1, "2": 5, "3": 5, "4": 3 },
};

export interface Candidate {
  id: number;
  position: Position;
  points: number;
}

export interface BestXI {
  ids: number[];
  total: number;
}

const POSITIONS: Position[] = [1, 2, 3, 4];

const byPoints = (a: Candidate, b: Candidate) => b.points - a.points || a.id - b.id;

/** The highest-projected valid starting lineup. A Squad that can't field a
 * valid formation (incomplete) just starts its top `play` Players. */
export function bestXI(squad: Candidate[], rules: SquadRules = DRAFT_SQUAD_RULES): BestXI {
  const by = new Map<Position, Candidate[]>(
    POSITIONS.map((p) => [p, squad.filter((c) => c.position === p).sort(byPoints)]),
  );
  let best: Candidate[] | null = null;
  let bestTotal = -Infinity;

  const counts: number[] = [];
  const search = (i: number, left: number) => {
    if (i === POSITIONS.length) {
      if (left !== 0) return;
      const chosen = POSITIONS.flatMap((p, j) => by.get(p)!.slice(0, counts[j]));
      const total = chosen.reduce((s, c) => s + c.points, 0);
      if (total > bestTotal) [best, bestTotal] = [chosen, total];
      return;
    }
    const p = POSITIONS[i];
    const lo = rules.min_play[p], hi = Math.min(rules.max_play[p], by.get(p)!.length, left);
    for (let n = lo; n <= hi; n++) {
      counts[i] = n;
      search(i + 1, left - n);
    }
  };
  search(0, rules.play);

  if (!best) {
    best = [...squad].sort(byPoints).slice(0, rules.play);
    bestTotal = best.reduce((s, c) => s + c.points, 0);
  }
  return { ids: (best as Candidate[]).map((c) => c.id), total: bestTotal };
}
