import { useMemo, useState } from "react";
import { freeAgents, SORTS, type SortKey } from "../analysis/freeAgents";
import { pts } from "../format";
import { gwRange, HorizonToggle, useHorizon } from "../horizon";
import type { ElementStatus, Position, Projections } from "../types";
import { PlayerTags } from "./PlayerTags";

export const POS: Record<Position, string> = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };
const PAGE = 25;

export function FreeAgentBrowser({ status, projections, onCompare }: {
  status: ElementStatus;
  projections: Projections;
  onCompare: (id: number) => void;
}) {
  const [horizon, setHorizon] = useHorizon();
  const [position, setPosition] = useState<Position | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("projection");
  const [limit, setLimit] = useState(PAGE);
  const short = new Map(projections.teams.map((t) => [t.id, t.short_name]));
  const rows = useMemo(
    () => freeAgents(status, projections, { position, query, sort, horizon }),
    [status, projections, position, query, sort, horizon],
  );

  return (
    <section className="card" aria-labelledby="fa-h">
      <div className="title-row">
        <h2 id="fa-h">Free agents</h2>
        <HorizonToggle value={horizon} onChange={setHorizon} />
      </div>
      <div className="fa-filters">
        <div className="segmented" role="radiogroup" aria-label="Position">
          {([null, 1, 2, 3, 4] as const).map((p) => (
            <button key={p ?? 0} role="radio" aria-checked={p === position} className={p === position ? "on" : ""}
              onClick={() => { setPosition(p); setLimit(PAGE); }}>
              {p ? POS[p] : "All"}
            </button>
          ))}
        </div>
        <input type="search" aria-label="Search Players" placeholder="Search" value={query}
          onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} />
        <label className="sort">
          <span className="muted small">Sort by </span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {Object.entries(SORTS).map(([k, label]) => (
              <option key={k} value={k}>{k === "projection" ? `Projection (${gwRange(projections.gameweeks.slice(0, horizon))})` : label}</option>
            ))}
          </select>
        </label>
      </div>
      {rows.length ? (
        <ol className="fa-list">
          {rows.slice(0, limit).map((r) => (
            <li key={r.player.id}>
              <div className="who">
                <span>
                  <span className="team">{r.player.name}</span>{" "}
                  <span className="muted small">{POS[r.player.position]} · {short.get(r.player.team)}</span>
                  <PlayerTags p={r.player} />
                </span>
                <span className="muted small stats">
                  xG+xA {r.xgi.toFixed(2)}/90 · {r.player.minutes} mins · {r.player.total_points} pts
                </span>
                {r.player.news && <span className="news">{r.player.news}</span>}
              </div>
              <span className="value">{pts(r.projection)}</span>
              <button type="button" className="ghost small-btn" onClick={() => onCompare(r.player.id)}
                aria-label={`Compare ${r.player.name}`}>Compare</button>
            </li>
          ))}
        </ol>
      ) : (
        <p>No Free agents match.</p>
      )}
      {rows.length > limit && (
        <button type="button" className="ghost" onClick={() => setLimit((n) => n + PAGE)}>
          Show more ({rows.length - limit} left)
        </button>
      )}
    </section>
  );
}
