import type { ReactNode } from "react";
import { Link } from "../App";
import { useHorizon } from "../horizon";

export type TabKey = "league" | "squad" | "targets" | "trades" | "fixtures" | "more";

const icon = (paths: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" aria-hidden="true">
    {paths}
  </svg>
);

const ICONS: Record<TabKey, ReactNode> = {
  // A league table.
  league: icon(<><path d="M4 5h16M4 10h16M4 15h16M4 20h10" /></>),
  // A shirt.
  squad: icon(<path d="M8 3l-5 3 2 5 3-1v11h8V10l3 1 2-5-5-3a4 4 0 0 1-8 0z" />),
  // A crosshair.
  targets: icon(<><circle cx="12" cy="12" r="7" /><path d="M12 2v5M12 17v5M2 12h5M17 12h5" /></>),
  // Two arrows swapping.
  trades: icon(<><path d="M4 8h14l-4-4M20 16H6l4 4" /></>),
  // A calendar.
  fixtures: icon(<><rect x="3" y="5" width="18" height="16" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  // Three dots.
  more: icon(<><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></>),
};

const LABELS: Record<TabKey, string> = {
  league: "League", squad: "Squad", targets: "Targets", trades: "Trades", fixtures: "Fixtures", more: "More",
};

export const tabPath = (leagueId: number, tab: TabKey) => `/league/${leagueId}${tab === "league" ? "" : `/${tab}`}`;

/** The bottom tab bar (docs/design.md §1): League, Squad, Targets, Trades, More.
 * When a League has Trades switched off, Fixtures takes the Trades slot. */
export function TabBar({ leagueId, active, trades }: { leagueId: number; active: TabKey; trades: boolean }) {
  const [horizon] = useHorizon();
  const tabs: TabKey[] = ["league", "squad", "targets", trades ? "trades" : "fixtures", "more"];
  return (
    <nav className="tabbar" aria-label="League sections">
      <ul>
        {tabs.map((t) => (
          <li key={t}>
            <Link to={`${tabPath(leagueId, t)}?h=${horizon}`} aria-current={t === active ? "page" : undefined}>
              {ICONS[t]}
              <span>{LABELS[t]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
