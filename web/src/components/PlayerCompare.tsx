import { forwardRef } from "react";
import type { LeagueAnalysis } from "../analysis/league";
import { opponentsIn } from "../analysis/squad";
import { pts } from "../format";
import { gwRange } from "../horizon";
import type { ElementStatus, ProjectedPlayer, Projections } from "../types";
import { POS, StatusTag } from "./FreeAgentBrowser";

const HORIZON = 3;

/** Two Players side by side, owned or not. The better value in each row is highlighted. */
export const PlayerCompare = forwardRef<HTMLElement, {
  league: LeagueAnalysis;
  status: ElementStatus;
  projections: Projections;
  ids: [number | null, number | null];
  setIds: (ids: [number | null, number | null]) => void;
}>(function PlayerCompare({ league, status, projections, ids, setIds }, ref) {
  const players = new Map(projections.players.map((p) => [p.id, p]));
  const teamOf = new Map(league.managers.map((m) => [m.entryId, m.teamName]));
  const ownerOf = new Map(status.element_status.map((e) => [e.element, e.owner]));
  const short = new Map(projections.teams.map((t) => [t.id, t.short_name]));
  const opponents = opponentsIn(projections);
  const gws = projections.gameweeks.slice(0, HORIZON);
  const owner = (id: number) => { const o = ownerOf.get(id); return o != null ? teamOf.get(o) ?? "Another Squad" : "Free agent"; };

  const sorted = [...projections.players].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  const picker = (side: 0 | 1) => (
    <select aria-label={side === 0 ? "First Player" : "Second Player"} value={ids[side] ?? ""}
      onChange={(e) => { const next = [...ids] as [number | null, number | null]; next[side] = e.target.value ? Number(e.target.value) : null; setIds(next); }}>
      <option value="">Choose a Player…</option>
      {([1, 2, 3, 4] as const).map((pos) => (
        <optgroup key={pos} label={POS[pos]}>
          {sorted.filter((p) => p.position === pos).map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({short.get(p.team)}, {owner(p.id)})</option>
          ))}
        </optgroup>
      ))}
    </select>
  );

  const [a, b] = ids.map((id) => (id != null ? players.get(id) : undefined)) as [ProjectedPlayer | undefined, ProjectedPlayer | undefined];
  const rows: [string, (p: ProjectedPlayer) => number, (v: number) => string][] = [
    [`Projection ${gwRange(gws)}`, (p) => p.projections.slice(0, HORIZON).reduce((x, y) => x + y, 0), pts],
    ["xG /90", (p) => p.xg90, (v) => v.toFixed(2)],
    ["xA /90", (p) => p.xa90, (v) => v.toFixed(2)],
    ["Minutes", (p) => p.minutes, String],
    ["Starts, last 6", (p) => p.starts_recent, String],
    ["Season points", (p) => p.total_points, String],
  ];
  const fixtures = (p: ProjectedPlayer) =>
    gws.map((gw) => opponents(p.team, gw).map((o) => (o.home ? o.team.toUpperCase() : o.team.toLowerCase())).join(" + ") || "–").join(" · ");

  return (
    <section className="card" aria-labelledby="cmp-h" ref={ref}>
      <h2 id="cmp-h">Compare two Players</h2>
      <div className="cmp-pickers">{picker(0)}{picker(1)}</div>
      {a && b ? (
        <table className="cmp">
          <thead>
            <tr>
              <th scope="col" className="left">{a.name} <StatusTag p={a} /><span className="muted small block">{owner(a.id)}</span></th>
              <th scope="col"><span className="sr-only">Stat</span></th>
              <th scope="col" className="right">{b.name} <StatusTag p={b} /><span className="muted small block">{owner(b.id)}</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, get, show]) => {
              const x = get(a), y = get(b);
              return (
                <tr key={label}>
                  <td className={`left${x > y ? " better" : ""}`}>{show(x)}</td>
                  <th scope="row" className="muted small">{label}</th>
                  <td className={`right${y > x ? " better" : ""}`}>{show(y)}</td>
                </tr>
              );
            })}
            <tr>
              <td className="left small">{a.points_recent.join(" ")}</td>
              <th scope="row" className="muted small">Recent points</th>
              <td className="right small">{b.points_recent.join(" ")}</td>
            </tr>
            <tr>
              <td className="left small">{fixtures(a)}</td>
              <th scope="row" className="muted small">Next fixtures</th>
              <td className="right small">{fixtures(b)}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="muted">Choose two Players, owned or not, to compare them.</p>
      )}
    </section>
  );
});
