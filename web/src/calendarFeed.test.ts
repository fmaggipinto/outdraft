import { describe, expect, it, vi } from "vitest";
import { calendarFeed, SOURCE } from "./calendarFeed";

const ICS = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n";

describe("calendarFeed", () => {
  it("serves the published calendar as text/calendar", async () => {
    const fetchImpl = vi.fn(async () => new Response(ICS, { headers: { "Content-Type": "text/plain" } }));
    const res = await calendarFeed(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(SOURCE);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(await res.text()).toBe(ICS);
  });

  it("refuses to pass on anything that isn't a calendar", async () => {
    expect((await calendarFeed(vi.fn(async () => new Response("404: Not Found", { status: 404 })))).status).toBe(502);
    expect((await calendarFeed(vi.fn(async () => new Response("<html>")))).status).toBe(502);
    expect((await calendarFeed(vi.fn(async () => { throw new TypeError("fetch failed"); }))).status).toBe(502);
  });
});
