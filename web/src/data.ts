import { useEffect, useState } from "react";
import type { EntryPublic } from "./findLeague";
import { CACHE_NAME, loadJson, NotFoundError } from "./offlineCache";
import type { Distributions, ElementStatus, Game, LeagueDetails, Picks, Projections, Results, Transactions } from "./types";

export { NotFoundError };

// Published Model files are read straight from the repo (docs/data-format.md).
export const DATA_URL =
  import.meta.env.VITE_DATA_URL ?? "https://raw.githubusercontent.com/fmaggipinto/outdraft/main/data/";

const TIMEOUT_MS = 10_000;   // after this, use the saved copy if there is one

// Which of the current screen's responses came from saved copies, and when
// they were saved. Cleared on every navigation.
const stale = new Map<string, number>();
const STALE_EVENT = "outdraft:stale";

async function openCache(): Promise<Cache | null> {
  try {
    return "caches" in globalThis ? await caches.open(CACHE_NAME) : null;
  } catch {
    return null;
  }
}

async function getJson<T>(url: string): Promise<T> {
  const { data, savedAt } = await loadJson<T>(url, {
    fetch: (u, init) => fetch(u, init), cache: openCache, now: Date.now, timeoutMs: TIMEOUT_MS,
  });
  if (savedAt == null) stale.delete(url);
  else stale.set(url, savedAt);
  dispatchEvent(new Event(STALE_EVENT));
  return data;
}

/** True if any of these URLs was last served from a saved copy. */
export const isStale = (urls: string[]) => urls.some((u) => stale.has(u));

export function clearStale() {
  stale.clear();
  dispatchEvent(new Event(STALE_EVENT));
}

/** When the oldest saved copy on screen was saved, or null if everything is fresh. */
export function useStaleSince(): number | null {
  const oldest = () => (stale.size ? Math.min(...stale.values()) : null);
  const [since, setSince] = useState(oldest);
  useEffect(() => {
    const update = () => setSince(oldest());
    addEventListener(STALE_EVENT, update);
    return () => removeEventListener(STALE_EVENT, update);
  }, []);
  return since;
}

export const projectionsUrl = DATA_URL + "projections.json";
export const leagueUrls = (id: number) => [`/api/fpl/league/${id}/details`, `/api/fpl/league/${id}/element-status`];

export const fetchProjections = () => getJson<Projections>(projectionsUrl);

export const fetchResults = () => getJson<Results>(DATA_URL + "results.json");

export const fetchDistributions = () => getJson<Distributions>(DATA_URL + "distributions.json");

export const fetchGame = () => getJson<Game>("/api/fpl/game");

export const fetchTransactions = (id: number) =>
  getJson<Transactions>(`/api/fpl/draft/league/${id}/transactions`);

/** A Manager's lineup for a finished gameweek, or null if they had none (joined later). */
export const fetchPicks = (entryId: number, gw: number) =>
  getJson<Picks>(`/api/fpl/entry/${entryId}/event/${gw}`).catch((e) => {
    if (e instanceof NotFoundError) return null;
    throw e;
  });

export const fetchEntryPublic = (entryId: number) =>
  getJson<EntryPublic>(`/api/fpl/entry/${entryId}/public`);

export const fetchLeagueDetails = (id: number) => getJson<LeagueDetails>(`/api/fpl/league/${id}/details`);

export const fetchLeague = (id: number) => {
  const [details, status] = leagueUrls(id);
  return Promise.all([getJson<LeagueDetails>(details), getJson<ElementStatus>(status)]);
};
