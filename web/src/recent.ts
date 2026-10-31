import { useEffect, useState } from "react";

// Leagues opened on this device, newest first. Kept in this browser only.

const KEY = "outdraft.recent";
const MAX = 8;
const EVENT = "outdraft:recent";

export interface RecentLeague {
  id: number;
  name: string;
}

type KeyValue = Pick<Storage, "getItem" | "setItem">;

function storage(): KeyValue | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readRecent(store: KeyValue | null): RecentLeague[] {
  try {
    const list = JSON.parse(store?.getItem(KEY) ?? "[]");
    return Array.isArray(list)
      ? list.filter((x) => Number.isInteger(x?.id) && typeof x?.name === "string").slice(0, MAX)
      : [];
  } catch {
    return [];
  }
}

function write(store: KeyValue | null, list: RecentLeague[]) {
  try {
    store?.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // Not remembered; nothing else depends on it.
  }
}

export function addRecent(store: KeyValue | null, league: RecentLeague) {
  write(store, [league, ...readRecent(store).filter((x) => x.id !== league.id)]);
}

export function removeRecent(store: KeyValue | null, id: number) {
  write(store, readRecent(store).filter((x) => x.id !== id));
}

/** Remember a League as just opened. */
export function rememberLeague(league: RecentLeague) {
  addRecent(storage(), league);
  dispatchEvent(new Event(EVENT));
}

export function useRecent(): [RecentLeague[], (id: number) => void] {
  const [list, setList] = useState(() => readRecent(storage()));
  useEffect(() => {
    const sync = () => setList(readRecent(storage()));
    addEventListener(EVENT, sync);
    return () => removeEventListener(EVENT, sync);
  }, []);
  return [list, (id) => {
    removeRecent(storage(), id);
    setList(readRecent(storage()));
  }];
}
