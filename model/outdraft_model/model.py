"""The v1 Model, ported from docs/fpl_draft.py.

How it rates Players
  - Underlying stats (xG, xA, team expected goals conceded) blended with actual
    points (big hauls capped), shrunk toward average when minutes are few.
  - Expected minutes from recent games (rotation risk).
  - Position-specific opponent strength: attackers vs opponent defence,
    defenders/keepers vs opponent attack, with home advantage.
  - The blend weight w and opponent effect k are tuned by backtest.

Changes from the script: Draft Player IDs and Draft fixtures only, and points
for goals and clean sheets come from the Draft scoring settings (a goalkeeper
goal is worth 10 in Draft, not 6).

Any replacement Model needs the same interface: build it from a Season and the
last finished gameweek, then call `projections(gws, params)`.
"""
import math

VERSION = 1

RECENT = 6               # gameweeks counted as "recent"
AVAIL_GWS = 4            # gameweeks used to estimate expected minutes
CAP = 10                 # one big haul counts as at most this many points
PRIOR_MIN = 270          # minutes of "average player" blended in (shrinkage)
PRIOR_PTS90 = 3.5        # that average player's points per 90
STRENGTH_PRIOR_GAMES = 3  # games of "average team" blended into team strength
HOME_ADV = 1.1           # home advantage factor

DEFAULT_PARAMS = {"w": 0.5, "k": 1.0}   # w = weight of xG model, k = opponent effect
GRID_W = [0.0, 0.25, 0.5, 0.75, 1.0]
GRID_K = [0.0, 1.0, 2.0]
BACKTEST_START = 4

POS_NAME = {1: "GKP", 2: "DEF", 3: "MID", 4: "FWD"}
UNAVAILABLE = ("i", "s", "u", "n")


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


def mean(xs):
    xs = list(xs)
    return sum(xs) / len(xs) if xs else 0.0


def pearson(a, b):
    n = len(a)
    if n < 3:
        return 0.0
    ma, mb = mean(a), mean(b)
    cov = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    va = sum((x - ma) ** 2 for x in a)
    vb = sum((y - mb) ** 2 for y in b)
    return cov / math.sqrt(va * vb) if va and vb else 0.0


