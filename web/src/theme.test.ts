import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The design tokens live in styles.css (docs/design.md §2). This checks the
// text-on-background pairs the app uses meet 4.5:1 in light and dark.

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

function tokens(block: string) {
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
}
const light = tokens(css.slice(css.indexOf(":root {"), css.indexOf("@media (prefers-color-scheme: dark)")));
const dark = tokens(css.slice(css.indexOf("@media (prefers-color-scheme: dark)"), css.indexOf("/* ---------- base")));

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const TEXT_PAIRS: [string, string][] = [
  ["ink", "paper"], ["ink", "card"], ["ink", "highlight"],
  ["muted", "paper"], ["muted", "card"], ["muted", "highlight"],
  ["accent-text", "paper"], ["accent-text", "card"], ["on-accent", "accent"],
  ["band-ink", "band"], ["win", "card"], ["loss-text", "card"], ["paper", "ink"],
];

describe.each([["light", light], ["dark", dark]] as const)("%s theme", (_, t) => {
  it("defines every design token", () => {
    for (const k of ["paper", "card", "ink", "muted", "rule", "highlight", "accent", "on-accent", "band", "band-ink",
      "win", "loss-bar", "loss-text", "draw", "gkp", "def", "mid", "fwd"]) expect(t[k], k).toMatch(/^#/);
  });

  it.each(TEXT_PAIRS)("%s on %s reads at 4.5:1 or better", (fg, bg) => {
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it("uses accent for large numbers and fills, which need 3:1", () => {
    expect(contrast(t.accent, t.card)).toBeGreaterThanOrEqual(3);
    expect(contrast(t.accent, t.paper)).toBeGreaterThanOrEqual(3);
  });
});

it("matches the design brief's light and dark values", () => {
  expect(light.accent).toBe("#B8321C");
  expect(dark.accent).toBe("#E0563A");
  expect(light.win).toBe("#1F5FA8");
  expect(light["loss-bar"]).toBe("#D9822B");
});

it("never uses red or green as a colour pair in the stylesheet", () => {
  // The previous green theme and red error colours are gone.
  expect(css).not.toMatch(/#1f6f4a|#4fbf86|#b42318|#ff8a80/i);
});
