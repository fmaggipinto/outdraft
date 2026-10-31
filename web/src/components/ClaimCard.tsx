import { useState } from "react";
import type { LeagueAnalysis } from "../analysis/league";

export function ClaimCard({ league, me, setClaim }: {
  league: LeagueAnalysis; me: number | null; setClaim: (entryId: number | null) => void;
}) {
  const [changing, setChanging] = useState(false);
  const mine = league.managers.find((m) => m.entryId === me);

  if (mine && !changing)
    return (
      <section className="card claim" aria-label="Your Manager">
        <p>
          You're <b>{mine.teamName}</b> <span className="tag you">You</span>
        </p>
        <div className="claim-actions">
          <button className="ghost" onClick={() => setChanging(true)}>Change</button>
          <button className="ghost" onClick={() => setClaim(null)}>Not me</button>
        </div>
      </section>
    );

  return (
    <section className="card claim" aria-label="Your Manager">
      <label htmlFor="claim-select">{mine ? "Which Manager are you?" : "Are you in this League?"}</label>
      <select
        id="claim-select"
        value={mine?.entryId ?? ""}
        onChange={(e) => {
          setClaim(e.target.value ? Number(e.target.value) : null);
          setChanging(false);
        }}
      >
        <option value="">Choose your team…</option>
        {[...league.managers].sort((a, b) => a.teamName.localeCompare(b.teamName)).map((m) => (
          <option key={m.entryId} value={m.entryId}>{m.teamName} ({m.managerName})</option>
        ))}
      </select>
      <p className="muted small">
        Highlights you everywhere and powers your Waiver targets and Trades. Remembered on this device only.
      </p>
    </section>
  );
}

export function YouTag({ show }: { show: boolean }) {
  return show ? <span className="tag you">You</span> : null;
}
