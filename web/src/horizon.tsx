import { useState } from "react";
import { HORIZONS, type Horizon } from "./analysis/league";

const LABEL: Record<Horizon, string> = { 1: "Next GW", 3: "Next 3", 6: "Next 6" };

function fromUrl(): Horizon {
  const h = Number(new URLSearchParams(location.search).get("h"));
  return (HORIZONS as readonly number[]).includes(h) ? (h as Horizon) : 3;
}

/** The 1/3/6 gameweek horizon, kept in the address (?h=6) so it carries
 * between the League and Squad screens and into shared links. */
export function useHorizon(): [Horizon, (h: Horizon) => void] {
  const [h, setH] = useState(fromUrl);
  return [h, (next) => {
    const url = new URL(location.href);
    url.searchParams.set("h", String(next));
    history.replaceState(null, "", url);
    setH(next);
  }];
}

export function HorizonToggle({ value, onChange }: { value: Horizon; onChange: (h: Horizon) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Gameweeks ahead">
      {HORIZONS.map((h) => (
        <button key={h} role="radio" aria-checked={h === value} className={h === value ? "on" : ""} onClick={() => onChange(h)}>
          {LABEL[h]}
        </button>
      ))}
    </div>
  );
}

/** "GW10–12", or "GW10" for a single gameweek. */
export function gwRange(gws: number[]) {
  return gws.length > 1 ? `GW${gws[0]}–${gws[gws.length - 1]}` : `GW${gws[0]}`;
}
