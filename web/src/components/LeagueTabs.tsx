import { Link } from "../App";
import type { Horizon, LeagueAnalysis } from "../analysis/league";

const TABS = [
  { key: "league", label: "League", path: "", h2hOnly: false },
  { key: "matchups", label: "Matchups", path: "/matchups", h2hOnly: true },
  { key: "waivers", label: "Waivers", path: "/waivers", h2hOnly: false },
] as const;

export function LeagueTabs({ league, active, horizon }: {
  league: LeagueAnalysis; active: (typeof TABS)[number]["key"]; horizon: Horizon;
}) {
  return (
    <nav className="tabs" aria-label="League sections">
      {TABS.filter((t) => !t.h2hOnly || league.format === "h2h").map((t) => (
        <Link
          key={t.key}
          to={`/league/${league.id}${t.path}?h=${horizon}`}
          className={t.key === active ? "on" : undefined}
          aria-current={t.key === active ? "page" : undefined}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
