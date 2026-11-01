// The Model check (ADR-0001): how each gameweek's frozen Snapshot compared
// with the points Players actually scored. It only reads Snapshots and
// Results; past Projections are never recomputed.
import type { Results } from "../types";

/** manifest.json */
export interface Manifest {
  first_snapshot_gameweek: number;
  snapshots: number[];
  gaps: number[];
  model: { version: number; params?: { w: number; k: number } };
}

/** snapshots/gwNN.json */
export interface Snapshot {
  gameweek: number;
  deadline: string;
  model_version: number;
  params?: { w: number; k: number };
  projections: Record<string, number>;
}

export function pearson(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 3) return 0;
  const ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i] - ma) * (b[i] - mb);
    va += (a[i] - ma) ** 2;
    vb += (b[i] - mb) ** 2;
  }
  return va && vb ? cov / Math.sqrt(va * vb) : 0;
}

export const meanAbsError = (a: number[], b: number[]) =>
  a.length ? a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0) / a.length : 0;

/** A Player's actual points in a gameweek, or null if it hasn't finished. */
function actual(results: Results, id: string, gameweek: number): number | null {
  const i = results.gameweeks.indexOf(gameweek);
  return i < 0 ? null : results.players[id]?.[i] ?? 0;
}

export type CheckRow =
  | { kind: "checked"; gameweek: number; modelVersion: number; params?: Snapshot["params"]; correlation: number; error: number; players: number }
  | { kind: "pending"; gameweek: number }   // Snapshot taken; gameweek not finished yet
  | { kind: "gap"; gameweek: number };      // no Snapshot was taken: lost for good

/** One row per gameweek from the first Snapshot gameweek: checked, waiting for
 * results, or a gap. Only Players the Snapshot expected to score are compared. */
export function modelCheck(manifest: Manifest, snapshots: Map<number, Snapshot>, results: Results): CheckRow[] {
  const gws = [...new Set([...manifest.snapshots, ...manifest.gaps])].sort((a, b) => a - b);
  return gws.map((gameweek): CheckRow => {
    if (manifest.gaps.includes(gameweek)) return { kind: "gap", gameweek };
    const snap = snapshots.get(gameweek);
    if (!snap || !results.gameweeks.includes(gameweek)) return { kind: "pending", gameweek };
    const pairs = Object.entries(snap.projections).filter(([, p]) => p > 0)
      .map(([id, p]) => [p, actual(results, id, gameweek)!] as const);
    const predicted = pairs.map(([p]) => p), scored = pairs.map(([, a]) => a);
    return {
      kind: "checked", gameweek, modelVersion: snap.model_version, params: snap.params,
      correlation: pearson(predicted, scored), error: meanAbsError(predicted, scored), players: pairs.length,
    };
  });
}

/** The Claimed Manager's Squad in the latest checked gameweek: each Player's
 * Snapshot Projection against what he scored, most expected first. */
export function squadCheck(snapshot: Snapshot, results: Results, squad: number[]) {
  return squad
    .map((id) => ({ id, predicted: snapshot.projections[String(id)] ?? 0, actual: actual(results, String(id), snapshot.gameweek) ?? 0 }))
    .sort((a, b) => b.predicted - a.predicted || a.id - b.id);
}
