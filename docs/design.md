# Outdraft design brief

The agreed look is **"Matchday programme"**: the app should feel like a printed football matchday programme, not a generic dashboard. Domain terms follow CONTEXT.md.

## 1. Navigation (agreed)

Phone-first. A **bottom tab bar with five tabs**, no top pill tabs:

| Tab | Contents |
|---|---|
| **League** (home) | League table, this gameweek's Matchups with Win probabilities, Squad strength ranking, season statistics (section 4) |
| **Squad** | Squad of the Claimed Manager, or any Manager picked from a selector, as a team sheet |
| **Targets** | Waiver targets with Rival interest, then the full Free agent table (search, position filter, compare two Players) |
| **Trades** | Win-win trades. Hidden when the League has trades switched off; Fixtures takes its slot |
| **More** | Fixtures ticker, Model check, calendar subscription, settings (switch League, change Claimed Manager) |

On wide screens the same structure may use a side or top nav, but the tab order and grouping stay the same.

## 2. Visual tokens

Square corners everywhere (border-radius 0). No gradients, no drop shadows, no emoji.

### Colours

| Token | Light | Dark | Use |
|---|---|---|---|
| paper | `#F4EFE6` | `#121418` | page background |
| card | `#FBF8F2` | `#1B1E24` | cards, tab bar |
| ink | `#16181D` | `#F1EBDF` | text, borders, rules |
| muted | `#5E5A52` | `#A8A196` | secondary text, labels |
| rule | `#D9D1C3` | `#2E323A` | thin dividers, bar tracks |
| highlight | `#EADFCC` | `#262A31` | Claimed Manager's table row |
| accent | `#B8321C` | `#E0563A` | the Claimed Manager, active tab, header stripe, key numbers |
| on-accent | `#FFFFFF` | `#121418` | text on accent |
| band | `#16181D` | `#0A0B0D` | header band background |
| band-ink | `#F4EFE6` | `#F1EBDF` | header band text |
| win | `#1F5FA8` | `#6FA3E0` | win share, positive gains |
| loss bar | `#D9822B` | `#E39A4B` | loss share (fills only) |
| loss text | `#9A4F06` | `#E39A4B` | loss labels |
| draw | `#B9B1A3` | `#5A5E66` | draw share |

Rules:
- **Never red against green** for good/bad. Win/loss is **blue/orange**.
- **No Premier League purple or green, no club crests.**
- Text contrast at least 4.5:1, including small grey labels.

### Position colours (charts only)

| Position | Light | Dark |
|---|---|---|
| GKP | `#D9A441` | `#E2B65E` |
| DEF | `#6B7A8F` | `#8E9BB0` |
| MID | `#1F5FA8` | `#6FA3E0` |
| FWD | `#9A4F06` | `#E39A4B` |

Segments must also carry a text label or legend; never rely on colour alone.

### Typography (Google Fonts)

| Role | Font | Notes |
|---|---|---|
| Display: screen titles, big numbers, ranks | **Anton** | uppercase for titles |
| Labels: section headers, tab labels, table headers, figures | **Barlow Condensed** 600/700 | uppercase, letter-spacing 0.08–0.12em |
| Body | **Barlow** 400–700 | 15–16px |

All numbers use `font-variant-numeric: tabular-nums` so columns align like a printed league table.

## 3. Components

- **Header band** (top of every screen): `band` background, small "OUTDRAFT" wordmark (Anton 18px, letter-spacing 0.08em) left, "Gameweek N" boxed label right; a small uppercase kicker line; screen title in Anton ~40px uppercase. Directly below: a **6px accent stripe**.
- **Section header**: 2px `ink` top rule, Barlow Condensed 700 uppercase ~17px title, optional muted note right-aligned.
- **Card**: `card` background, 1.5px `ink` border, 14–16px padding.
- **Bars**: flat rectangles on a `rule`-coloured track; the Claimed Manager's bar in `accent`, others in `ink`.
- **"YOU" tag**: accent background, on-accent text, Barlow Condensed 700 11px.
- **Segmented control** (e.g. 1 / 3 / 6 GW, Points / % share): joined buttons with a 1.5px ink border; selected = ink fill with paper text.
- **Bottom tab bar**: five equal cells, 2px ink top border, `card` background, icon (24px stroke) above an uppercase Barlow Condensed label; active tab in `accent`. Touch targets at least 44px.
- **Squad as a team sheet**: grouped by position (accent uppercase group label), each row = shirt-style number (Anton, muted), Player name, "club · fixture" in muted, Projection right-aligned.

## 4. Statistics that must be kept (parity with the Termux dashboard)

Everything the old dashboard showed must exist in the app:

**League screen, "Season" section**
- **Rank over time**: one line per Manager across gameweeks. Claimed Manager's line in accent and thicker; all others in a muted tone; tapping a Manager in the legend highlights their line.
- **Points per gameweek**: bars for the Claimed Manager, a line for the League average, a dot for the gameweek's best score.
- **Season points by position**: one stacked horizontal bar per Manager (GKP/DEF/MID/FWD), toggle **Points / % share**, top 3 scorers listed under each bar.
- **Transaction log**: waivers, free-agent moves and Trades, newest first.

**Every screen**
- Header shows when the data was last updated and which Model settings are in use.
- **Status tags** on Players wherever they appear: doubt, injured, suspended, unavailable; plus "claim only" (a Player who can only be acquired through waivers right now).

**Squad screen**
- Per Player: Projection, xG + xA per 90, starts in the last 6 (e.g. 5/6), last 6 scores as mini bars, next 3 Fixtures as chips (home in capitals, away in lower case, with the difficulty number).
- Each Player marked as in the Best XI or on the bench.
- **Points left on bench**, per gameweek and for the season.

**Targets screen**
- The heading follows the phase: **Waiver targets** (claims are ranked; lower ones are backups) before the Waiver deadline, **Free-agent targets** (first come, first served) after waivers are processed.
- Each target shows the Player to claim, the Player to drop and the gain in Squad strength.
- Tap a target to compare it side by side with the Player you'd drop: Projection, xG + xA per 90, minutes, starts in the last 6, season points, last 6 scores and Fixtures, plus your Best XI after the swap.
- Free agent table: search, position filter, sort by Projection, xG + xA, minutes or points, and "compare any two Players", including Players owned by rivals (useful before proposing a Trade).

**More**
- **Fixtures ticker**: next 6 gameweeks, colour-coded difficulty, separate attacker and defender views, clubs sorted easiest run first.
- **Model check**: how Snapshots compared with actual points, gameweek by gameweek.

## 5. Reference

Mockups of League (light and dark), Squad, Targets and Trades exist as the "Outdraft screens" design canvas on claude.ai. This file is the written source of truth for implementation.
