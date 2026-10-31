import { describe, expect, it } from "vitest";
import { readClaim, writeClaim } from "./claim";

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

describe("claim storage", () => {
  it("remembers a claim separately for each League", () => {
    const s = memory();
    writeClaim(s, 5000, 111);
    writeClaim(s, 130000, 222);
    expect(readClaim(s, 5000)).toBe(111);
    expect(readClaim(s, 130000)).toBe(222);
    expect(readClaim(s, 1)).toBeNull();
  });

  it("can change and clear a claim", () => {
    const s = memory();
    writeClaim(s, 5000, 111);
    writeClaim(s, 5000, 333);
    expect(readClaim(s, 5000)).toBe(333);
    writeClaim(s, 5000, null);
    expect(readClaim(s, 5000)).toBeNull();
  });

  it("ignores junk and copes without storage", () => {
    const s = memory();
    s.setItem("outdraft.claim.5000", "not a number");
    expect(readClaim(s, 5000)).toBeNull();
    expect(readClaim(null, 5000)).toBeNull();
    expect(() => writeClaim(null, 5000, 1)).not.toThrow();
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => {} };
    expect(readClaim(broken, 5000)).toBeNull();
    expect(() => writeClaim(broken, 5000, 1)).not.toThrow();
  });
});
