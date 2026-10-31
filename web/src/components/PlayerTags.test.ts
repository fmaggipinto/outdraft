import { describe, expect, it } from "vitest";
import projectionsJson from "../../tests/fixtures/projections.json";
import type { ProjectedPlayer, Projections } from "../types";
import { playerTags, type TagContext } from "./PlayerTags";

const projections = projectionsJson as unknown as Projections;
const base = projections.players.find((p) => p.status === "a")!;
const ctx = (over: Partial<TagContext> = {}): TagContext => ({ phase: "waivers", locked: new Set(), protectedIds: new Set(), ...over });
const tags = (p: ProjectedPlayer, c: TagContext) => playerTags(p, c).map((t) => t.text);

describe("playerTags", () => {
  it("shows status: doubt with chance, injured, suspended, unavailable", () => {
    expect(tags({ ...base, status: "d", chance_next: 75 }, ctx())).toEqual(["Doubt 75%"]);
    expect(tags({ ...base, status: "d", chance_next: null }, ctx())).toEqual(["Doubt"]);
    expect(tags({ ...base, status: "i" }, ctx())).toEqual(["Injured"]);
    expect(tags({ ...base, status: "s" }, ctx())).toEqual(["Suspended"]);
    expect(tags({ ...base, status: "u" }, ctx())).toEqual(["Unavailable"]);
    expect(tags(base, ctx())).toEqual([]);
  });

  it("shows claim only for locked Players, but only before waivers are processed", () => {
    const locked = new Set([base.id]);
    expect(tags(base, ctx({ locked, phase: "waivers" }))).toEqual(["Claim only"]);
    expect(tags(base, ctx({ locked, phase: "processing" }))).toEqual(["Claim only"]);
    expect(tags(base, ctx({ locked, phase: "free" }))).toEqual([]);
    expect(tags(base, ctx({ locked, phase: null }))).toEqual([]);
  });

  it("shows protected only for the Players it's given (the Claimed Manager's)", () => {
    expect(tags(base, ctx({ protectedIds: new Set([base.id]) }))).toEqual(["Protected"]);
    expect(tags({ ...base, status: "i" }, ctx({ protectedIds: new Set([base.id]) }))).toEqual(["Injured", "Protected"]);
  });
});
