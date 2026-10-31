import { useEffect, useState } from "react";

// The Claimed Manager is remembered per League in this browser only
// (ADR-0002): it is never sent anywhere.

const key = (leagueId: number) => `outdraft.claim.${leagueId}`;
const EVENT = "outdraft:claim";

type KeyValue = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storage(): KeyValue | null {
  try {
    return window.localStorage;
  } catch {
    return null;   // blocked storage, e.g. some private windows
  }
}

export function readClaim(store: KeyValue | null, leagueId: number): number | null {
  try {
    const v = Number(store?.getItem(key(leagueId)));
    return Number.isInteger(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function writeClaim(store: KeyValue | null, leagueId: number, entryId: number | null) {
  try {
    if (entryId == null) store?.removeItem(key(leagueId));
    else store?.setItem(key(leagueId), String(entryId));
  } catch {
    // Not remembered, but the claim still applies until the page closes.
  }
}

/** [Claimed Manager's entry id or null, set or clear it]. */
export function useClaim(leagueId: number): [number | null, (entryId: number | null) => void] {
  const [claim, setClaim] = useState(() => readClaim(storage(), leagueId));

  useEffect(() => {
    setClaim(readClaim(storage(), leagueId));
    const sync = (e: Event) => {
      const d = (e as CustomEvent<{ leagueId: number; entryId: number | null }>).detail;
      if (d?.leagueId === leagueId) setClaim(d.entryId);
    };
    addEventListener(EVENT, sync);
    return () => removeEventListener(EVENT, sync);
  }, [leagueId]);

  return [claim, (entryId) => {
    writeClaim(storage(), leagueId, entryId);
    setClaim(entryId);
    dispatchEvent(new CustomEvent(EVENT, { detail: { leagueId, entryId } }));
  }];
}
