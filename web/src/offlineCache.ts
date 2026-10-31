// Keeps the last copy of every data response in this browser (Cache Storage),
// so when FPL Draft or GitHub is down or slow, a League you've opened before
// still shows, with a notice saying how old the data is. Nothing leaves the
// browser (ADR-0002).

export class NotFoundError extends Error {}

export const CACHE_NAME = "outdraft-data-v1";
const SAVED_AT = "x-outdraft-saved-at";

export interface Deps {
  fetch: typeof fetch;
  /** Cache Storage, or null where it isn't available (it needs HTTPS). */
  cache: () => Promise<Cache | null>;
  now: () => number;
  timeoutMs: number;
}

export interface Loaded<T> {
  data: T;
  /** When the data was saved, if it came from the saved copy; null if fresh. */
  savedAt: number | null;
}

async function fetchFresh(url: string, deps: Deps): Promise<Response> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), deps.timeoutMs);
  try {
    return await deps.fetch(url, { signal: abort.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch JSON, saving a copy; if the network fails, times out or answers with
 * a server error, fall back to the saved copy. A 404 is a real answer (an
 * unknown League, say) and never falls back. */
export async function loadJson<T>(url: string, deps: Deps): Promise<Loaded<T>> {
  let res: Response | null = null;
  try {
    res = await fetchFresh(url, deps);
  } catch {
    // Offline, blocked or too slow: try the saved copy below.
  }
  if (res?.status === 404) throw new NotFoundError(url);
  if (res?.ok) {
    const data = (await res.json()) as T;
    try {
      const cache = await deps.cache();
      await cache?.put(url, new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json", [SAVED_AT]: String(deps.now()) },
      }));
    } catch {
      // Storage full or blocked: the data still shows, it just isn't saved.
    }
    return { data, savedAt: null };
  }
  try {
    const saved = await (await deps.cache())?.match(url);
    if (saved) return { data: (await saved.json()) as T, savedAt: Number(saved.headers.get(SAVED_AT)) || 0 };
  } catch {
    // Fall through to the error.
  }
  throw new Error(res ? `HTTP ${res.status}` : "network");
}
