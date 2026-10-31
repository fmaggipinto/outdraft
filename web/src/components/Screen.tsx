import type { ReactNode } from "react";
import { Link } from "../App";
import { useStaleSince } from "../data";
import { relative, when } from "../format";
import type { Projections } from "../types";
import { TabBar, type TabKey } from "./TabBar";

/** Every screen: the header band (docs/design.md §3), the saved-data notice,
 * the content, and, inside a League, the bottom tab bar. */
export function Screen({ title, kicker, projections, league, children }: {
  title: string;
  kicker?: ReactNode;
  /** Published Projections, for the gameweek box, last update and Model settings. */
  projections?: Projections;
  /** Inside a League: which tab is active and whether Trades are on. */
  league?: { id: number; tab: TabKey; trades: boolean };
  children: ReactNode;
}) {
  const gw = projections?.events[0]?.gameweek;
  const params = projections?.params;
  return (
    <div className={league ? "has-tabs" : undefined}>
      <header className="band">
        <div className="band-inner">
          <div className="band-top">
            <Link to="/" className="brand" aria-label="Outdraft home">OUTDRAFT</Link>
            {gw != null && <span className="gw-box">Gameweek {gw}</span>}
          </div>
          {kicker && <p className="kicker">{kicker}</p>}
          <h1>{title}</h1>
          {projections && (
            <p className="meta">
              Updated {relative(projections.updated_at)} · Model v{projections.model_version}
              {params?.w != null && `: xG weight ${params.w}, opponent effect ${params.k}`} · data to GW{projections.based_on_gameweek}
            </p>
          )}
        </div>
        <div className="stripe" />
      </header>
      <StaleNotice />
      <main>{children}</main>
      {league && <TabBar leagueId={league.id} active={league.tab} trades={league.trades} />}
    </div>
  );
}

/** Shown when what's on screen came from data saved on this device. */
function StaleNotice() {
  const since = useStaleSince();
  if (since == null) return null;
  const iso = new Date(since).toISOString();
  return (
    <div className="stale" role="status">
      <p>
        <b>FPL Draft isn't responding,</b> so this is the data from {when(iso)} ({relative(iso)}), saved on this device.
      </p>
      <button type="button" className="ghost" onClick={() => location.reload()}>Try again</button>
    </div>
  );
}