class XgModel:
    def __init__(self, season, last):
        self.season = season
        self.last = last
        self.el = season.players
        sc = season.scoring
        self.goal_pts = {p: sc[f"goals_scored_{POS_NAME[p]}"] for p in POS_NAME}
        self.cs_pts = {p: sc[f"clean_sheets_{POS_NAME[p]}"] for p in POS_NAME}
        self.assist_pts = sc["assists"]

        # fixtures by team and gameweek: [(opp, is_home)]
        self.fx = {}
        for gw, lst in season.fixtures.items():
            for m in lst:
                h, a = m["team_h"], m["team_a"]
                self.fx.setdefault(h, {}).setdefault(gw, []).append((a, True))
                self.fx.setdefault(a, {}).setdefault(gw, []).append((h, False))

        # per-player history (index gw-1)
        keys = ("total_points", "minutes", "starts", "expected_goals",
                "expected_assists", "expected_goals_conceded")
        self.hist = {}
        for pid in self.el:
            h = {k: [] for k in keys}
            for gw in range(1, last + 1):
                s = season.live.get(gw, {}).get(pid, {})
                for k in keys:
                    h[k].append(num(s.get(k)))
            self.hist[pid] = h
        self.has_xg = any(any(h["expected_goals"]) for h in self.hist.values())

        # team expected goals conceded per gameweek (= max over its players that GW)
        self.team_xgc = {}
        for pid, h in self.hist.items():
            t = self.el[pid]["team"]
            arr = self.team_xgc.setdefault(t, [0.0] * last)
            for i in range(last):
                if h["minutes"][i] > 0:
                    arr[i] = max(arr[i], h["expected_goals_conceded"][i])

        # team expected goals scored per gameweek (= sum over its players)
        self.team_xg = {}
        for pid, h in self.hist.items():
            t = self.el[pid]["team"]
            arr = self.team_xg.setdefault(t, [0.0] * last)
            for i in range(last):
                arr[i] += h["expected_goals"][i]
        self._cache = {}
        self._str = {}

    def strengths(self, upto):
        """Team attack/defence from gameweeks 1..upto: {team: (att, dfn)}, 1.0 = average;
        dfn > 1 = leaky. Without xG data every team is average."""
        if upto in self._str:
            return self._str[upto]
        out = {}
        if self.has_xg and upto >= 1:
            raw = {}
            for t in self.season.teams:
                xg = xgc = 0.0
                games = 0
                for i in range(upto):
                    n = len(self.fx.get(t, {}).get(i + 1, []))
                    if n:
                        xg += self.team_xg.get(t, [0.0] * upto)[i]
                        xgc += self.team_xgc.get(t, [0.0] * upto)[i]
                        games += n
                raw[t] = (xg, xgc, games)
            tot_g = sum(g for _, _, g in raw.values()) or 1
            avg_xg = sum(x for x, _, _ in raw.values()) / tot_g or 1.3
            avg_xgc = sum(c for _, c, _ in raw.values()) / tot_g or 1.3
            for t, (xg, xgc, g) in raw.items():
                pg = STRENGTH_PRIOR_GAMES   # shrink small samples toward average
                att = (xg + avg_xg * pg) / (g + pg) / avg_xg
                dfn = (xgc + avg_xgc * pg) / (g + pg) / avg_xgc
                out[t] = (att, dfn)
        self._str[upto] = out
        return out

    def factors(self, opp, home, k, upto=None):
        """(attack ease, defence ease) for playing `opp`; 1.0 = average fixture."""
        att, dfn = self.strengths(self.last if upto is None else upto).get(opp, (1.0, 1.0))
        ha = HOME_ADV if home else 1 / HOME_ADV
        fa = (dfn * ha) ** k          # leaky opponent defence -> easier to score
        fd = (ha / att) ** k          # weak opponent attack  -> easier clean sheet
        return fa, fd

    def rates(self, pid, upto):
        """Player rates using gameweeks 1..upto only (None if he never played)."""
        key = (pid, upto)
        if key in self._cache:
            return self._cache[key]
        r = None
        h, e = self.hist[pid], self.el[pid]
        mins = h["minutes"][:upto]
        if upto > 0 and sum(mins) > 0:
            def per90(vals, ms, prior):
                return (sum(vals) + prior * PRIOR_MIN / 90) / (sum(ms) + PRIOR_MIN) * 90
            capped = [min(p, CAP) for p in h["total_points"][:upto]]
            season = per90(capped, mins, PRIOR_PTS90)
            recent = per90(capped[-RECENT:], mins[-RECENT:], PRIOR_PTS90)
            team = e["team"]
            txgc = []
            for i in range(upto):
                nfx = len(self.fx.get(team, {}).get(i + 1, []))
                if nfx:
                    txgc.append(self.team_xgc.get(team, [0.0] * upto)[i] / nfx)
            xgc_pm = mean(txgc) if txgc and any(txgc) else 1.3
            r = {
                "pos": e["element_type"],
                "team": team,
                "pts90": 0.5 * season + 0.5 * recent,
                "xg90": per90(h["expected_goals"][:upto], mins, 0),
                "xa90": per90(h["expected_assists"][:upto], mins, 0),
                "pcs": math.exp(-xgc_pm),
                "avail": mean(min(m, 90) for m in mins[-AVAIL_GWS:]) / 90,
            }
        self._cache[key] = r
        return r

    def fixture_value(self, r, opp, home, w, k, upto=None):
        fa, fd = self.factors(opp, home, k, upto)
        pos = r["pos"]
        att = self.goal_pts[pos] * r["xg90"] + self.assist_pts * r["xa90"]
        cs = self.cs_pts[pos] * r["pcs"]
        xmodel = 2 + att * fa + cs * fd
        mix = {1: fd, 2: fd, 3: 0.7 * fa + 0.3 * fd, 4: fa}[pos]
        pmodel = 2 + (r["pts90"] - 2) * mix
        if not self.has_xg:
            w = 0.0
        return r["avail"] * (w * xmodel + (1 - w) * pmodel)

    def value(self, pid, upto, gws, w, k):
        """Raw expected points over `gws` using data up to gameweek `upto`."""
        r = self.rates(pid, upto)
        if not r:
            return 0.0
        total = 0.0
        for gw in gws:
            for opp, home in self.fx.get(r["team"], {}).get(gw, []):
                total += self.fixture_value(r, opp, home, w, k, upto)
        return total

    def projections(self, gws, params):
        """{Player id: [Projection per gameweek in gws]}, with injury status applied."""
        w, k = params["w"], params["k"]
        out = {}
        for pid, e in self.el.items():
            st = e.get("status") or "a"
            if st in UNAVAILABLE:
                scale = 0.0
            elif st == "d":
                ch = e.get("chance_of_playing_next_round")
                scale = ch / 100 if isinstance(ch, (int, float)) else 0.5
            else:
                scale = 1.0
            out[pid] = [self.value(pid, self.last, [gw], w, k) * scale for gw in gws]
        return out

    def backtest(self):
        """Try each (w, k); return list of (corr, mae, n, w, k), best first."""
        out = []
        for w in GRID_W:
            for k in GRID_K:
                pred, act = [], []
                for t in range(BACKTEST_START, self.last + 1):
                    for pid, h in self.hist.items():
                        if sum(h["minutes"][:t - 1]) < 90:
                            continue
                        if not self.fx.get(self.el[pid]["team"], {}).get(t):
                            continue
                        pred.append(self.value(pid, t - 1, [t], w, k))
                        act.append(h["total_points"][t - 1])
                if pred:
                    mae = mean(abs(p - a) for p, a in zip(pred, act))
                    out.append((pearson(pred, act), mae, len(pred), w, k))
        out.sort(reverse=True)
        return out
