import { describe, expect, it } from "vitest";
import classicStatus from "../../tests/fixtures/classic-element-status.json";
import projectionsJson from "../../tests/fixtures/projections.json";
import type { ElementStatus, Projections } from "../types";
import { fold, freeAgents, SORTS, type SortKey } from "./freeAgents";

const projections = projectionsJson as unknown as Projections;
const status = classicStatus as ElementStatus;
const owned = new Set(status.element_status.filter((e) => e.owner != null).map((e) => e.element));

it("lists only Players in no Squad", () => {
  const rows = freeAgents(status, projections, { sort: "projection", horizon: 3 });
  expect(rows.length).toBe(projections.players.length - owned.size);
  expect(rows.every((r) => !owned.has(r.player.id))).toBe(true);
});

it("filters by position", () => {
  const rows = freeAgents(status, projections, { position: 1, sort: "projection", horizon: 3 });
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every((r) => r.player.position === 1)).toBe(true);
});

describe.each(Object.keys(SORTS) as SortKey[])("sorted by %s", (sort) => {
  it("puts the best first", () => {
    const rows = freeAgents(status, projections, { sort, horizon: 3 });
    const v = rows.map((r) => ({ projection: r.projection, xgi: r.xgi, minutes: r.player.minutes, points: r.player.total_points })[sort]);
    expect(v).toEqual([...v].sort((a, b) => b - a));
  });
});

it("sums Projections over the chosen horizon", () => {
  for (const h of [1, 3, 6]) {
    const top = freeAgents(status, projections, { sort: "projection", horizon: h })[0];
    expect(top.projection).toBeCloseTo(top.player.projections.slice(0, h).reduce((a, b) => a + b, 0));
  }
});

it("finds Players by any part of their name, ignoring case and accents", () => {
  const accented = projections.players.find((p) => /[^\x00-\x7f]/.test(p.name) && !owned.has(p.id));
  const target = accented ?? projections.players.find((p) => !owned.has(p.id))!;
  const rows = freeAgents(status, projections, { query: fold(target.name).toUpperCase(), sort: "projection", horizon: 3 });
  expect(rows.map((r) => r.player.id)).toContain(target.id);
  expect(fold("Jørgensen")).toBe("jorgensen");
  expect(fold("Jörgensen")).toBe("jorgensen");
  expect(freeAgents(status, projections, { query: "zzzz-nobody", sort: "projection", horizon: 3 })).toEqual([]);
});
