import type { LeagueAnalysis } from "../analysis/league";
import { gameweekSummaries } from "../analysis/ranks";
import { useRankHistory } from "../seasonHistory";

// Drawn at roughly phone width, so text keeps its size on a phone.
const W = 340, H = 200, LEFT = 30, RIGHT = 8, TOP = 10, BOTTOM = 22;

/** League › Season: the Claimed Manager's points per gameweek as bars, the
 * League average as a line and the gameweek's best score as a dot
 * (docs/design.md §4). */
export function PointsPerGameweek({ league, lastFinished, me }: { league: LeagueAnalysis; lastFinished: number; me: number | null }) {
  const load = useRankHistory(league, lastFinished);
  const mine = league.managers.find((m) => m.entryId === me);

  let body;
  if (load.kind === "loading") body = <p className="muted" role="status">Loading League history…</p>;
  else if (load.kind === "error") body = <p className="muted" role="status">Couldn't load the League's history right now.</p>;
  else if (!load.data.gameweeks.length) body = <p className="muted">The chart appears after the first finished gameweek.</p>;
  else {
    const summaries = gameweekSummaries(load.data);
    const scores = mine ? load.data.points.get(mine.entryId)! : [];
    const top = Math.max(10, ...summaries.map((s) => s.best), ...scores.map((x) => x ?? 0));
    const step = top > 80 ? 20 : top > 40 ? 10 : 5;
    const max = Math.ceil(top / step) * step;
    const n = summaries.length;
    const band = (W - LEFT - RIGHT) / n;
    const cx = (i: number) => LEFT + band * i + band / 2;
    const y = (v: number) => H - BOTTOM - (v / max) * (H - TOP - BOTTOM);
    body = (
      <>
        <svg className="ppg-chart" viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`${mine ? `${mine.teamName}'s points` : "Points"} per gameweek, with the League average and best score`}>
          {Array.from({ length: max / step + 1 }, (_, k) => k * step).map((v) => (
            <g key={v}>
              <line x1={LEFT} x2={W - RIGHT} y1={y(v)} y2={y(v)} className="grid" />
              <text x={LEFT - 5} y={y(v) + 4} textAnchor="end" className="axis">{v}</text>
            </g>
          ))}
          {summaries.map((s, i) => (
            <text key={s.gameweek} x={cx(i)} y={H - 4} textAnchor="middle" className="axis">{s.gameweek}</text>
          ))}
          {scores.map((v, i) => v != null && (
            <rect key={i} className="bar" x={cx(i) - band * 0.32} width={band * 0.64} y={y(v)} height={y(0) - y(v)} />
          ))}
          <polyline className="avg" points={summaries.map((s, i) => `${cx(i)},${y(s.average)}`).join(" ")} />
          {summaries.map((s, i) => <circle key={i} className="best" cx={cx(i)} cy={y(s.best)} r={4} />)}
        </svg>
        <ul className="ppg-key small">
          {mine && <li><span className="k bar" aria-hidden="true" />{mine.teamName}</li>}
          <li><span className="k avg" aria-hidden="true" />League average</li>
          <li><span className="k best" aria-hidden="true" />Best score</li>
        </ul>
        {!mine && <p className="muted small">Claim your Manager to see your own points as bars.</p>}
        <table className="sr-only">
          <caption>Points per gameweek</caption>
          <thead><tr><th scope="col">Gameweek</th>{mine && <th scope="col">{mine.teamName}</th>}<th scope="col">Average</th><th scope="col">Best</th></tr></thead>
          <tbody>
            {summaries.map((s, i) => (
              <tr key={s.gameweek}>
                <th scope="row">GW{s.gameweek}</th>
                {mine && <td>{scores[i] ?? "–"}</td>}
                <td>{s.average.toFixed(1)}</td>
                <td>{s.best}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  }

  return (
    <section aria-labelledby="ppg-h">
      <div className="section-head">
        <h2 id="ppg-h">Points per gameweek</h2>
      </div>
      <div className="card">{body}</div>
    </section>
  );
}
