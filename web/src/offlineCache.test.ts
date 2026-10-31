import { describe, expect, it, vi } from "vitest";
import { loadJson, NotFoundError, type Deps } from "./offlineCache";

/** A minimal in-memory stand-in for a Cache Storage cache. */
function memoryCache() {
  const m = new Map<string, Response>();
  return {
    put: vi.fn(async (url: string, res: Response) => void m.set(url, res)),
    match: vi.fn(async (url: string) => m.get(url)?.clone()),
  } as unknown as Cache & { put: ReturnType<typeof vi.fn> };
}

const deps = (fetchImpl: Deps["fetch"], cache: Cache | null, now = 1_000): Deps => ({
  fetch: fetchImpl, cache: async () => cache, now: () => now, timeoutMs: 50,
});
const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
const down = vi.fn(async () => { throw new TypeError("Failed to fetch"); });

describe("loadJson", () => {
  it("returns fresh data and saves a copy", async () => {
    const cache = memoryCache();
    const got = await loadJson("/a", deps(ok({ x: 1 }), cache));
    expect(got).toEqual({ data: { x: 1 }, savedAt: null });
    expect(cache.put).toHaveBeenCalledOnce();
  });

  it("falls back to the saved copy, with when it was saved, if the network fails", async () => {
    const cache = memoryCache();
    await loadJson("/a", deps(ok({ x: 1 }), cache, 1234));
    expect(await loadJson("/a", deps(down, cache, 9999))).toEqual({ data: { x: 1 }, savedAt: 1234 });
  });

  it("falls back on a server error and when the network is too slow", async () => {
    const cache = memoryCache();
    await loadJson("/a", deps(ok({ x: 1 }), cache, 5));
    const error = vi.fn(async () => new Response("bad gateway", { status: 502 }));
    expect((await loadJson("/a", deps(error, cache))).savedAt).toBe(5);
    const hang = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    expect((await loadJson("/a", deps(hang as never, cache))).savedAt).toBe(5);
  });

  it("never falls back on a 404, which is a real answer", async () => {
    const cache = memoryCache();
    await loadJson("/a", deps(ok({ x: 1 }), cache));
    const missing = vi.fn(async () => new Response("", { status: 404 }));
    await expect(loadJson("/a", deps(missing, cache))).rejects.toBeInstanceOf(NotFoundError);
  });

  it("fails clearly with nothing saved, or without Cache Storage", async () => {
    await expect(loadJson("/never-opened", deps(down, memoryCache()))).rejects.toThrow("network");
    await expect(loadJson("/a", deps(down, null))).rejects.toThrow("network");
    expect(await loadJson("/a", deps(ok({ y: 2 }), null))).toEqual({ data: { y: 2 }, savedAt: null });
  });
});
