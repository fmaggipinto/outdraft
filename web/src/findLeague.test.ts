import { describe, expect, it, vi } from "vitest";
import classicDetails from "../tests/fixtures/classic-details.json";
import entryPublic from "../tests/fixtures/entry-public.json";
import { findLeagues, type EntryPublic } from "./findLeague";
import { addRecent, readRecent, removeRecent } from "./recent";
import type { LeagueDetails } from "./types";

const details = classicDetails as LeagueDetails;

describe("findLeagues", () => {
  it("finds the League a recorded team plays in, with its name", async () => {
    const get = {
      entry: vi.fn(async () => entryPublic as EntryPublic),
      details: vi.fn(async () => details),
    };
    const found = await findLeagues(entryPublic.entry.id, get);
    expect(get.entry).toHaveBeenCalledWith(entryPublic.entry.id);
    expect(found).toEqual({ teamName: "Team A", leagues: [{ id: 5000, name: "Test Classic League" }] });
  });

  it("lists every League for a team in several, falling back to the ID for one it can't load", async () => {
    const entry = { entry: { ...entryPublic.entry, league_set: [5000, 77, 130000] } };
    const found = await findLeagues(1, {
      entry: async () => entry,
      details: async (id) => {
        if (id === 77) throw new Error("HTTP 502");
        return { ...details, league: { ...details.league, id, name: `League name ${id}` } };
      },
    });
    expect(found.leagues).toEqual([
      { id: 5000, name: "League name 5000" },
      { id: 77, name: "League 77" },
      { id: 130000, name: "League name 130000" },
    ]);
  });

  it("returns no Leagues for a team that isn't in one", async () => {
    const found = await findLeagues(1, {
      entry: async () => ({ entry: { ...entryPublic.entry, league_set: [] } }),
      details: async () => details,
    });
    expect(found.leagues).toEqual([]);
  });

  it("lets an unknown team ID fail, for the screen to explain", async () => {
    await expect(findLeagues(1, { entry: async () => { throw new Error("not found"); }, details: async () => details }))
      .rejects.toThrow("not found");
  });
});

describe("recent Leagues", () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };

  it("keeps the newest first, without duplicates, up to 8", () => {
    const s = memory();
    for (let i = 1; i <= 10; i++) addRecent(s, { id: i, name: `L${i}` });
    addRecent(s, { id: 5, name: "L5 renamed" });
    const list = readRecent(s);
    expect(list).toHaveLength(8);
    expect(list[0]).toEqual({ id: 5, name: "L5 renamed" });
    expect(list.filter((x) => x.id === 5)).toHaveLength(1);
  });

  it("removes a League and copes with junk or no storage", () => {
    const s = memory();
    addRecent(s, { id: 1, name: "A" });
    addRecent(s, { id: 2, name: "B" });
    removeRecent(s, 1);
    expect(readRecent(s)).toEqual([{ id: 2, name: "B" }]);
    s.setItem("outdraft.recent", "not json");
    expect(readRecent(s)).toEqual([]);
    expect(readRecent(null)).toEqual([]);
    expect(() => addRecent(null, { id: 1, name: "A" })).not.toThrow();
  });
});
