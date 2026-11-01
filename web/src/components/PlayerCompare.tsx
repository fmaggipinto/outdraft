import { forwardRef, useState } from "react";
import { matchesQuery } from "../analysis/freeAgents";
import type { LeagueAnalysis } from "../analysis/league";
import { opponentsIn } from "../analysis/squad";
import { pts } from "../format";
import { gwRange } from "../horizon";
import type { ElementStatus, ProjectedPlayer, Projections } from "../types";
import { POS } from "./FreeAgentBrowser";
import { PlayerTags } from "./PlayerTags";

const HORIZON = 3;

/** Two Players side by side, owned or not. The better value in each row is highlighted. */
export const PlayerCompare = forwardRef<HTMLElement, {
  league: LeagueAnalysis;
  status: ElementStatus;
  projections: Projections;
  ids: [number | null, number | null];
  setIds: (ids: [number | null, number | null]) => void;
  /** The Claimed Manager's Squad, offered before typing. */
  squad?: number[];
}>(function PlayerCompare({ league, status, projections, ids, setIds, squad = [] }, ref) {
  const players = new Map(projections.players.map((p) => [p.id, p]));
  const teamOf = new Map(league.managers.map((m) => [m.entryId, m.teamName]));
  const ownerOf = new Map(status.element_status.map((e) => [e.element, e.owner]));
  const short = new Map(projections.teams.map((t) => [t.id, t.short_name]));
  const owner = (id: number) => { const o = ownerOf.get(id); return o != null ? teamOf.get(o) ?? "Another Squad" : "Free agent"; };
  const describe = (p: ProjectedPlayer) => `${POS[p.position]} · ${short.get(p.team)} · ${owner(p.id)}`;
  const mine = squad.map((id) => players.get(id)).filter((p): p is ProjectedPlayer => p != null)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  const pick = (side: 0 | 1) => (id: number) => { const next = [...ids] as [number | null, number | null]; next[side] = id; setIds(next); };

  const [a, b] = ids.map((id) => (id != null ? players.get(id) : undefined)) as [ProjectedPlayer | undefined, ProjectedPlayer | undefined];

  return (
    <section className="card" aria-labelledby="cmp-h" ref={ref}>
      <h2 id="cmp-h">Compare two Players</h2>
      <div className="cmp-pickers">
        <PlayerPicker id="cmp-first" label="First Player" value={a} players={projections.players} squad={mine} describe={describe} onPick={pick(0)} />
        <PlayerPicker id="cmp-second" label="Second Player" value={b} players={projections.players} squad={mine} describe={describe} onPick={pick(1)} />
      </div>
      {a && b ? (
        <CompareTable a={a} b={b} projections={projections} sub={(p) => owner(p.id)} />
      ) : (
        <p className="muted">Search for two Players, owned or not, to compare them.</p>
      )}
    </section>
  );
});

const MATCHES = 8;

/** A search box that picks one Player: type part of a name, then tap a match.
 * Before typing it offers your Squad. */
function PlayerPicker({ id, label, value, players, squad, describe, onPick }: {
  id: string;
  label: string;
  value: ProjectedPlayer | undefined;
  players: ProjectedPlayer[];
  squad: ProjectedPlayer[];
  describe: (p: ProjectedPlayer) => string;
  onPick: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const options = query.trim()
    ? players.filter((p) => matchesQuery(p, query)).sort((x, y) => y.total_points - x.total_points).slice(0, MATCHES)
    : squad;
  const choose = (p: ProjectedPlayer) => { onPick(p.id); setOpen(false); setQuery(""); };
  return (
    <div className="cmp-picker">
      <input id={id} type="search" aria-label={label} placeholder="Search a Player…" autoComplete="off"
        aria-expanded={open} aria-controls={`${id}-list`}
        value={open ? query : value?.name ?? ""}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onBlur={() => setOpen(false)}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && options[0]) { e.preventDefault(); choose(options[0]); (e.target as HTMLInputElement).blur(); }
          if (e.key === "Escape") (e.target as HTMLInputElement).blur();
        }} />
      {open && (
        <div className="cmp-options" id={`${id}-list`}>
          {!query.trim() && squad.length > 0 && <span className="muted small">Your Squad</span>}
          {query.trim() && !options.length && <span className="muted small">No Players match.</span>}
          {options.map((p) => (
            <button key={p.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(p)}>
              <span>{p.name}</span> <span className="muted small">{describe(p)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Two Players side by side: Projection, form, minutes, starts, points, last 6
 * scores, next Fixtures and news. The better value in each row is marked. */
export function CompareTable({ a, b, projections, sub }: {
  a: ProjectedPlayer; b: ProjectedPlayer; projections: Projections; sub: (p: ProjectedPlayer) => string;
}) {
  const opponents = opponentsIn(projections);
  const gws = projections.gameweeks.slice(0, HORIZON);
  const rows: [string, (p: ProjectedPlayer) => number, (v: number) => string][] = [
    [`Projection ${gwRange(gws)}`, (p) => p.projections.slice(0, HORIZON).reduce((x, y) => x + y, 0), pts],
    ["xG+xA /90", (p) => p.xg90 + p.xa90, (v) => v.toFixed(2)],
    ["xG /90", (p) => p.xg90, (v) => v.toFixed(2)],
    ["xA /90", (p) => p.xa90, (v) => v.toFixed(2)],
    ["Minutes", (p) => p.minutes, String],
    ["Starts, last 6", (p) => p.starts_recent, String],
    ["Season points", (p) => p.total_points, String],
  ];
  const fixtures = (p: ProjectedPlayer) =>
    gws.map((gw) => opponents(p.team, gw).map((o) => (o.home ? o.team.toUpperCase() : o.team.toLowerCase())).join(" + ") || "–").join(" · ");
  const better = <span className="sr-only"> (better)</span>;
  return (
    <table className="cmp">
      <thead>
        <tr>
          <th scope="col" className="left">{a.name} <PlayerTags p={a} /><span className="muted small block">{sub(a)}</span></th>
          <th scope="col"><span className="sr-only">Stat</span></th>
          <th scope="col" className="right">{b.name} <PlayerTags p={b} /><span className="muted small block">{sub(b)}</span></th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, get, show]) => {
          const x = get(a), y = get(b);
          return (
            <tr key={label}>
              <td className={`left${x > y ? " better" : ""}`}>{show(x)}{x > y && better}</td>
              <th scope="row" className="muted small">{label}</th>
              <td className={`right${y > x ? " better" : ""}`}>{show(y)}{y > x && better}</td>
            </tr>
          );
        })}
        <tr>
          <td className="left small">{a.points_recent.join(" ")}</td>
          <th scope="row" className="muted small">Last 6 scores</th>
          <td className="right small">{b.points_recent.join(" ")}</td>
        </tr>
        <tr>
          <td className="left small">{fixtures(a)}</td>
          <th scope="row" className="muted small">Next fixtures</th>
          <td className="right small">{fixtures(b)}</td>
        </tr>
        {(a.news || b.news) && (
          <tr>
            <td className="left small news">{a.news || "–"}</td>
            <th scope="row" className="muted small">News</th>
            <td className="right small news">{b.news || "–"}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
