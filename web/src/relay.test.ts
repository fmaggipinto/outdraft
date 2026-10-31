import { describe, expect, it, vi } from "vitest";
import { relay, UPSTREAM } from "./relay";

const req = (path: string, method = "GET") => new Request(`https://outdraft.test${path}`, { method });
const upstream = (status: number, body = "{}") => vi.fn(async () => new Response(body, { status }));

describe("relay", () => {
  it.each([
    "/api/fpl/game",
    "/api/fpl/league/5000/details",
    "/api/fpl/league/5000/element-status",
    "/api/fpl/draft/league/5000/transactions",
    "/api/fpl/draft/league/5000/trades",
    "/api/fpl/entry/123/public",
    "/api/fpl/entry/123/history",
    "/api/fpl/entry/123/event/9",
  ])("forwards %s with a short cache", async (path) => {
    const fetchImpl = upstream(200, '{"ok":true}');
    const res = await relay(req(path), fetchImpl);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(fetchImpl).toHaveBeenCalledWith(UPSTREAM + path.slice("/api/fpl/".length), expect.anything());
  });

  it.each([
    "/api/fpl/bootstrap-static",
    "/api/fpl/entry/123/my-team",
    "/api/fpl/league/abc/details",
    "/api/fpl/league/5000/details/../../game",
    "/api/fpl/league/1234567890/details",
    "/api/other/game",
  ])("refuses %s without calling FPL", async (path) => {
    const fetchImpl = upstream(200);
    const res = await relay(req(path), fetchImpl);
    expect(res.status).toBe(404);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses anything but GET", async () => {
    const fetchImpl = upstream(200);
    expect((await relay(req("/api/fpl/game", "POST"), fetchImpl)).status).toBe(405);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("passes on an unknown League as 404 and other failures as 502", async () => {
    expect((await relay(req("/api/fpl/league/1/details"), upstream(404))).status).toBe(404);
    const failed = await relay(req("/api/fpl/league/1/details"), upstream(503));
    expect(failed.status).toBe(502);
    expect(failed.headers.get("Cache-Control")).toBe("no-store");
    const down = await relay(req("/api/fpl/game"), vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(down.status).toBe(502);
  });
});
