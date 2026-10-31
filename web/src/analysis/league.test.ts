import { describe, expect, it } from "vitest";
import classicDetails from "../../tests/fixtures/classic-details.json";
import classicStatus from "../../tests/fixtures/classic-element-status.json";
import h2hDetails from "../../tests/fixtures/h2h-details.json";
import h2hStatus from "../../tests/fixtures/h2h-element-status.json";
import projectionsJson from "../../tests/fixtures/projections.json";
import type { ElementStatus, LeagueDetails, Projections } from "../types";
import { bestXI, DRAFT_SQUAD_RULES, type Candidate } from "./bestXI";
import { analyseLeague } from "./league";

const projections = projectionsJson as unknown as Projections;
const position = new Map(projections.players.map((p) => [p.id, p.position]));
const leagues = {
  classic: analyseLeague(classicDetails as LeagueDetails, classicStatus as ElementStatus, projections),
  h2h: analyseLeague(h2hDetails as LeagueDetails, h2hStatus as ElementStatus, projections),
};

function formation(ids: number[]) {
  const n = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<number, number>;
  ids.forEach((id) => n[position.get(id)!]++);
  return n;
}

describe.each(Object.entries(leagues))("%s League", (_, league) => {
  it("gives every Manager the 15-Player Squad they own (owners are entry ids)", () => {
    expect(league.drafted).toBe(true);
    expect(league.managers).toHaveLength(8);
    for (const m of league.managers) expect(m.squad).toHaveLength(15);
    expect(new Set(league.managers.flatMap((m) => m.squad)).size).toBe(120);
  });

  it("fields a valid Best XI from the Squad for every gameweek", () => {
    for (const m of league.managers) {
      for (const xi of m.bestXIs) {
        expect(xi.ids).toHaveLength(11);
        expect(xi.ids.every((id) => m.squad.includes(id))).toBe(true);
        const f = formation(xi.ids);
        for (const p of [1, 2, 3, 4]) {
          expect(f[p]).toBeGreaterThanOrEqual(DRAFT_SQUAD_RULES.min_play[p]);
          expect(f[p]).toBeLessThanOrEqual(DRAFT_SQUAD_RULES.max_play[p]);
        }
      }
    }
  });

  it("never benches a Player who beats a starter in the same position", () => {
    const pts = new Map(projections.players.map((p) => [p.id, p.projections]));
    for (const m of league.managers) {
      m.bestXIs.forEach((xi, gw) => {
        const bench = m.squad.filter((id) => !xi.ids.includes(id));
        for (const b of bench) {
          for (const s of xi.ids.filter((id) => position.get(id) === position.get(b))) {
            expect(pts.get(b)![gw]).toBeLessThanOrEqual(pts.get(s)![gw]);
          }
        }
      });
    }
  });

  it("sums Best XI totals into Squad strength for 1, 3 and 6 gameweeks", () => {
    for (const m of league.managers) {
      const totals = m.bestXIs.map((xi) => xi.total);
      expect(m.strength[1]).toBeCloseTo(totals[0]);
      expect(m.strength[3]).toBeCloseTo(totals[0] + totals[1] + totals[2]);
      expect(m.strength[6]).toBeCloseTo(totals.reduce((a, b) => a + b, 0));
      expect(m.strength[1]).toBeGreaterThan(0);
    }
  });

  it("lists Managers in League table order", () => {
    const ranks = league.managers.map((m) => m.table.rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});

it("reads the League format and its table columns", () => {
  expect(leagues.classic.format).toBe("classic");
  expect(leagues.classic.managers[0].table.gameweekPoints).toBeTypeOf("number");
  expect(leagues.h2h.format).toBe("h2h");
  const top = leagues.h2h.managers[0].table;
  expect(top.won).toBeTypeOf("number");
  expect(top.pointsFor).toBeTypeOf("number");
});

it("reports a League that hasn't drafted", () => {
  const empty = { element_status: classicStatus.element_status.map((e) => ({ ...e, owner: null })) };
  const league = analyseLeague(classicDetails as LeagueDetails, empty, projections);
  expect(league.drafted).toBe(false);
  expect(league.managers.every((m) => m.strength[6] === 0)).toBe(true);
});

it("ignores owned Players that have no Projection yet", () => {
  const status = { element_status: [...classicStatus.element_status, { element: 99999, owner: classicDetails.league_entries[0].entry_id, status: "o", in_accepted_trade: false }] };
  const league = analyseLeague(classicDetails as LeagueDetails, status, projections);
  const m = league.managers.find((x) => x.entryId === classicDetails.league_entries[0].entry_id)!;
  expect(m.squad).toContain(99999);
  expect(m.bestXIs[0].ids).not.toContain(99999);
});

describe("bestXI", () => {
  const squad = (spec: [number, number][]): Candidate[] =>
    spec.map(([position, points], i) => ({ id: i + 1, position: position as Candidate["position"], points }));

  it("picks the formation with the highest total", () => {
    // 2 GKP, 5 DEF, 5 MID, 3 FWD: strong forwards should push to 3-4-3 or 3-5-2.
    const xi = bestXI(squad([[1, 5], [1, 1], [2, 2], [2, 2], [2, 2], [2, 1], [2, 1], [3, 4], [3, 4], [3, 4], [3, 4], [3, 1], [4, 9], [4, 9], [4, 9]]));
    expect(xi.total).toBe(5 + 2 * 3 + 4 * 4 + 9 * 3);
  });

  it("starts the top 11 when a Squad can't field a valid formation", () => {
    const xi = bestXI(squad([[2, 3], [2, 3], [2, 3], [2, 3], [2, 3], [3, 2], [3, 2], [3, 2], [3, 2], [3, 2], [3, 1], [3, 1]]));
    expect(xi.ids).toHaveLength(11);
    expect(xi.total).toBe(5 * 3 + 5 * 2 + 1);
  });
});
