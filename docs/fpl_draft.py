#!/usr/bin/env python3
"""
FPL Draft helper v2: ranks waiver targets for YOUR league and YOUR squad.

How it rates players
  - Underlying stats (xG, xA, team expected goals conceded) AND actual points
    (big hauls capped), shrunk toward average when minutes are few.
  - Expected minutes from recent games (rotation risk).
  - Position-specific opponent strength: attackers vs opponent defence,
    defenders/keepers vs opponent attack.
  - Swaps are judged by how much they improve your best starting XI.
  - Optional backtest (--backtest) tunes the blend on this season's data.

- Uses only the official, public FPL APIs (read-only, no login, no password).
- Needs only Python 3 (no extra packages).

Usage:
  python fpl_draft.py              normal run
  python fpl_draft.py --backtest   force re-tuning now (also happens
                                   automatically every 3 gameweeks)
  python fpl_draft.py --notify     also send a phone notification (Termux:API)
  python fpl_draft.py --reset      forget saved team/league and ask again
"""
import json
import math
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

DRAFT = "https://draft.premierleague.com/api/"
CLASSIC = "https://fantasy.premierleague.com/api/"
CONFIG = os.path.expanduser("~/.fpl_draft.json")
HEADERS = {"User-Agent": "fpl-draft-helper/2.0 (personal script)"}

# ---- settings you can tweak
LOOKAHEAD = 3            # upcoming gameweeks valued
RECENT = 6               # gameweeks counted as "recent"
AVAIL_GWS = 4            # gameweeks used to estimate expected minutes
CAP = 10                 # one big haul counts as at most this many points
PRIOR_MIN = 270          # minutes of "average player" blended in (shrinkage)
PRIOR_PTS90 = 3.5        # that average player's points per 90
MIN_SHARE = 0.3          # free agents need >= 30% of possible season minutes
MIN_MINUTES_FLOOR = 180  # ...and at least this many minutes
TOP_PER_POSITION = 5     # free agents shown per position
CANDIDATES = 15          # free agents per position tested as swaps
TARGETS = 5              # waiver targets listed
MIN_GAIN = 0.5           # minimum XI improvement (points over LOOKAHEAD) to list
PROTECT_AVG = 4.5        # never drop a player with capped season avg >= this
PROTECT_RANK = 40        # ...or a top-40 pick in the draft rankings
NEWS_LEN = 45

DEFAULT_PARAMS = {"w": 0.5, "k": 1.0}   # w = weight of xG model, k = opponent effect
GRID_W = [0.0, 0.25, 0.5, 0.75, 1.0]
GRID_K = [0.0, 1.0, 2.0]
BACKTEST_START = 4
STRENGTH_PRIOR_GAMES = 3  # games of "average team" blended into team strength
HOME_ADV = 1.1           # home advantage factor
MODEL_VERSION = 3        # bumping this forces a re-tune
RETUNE_EVERY = 3         # re-run the backtest automatically every 3 gameweeks

GOAL_PTS = {1: 6, 2: 6, 3: 5, 4: 4}
CS_PTS = {1: 4, 2: 4, 3: 1, 4: 0}
POS = {1: "GKP", 2: "DEF", 3: "MID", 4: "FWD"}
FLAG = {"a": "", "d": "?", "i": "INJ", "s": "SUS", "u": "OUT", "n": "OUT"}


# ---------------------------------------------------------------- helpers
def get(url, required=True):
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        msg = f"HTTP {e.code} when loading {url}"
    except urllib.error.URLError as e:
        msg = f"Network problem when loading {url}: {e.reason}"
    except json.JSONDecodeError:
        msg = f"Unexpected (non-JSON) answer from {url}"
    if required:
        sys.exit("ERROR: " + msg)
    return None


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


# ---------------------------------------------------------------- config
def save_config(cfg):
    with open(CONFIG, "w") as fh:
        json.dump(cfg, fh)


def load_config():
    if "--reset" in sys.argv and os.path.exists(CONFIG):
        os.remove(CONFIG)
    if os.path.exists(CONFIG):
        with open(CONFIG) as fh:
            return json.load(fh)

    print("First-time setup")
    print("Your team ID is the number in the Draft website URL: .../entry/<ID>/...")
    entry_id = input("Your Draft team ID: ").strip()
    league_id = None
    public = get(f"{DRAFT}entry/{entry_id}/public", required=False)
    if public:
        leagues = (public.get("entry") or {}).get("league_set") or []
        if len(leagues) == 1:
            league_id = leagues[0]
            print(f"Found your league: {league_id}")
        elif leagues:
            print("You are in these leagues:", ", ".join(map(str, leagues)))
    if league_id is None:
        league_id = input("League ID: ").strip()
    cfg = {"entry_id": int(entry_id), "league_id": int(league_id)}
    save_config(cfg)
    print(f"Saved to {CONFIG}\n")
    return cfg


# ---------------------------------------------------------------- model
class Model:
    def __init__(self, classic_boot, fixtures, live, last):
        self.last = last
        self.el = {e["id"]: e for e in classic_boot["elements"]}
        self.teams = {t["id"]: t for t in classic_boot["teams"]}
        self.short = {t["id"]: t["short_name"] for t in classic_boot["teams"]}

        # fixtures by team and gameweek: [(opp, is_home, fdr)]
        self.fx = {}
        for m in fixtures:
            gw = m.get("event")
            if not gw:
                continue
            h, a = m["team_h"], m["team_a"]
            self.fx.setdefault(h, {}).setdefault(gw, []).append((a, True, m.get("team_h_difficulty", 3)))
            self.fx.setdefault(a, {}).setdefault(gw, []).append((h, False, m.get("team_a_difficulty", 3)))

        # per-player history (index gw-1)
        keys = ("total_points", "minutes", "starts", "expected_goals",
                "expected_assists", "expected_goals_conceded")
        self.hist = {}
        for cid in self.el:
            h = {k: [] for k in keys}
            for gw in range(1, last + 1):
                s = live.get(gw, {}).get(cid, {})
                for k in keys:
                    h[k].append(num(s.get(k)))
            self.hist[cid] = h
        self.has_xg = any(any(h["expected_goals"]) for h in self.hist.values())

        # team expected goals conceded per gameweek (= max over its players that GW)
        self.team_xgc = {}
        for cid, h in self.hist.items():
            t = self.el[cid]["team"]
            arr = self.team_xgc.setdefault(t, [0.0] * last)
            for i in range(last):
                if h["minutes"][i] > 0:
                    arr[i] = max(arr[i], h["expected_goals_conceded"][i])

        # team expected goals scored per gameweek (= sum over its players)
        self.team_xg = {}
        for cid, h in self.hist.items():
            t = self.el[cid]["team"]
            arr = self.team_xg.setdefault(t, [0.0] * last)
            for i in range(last):
                arr[i] += h["expected_goals"][i]
        self._cache = {}
        self._str = {}

    def strengths(self, upto):
        """Team attack/defence from this season's data (gameweeks 1..upto).
        Uses expected goals if available, else FPL's 1-5 difficulty ratings.
        Returns {team: (att, dfn)} where 1.0 = league average; dfn > 1 = leaky."""
        if upto in self._str:
            return self._str[upto]
        out = {}
        if self.has_xg and upto >= 1:
            raw = {}
            for t in self.teams:
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
        else:
            # fallback: FPL difficulty that each team causes its opponents
            for t in self.teams:
                d = []
                for gw_fx in self.fx.values():
                    for gw, lst in gw_fx.items():
                        d += [fdr for opp, _, fdr in lst if opp == t]
                lvl = mean(d) if d else 3.0
                out[t] = (lvl / 3.0, 3.0 / lvl)
        self._str[upto] = out
        return out

    def factors(self, opp, home, k, upto=None):
        """(attack ease, defence ease) for playing `opp`; 1.0 = average fixture."""
        att, dfn = self.strengths(self.last if upto is None else upto).get(opp, (1.0, 1.0))
        ha = HOME_ADV if home else 1 / HOME_ADV
        fa = (dfn * ha) ** k          # leaky opponent defence -> easier to score
        fd = (ha / att) ** k          # weak opponent attack  -> easier clean sheet
        return fa, fd

    def rates(self, cid, upto):
        """Player rates using gameweeks 1..upto only (None if he never played)."""
        key = (cid, upto)
        if key in self._cache:
            return self._cache[key]
        r = None
        h, e = self.hist[cid], self.el[cid]
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
        att = GOAL_PTS[pos] * r["xg90"] + 3 * r["xa90"]
        cs = CS_PTS[pos] * r["pcs"]
        xmodel = 2 + att * fa + cs * fd
        mix = {1: fd, 2: fd, 3: 0.7 * fa + 0.3 * fd, 4: fa}[pos]
        pmodel = 2 + (r["pts90"] - 2) * mix
        if not self.has_xg:
            w = 0.0
        return r["avail"] * (w * xmodel + (1 - w) * pmodel)

    def value(self, cid, upto, gws, w, k):
        r = self.rates(cid, upto)
        if not r:
            return 0.0
        total = 0.0
        for gw in gws:
            for opp, home, _ in self.fx.get(r["team"], {}).get(gw, []):
                total += self.fixture_value(r, opp, home, w, k, upto)
        return total

    def backtest(self):
        """Try each (w, k); return list of (corr, mae, n, w, k), best first."""
        out = []
        for w in GRID_W:
            for k in GRID_K:
                pred, act = [], []
                for t in range(BACKTEST_START, self.last + 1):
                    for cid, h in self.hist.items():
                        if sum(h["minutes"][:t - 1]) < 90:
                            continue
                        team = self.el[cid]["team"]
                        if not self.fx.get(team, {}).get(t):
                            continue
                        pred.append(self.value(cid, t - 1, [t], w, k))
                        act.append(h["total_points"][t - 1])
                if pred:
                    mae = mean(abs(p - a) for p, a in zip(pred, act))
                    out.append((pearson(pred, act), mae, len(pred), w, k))
        out.sort(reverse=True)
        return out


def best_xi(squad):
    """squad: list of (cid, pos, value). Returns (best XI total, set of cids)."""
    by = {1: [], 2: [], 3: [], 4: []}
    for cid, pos, v in squad:
        by[pos].append((v, cid))
    for p in by:
        by[p].sort(reverse=True)
    best, best_set = -1.0, set()
    for d in range(3, 6):
        for m in range(2, 6):
            f = 10 - d - m
            if not 1 <= f <= 3:
                continue
            need = {1: 1, 2: d, 3: m, 4: f}
            if any(len(by[p]) < need[p] for p in need):
                continue
            chosen = [x for p in need for x in by[p][:need[p]]]
            total = sum(v for v, _ in chosen)
            if total > best:
                best, best_set = total, {c for _, c in chosen}
    if best < 0:   # incomplete squad: just take the top 11
        allp = sorted((x for p in by for x in by[p]), reverse=True)[:11]
        best, best_set = sum(v for v, _ in allp), {c for _, c in allp}
    return best, best_set


# ---------------------------------------------------------------- output
def fixture_text(model, team, gws):
    parts = []
    for gw in gws:
        for opp, home, fdr in model.fx.get(team, {}).get(gw, []):
            s = model.short.get(opp, "?")
            parts.append((s.upper() if home else s.lower()) + str(fdr))
    return " ".join(parts) or "-"


def line(model, cid, val, gws, extra=""):
    e = model.el[cid]
    h = model.hist[cid]
    r = model.rates(cid, model.last) or {"xg90": 0, "xa90": 0}
    flag = FLAG.get(e.get("status", "a"), "")
    name = (e.get("web_name") or "?")[:12]
    st = int(sum(h["starts"][-RECENT:]))
    n = min(RECENT, model.last)
    out = (f"{name:<12} {model.short.get(e['team'], '?'):<3} xp{val:>5.1f} "
           f"xgi{r['xg90'] + r['xa90']:.2f} st{st}/{n} {flag}{extra}\n"
           f"    {fixture_text(model, e['team'], gws)}")
    last = [int(x) for x in h["total_points"][-RECENT:]]
    if last:
        out += "  | last: " + " ".join(map(str, last))
    news = (e.get("news") or "").strip()
    if news:
        out += f"\n    ! {news[:NEWS_LEN]}"
    return out


# ---------------------------------------------------------------- main
def main():
    cfg = load_config()
    lid = cfg["league_id"]

    print("Loading data...", flush=True)
    draft_boot = get(DRAFT + "bootstrap-static")
    league = get(f"{DRAFT}league/{lid}/details")
    status = get(f"{DRAFT}league/{lid}/element-status")
    trans = get(f"{DRAFT}draft/league/{lid}/transactions", required=False)
    classic_boot = get(CLASSIC + "bootstrap-static/")
    fixtures = get(CLASSIC + "fixtures/")

    events = classic_boot.get("events", [])
    nxt = next((e["id"] for e in events if e.get("is_next")), None)
    if nxt is None:
        nxt = next((e["id"] for e in events if e.get("is_current")), 0) + 1
    last = max((e["id"] for e in events if e.get("finished")), default=nxt - 1)
    last = min(last, nxt - 1)
    gws = list(range(nxt, nxt + LOOKAHEAD))

    print(f"Loading {last} gameweeks of history...", flush=True)
    live = {}
    for gw in range(1, last + 1):
        d = get(f"{CLASSIC}event/{gw}/live/", required=False)
        if not d:
            continue
        els = d.get("elements")
        items = els.items() if isinstance(els, dict) else ((e.get("id"), e) for e in (els or []))
        live[gw] = {int(i): (e.get("stats") or {}) for i, e in items
                    if isinstance(e.get("stats"), dict)}

    model = Model(classic_boot, fixtures, live, last)

    # ---- map Draft player IDs -> Classic player IDs (same real player)
    by_code = {e.get("code"): e["id"] for e in classic_boot["elements"] if e.get("code")}
    draft_team_short = {t["id"]: t["short_name"] for t in draft_boot["teams"]}
    by_name = {(e["web_name"], model.short.get(e["team"])): e["id"] for e in classic_boot["elements"]}
    d2c, draft_rank = {}, {}
    for de in draft_boot.get("elements", []):
        cid = by_code.get(de.get("code")) or by_name.get((de.get("web_name"), draft_team_short.get(de.get("team"))))
        if cid:
            d2c[de["id"]] = cid
            draft_rank[cid] = de.get("draft_rank")

    # ---- params (tuned by backtest if available)
    params = cfg.get("params", DEFAULT_PARAMS)
    tuned_at = params.get("tuned_at", 0)
    due = last >= BACKTEST_START and (last - tuned_at >= RETUNE_EVERY
                                      or params.get("v") != MODEL_VERSION)
    if "--backtest" in sys.argv or due:
        if due and "--backtest" not in sys.argv:
            print(f"Auto re-tuning (last tuned after GW{tuned_at})...", flush=True)
        print("Backtesting...", flush=True)
        res = model.backtest()
        if res:
            print("\nBACKTEST (predict each GW from earlier GWs)")
            print(" corr   MAE    w     k")
            for corr, mae, n, w, k in res[:6]:
                print(f" {corr:5.3f} {mae:5.2f}  {w:4.2f}  {k:3.1f}")
            corr, mae, n, w, k = res[0]
            params = {"w": w, "k": k, "corr": round(corr, 3), "n": n,
                      "gws": f"{BACKTEST_START}-{last}", "tuned_at": last,
                      "v": MODEL_VERSION}
            cfg["params"] = params
            save_config(cfg)
            print(f"Saved best: w={w} k={k} ({n} predictions)\n")
        else:
            print("Not enough gameweeks yet to backtest.\n")
    w, k = params["w"], params["k"]

    # ---- league, ownership, my squad
    league_name = (league.get("league") or {}).get("name", f"League {lid}")
    my_team_name = next((le.get("entry_name") for le in league.get("league_entries", [])
                         if le.get("entry_id") == cfg["entry_id"]), "?")
    owned, waiver = set(), set()
    for es in status.get("element_status", []):
        cid = d2c.get(es.get("element"))
        if not cid:
            continue
        if es.get("owner"):
            owned.add(cid)
        elif es.get("status") == "w":
            waiver.add(cid)

    # Players dropped by anyone for the coming gameweek sit on waivers until the
    # next waiver round, even if the ownership list doesn't flag them.
    trans_ok = isinstance(trans, dict) and isinstance(trans.get("transactions"), list)
    if trans_ok:
        for t in trans["transactions"]:
            if t.get("result") == "a" and t.get("event") == nxt:
                cid = d2c.get(t.get("element_out"))
                if cid and cid not in owned:
                    waiver.add(cid)

    ev = draft_boot.get("events")
    gw_candidates = [ev.get("current"), ev.get("next")] if isinstance(ev, dict) else [last, nxt]
    mine = set()
    for gw in gw_candidates:
        if not gw:
            continue
        picks = get(f"{DRAFT}entry/{cfg['entry_id']}/event/{gw}", required=False)
        if picks and picks.get("picks"):
            mine = {d2c[pk["element"]] for pk in picks["picks"] if pk["element"] in d2c}
            break

    # Gameweek picks lag behind waivers/free-agent moves. The live ownership list
    # is current, so find which owner value is "me" (the owner of most of my
    # picks) and take my squad from there.
    if mine:
        owner_of = {}
        for es in status.get("element_status", []):
            cid = d2c.get(es.get("element"))
            if cid and es.get("owner"):
                owner_of[cid] = es["owner"]
        votes = {}
        for c in mine:
            o = owner_of.get(c)
            if o is not None:
                votes[o] = votes.get(o, 0) + 1
        if votes:
            me, n_votes = max(votes.items(), key=lambda kv: kv[1])
            if n_votes >= len(mine) * 0.6:
                live_squad = {c for c, o in owner_of.items() if o == me}
                if len(live_squad) >= 11:
                    mine = live_squad
    if not mine:
        print("Could not load your squad. Run again with --reset and check your team ID.")
        return

    # ---- values over the next gameweeks (with injury status)
    def live_value(cid):
        e = model.el[cid]
        st = e.get("status", "a")
        if st in ("i", "s", "u", "n"):
            return 0.0
        v = model.value(cid, last, gws, w, k)
        if st == "d":
            ch = e.get("chance_of_playing_next_round")
            v *= (ch / 100) if isinstance(ch, (int, float)) else 0.5
        return v

    val = {cid: live_value(cid) for cid in d2c.values()}

    def season_avg(cid):
        return mean(min(p, CAP) for p in model.hist[cid]["total_points"]) if last else 0.0

    def protected(cid):
        rk = draft_rank.get(cid)
        return season_avg(cid) >= PROTECT_AVG or (isinstance(rk, (int, float)) and 0 < rk <= PROTECT_RANK)

    min_minutes = max(MIN_MINUTES_FLOOR, MIN_SHARE * 90 * max(last, 1))
    # Waivers or free agency? Look for the next gameweek's waiver deadline.
    phase = None
    ev_data = ev.get("data") if isinstance(ev, dict) else None
    for e in ev_data or []:
        if e.get("id") == nxt and e.get("waivers_time"):
            try:
                wt = datetime.fromisoformat(e["waivers_time"].replace("Z", "+00:00"))
                phase = "waivers" if datetime.now(timezone.utc) < wt else "free"
            except ValueError:
                pass

    # After the waiver round, players on waivers (e.g. just dropped) are locked
    # until the next waiver round, so they can't be signed as free agents.
    free = [cid for cid in set(d2c.values())
            if cid not in owned and cid not in mine
            and not (phase == "free" and cid in waiver)
            and sum(model.hist[cid]["minutes"]) >= min_minutes]

    squad = [(c, model.el[c]["element_type"], val[c]) for c in mine]
    cur_total, cur_xi = best_xi(squad)

    # ---- transfer targets: improvement of your best XI
    targets = []
    for pos in (1, 2, 3, 4):
        cands = sorted((c for c in free if model.el[c]["element_type"] == pos), key=lambda c: -val[c])[:CANDIDATES]
        drops = [c for c in mine if model.el[c]["element_type"] == pos and not protected(c)]
        for c in cands:
            best_gain, best_drop = 0.0, None
            for d in drops:
                new = [x for x in squad if x[0] != d] + [(c, pos, val[c])]
                g = best_xi(new)[0] - cur_total
                if g > best_gain:
                    best_gain, best_drop = g, d
            if best_drop and best_gain >= MIN_GAIN:
                targets.append((best_gain, c, best_drop))
    targets.sort(reverse=True)

    src = (f"tuned GW{params['gws']}, corr {params['corr']}" if "corr" in params
           else "default - run with --backtest to tune")

    if "--html" in sys.argv:
        ctx = dict(cfg=cfg, lid=lid, league=league, status=status, trans=trans if trans_ok else None,
                   model=model, d2c=d2c, val=val, mine=mine, cur_xi=cur_xi, cur_total=cur_total,
                   squad=squad, free=free, waiver=waiver, targets=targets, phase=phase,
                   protected=protected, gws=gws, nxt=nxt, last=last, w=w, k=k, src=src,
                   league_name=league_name, my_team_name=my_team_name)
        write_dashboard(ctx)
        return

    # ---- text report
    print(f"=== {league_name} | {my_team_name} | GW{gws[0]}-{gws[-1]} ===")
    print(f"Model: xG weight {w}, opponent effect {k} ({src})")
    if not model.has_xg:
        print("(No xG data found - using capped points only)")
    if not trans_ok:
        print("(Transfer list unavailable - recently dropped players may show as free)")
    print("xp=expected pts next GWs  xgi=xG+xA per 90")
    print("st=starts in last GWs  XI=in your best XI  *=protected")
    print("Fixtures: CAPS=home, lower=away, FPL difficulty 1-5\n")

    print(f"YOUR SQUAD (best XI: {cur_total:.1f} xp)")
    for pos in (1, 2, 3, 4):
        group = sorted((c for c in mine if model.el[c]["element_type"] == pos), key=lambda c: -val[c])
        if group:
            print(f"-- {POS[pos]}")
            for c in group:
                tags = (" XI" if c in cur_xi else "") + (" *" if protected(c) else "")
                print(line(model, c, val[c], gws, tags))
    print()

    print("BEST FREE AGENTS")
    for pos in (1, 2, 3, 4):
        group = sorted((c for c in free if model.el[c]["element_type"] == pos), key=lambda c: -val[c])
        print(f"-- {POS[pos]}")
        for c in group[:TOP_PER_POSITION]:
            print(line(model, c, val[c], gws, " (waivers)" if c in waiver else ""))
    print()

    if phase == "waivers":
        print(f"WAIVER TARGETS (ranked, XI gain over {LOOKAHEAD} GWs)")
    elif phase == "free":
        print(f"FREE AGENT TARGETS (waivers done - sign now, first come first served)")
    else:
        print(f"TARGETS (ranked, XI gain over {LOOKAHEAD} GWs)")
        print(" Before the waiver deadline: claim. After it: sign as free agents.")
    lines = []
    if targets:
        for i, (g, c, d) in enumerate(targets[:TARGETS], 1):
            why = " [injury/doubt]" if model.el[d].get("status", "a") != "a" else ""
            lock = " (waiver claim only)" if c in waiver else ""
            s = (f"{i}. {model.el[c]['web_name']} ({POS[model.el[c]['element_type']]}) "
                 f"for {model.el[d]['web_name']}: +{g:.1f}{why}{lock}")
            lines.append(s)
            print(" " + s)
        if phase != "free":
            print(" Lower picks = backups if earlier ones are taken.")
        print(" Check the news before dropping anyone.")
    else:
        print(" No clear upgrades right now.")

    if "--notify" in sys.argv and shutil.which("termux-notification"):
        body = "\n".join(lines[:3]) or "No clear upgrades right now."
        subprocess.run(["termux-notification", "--title", f"FPL Draft GW{gws[0]}", "--content", body])


# ---------------------------------------------------------------- dashboard
DASH_GWS = 6   # gameweeks shown in the fixture ticker


def _league_progress(ctx):
    """Return (entries, gw_points, rank_by_gw, h2h flag)."""
    league, cfg = ctx["league"], ctx["cfg"]
    les = league.get("league_entries", []) or []
    entries = {}
    for le in les:
        name = le.get("entry_name") or f"{le.get('player_first_name', '')} {le.get('player_last_name', '')}".strip()
        entries[le.get("id")] = {"id": le.get("id"), "entry_id": le.get("entry_id"), "name": name,
                                 "me": le.get("entry_id") == cfg["entry_id"]}
    scoring = (league.get("league") or {}).get("scoring")
    matches = league.get("matches") or []
    gw_points = {lid: {} for lid in entries}
    h2h = bool(matches) and scoring != "c"
    if h2h:
        for m in matches:
            if not m.get("finished"):
                continue
            ev = m.get("event")
            for a, b in (("league_entry_1", "league_entry_1_points"), ("league_entry_2", "league_entry_2_points")):
                if m.get(a) in gw_points:
                    gw_points[m[a]][ev] = num(m.get(b))
    else:
        for lid, e in entries.items():
            h = get(f"{DRAFT}entry/{e['entry_id']}/history", required=False) or {}
            for row in h.get("history", []) or []:
                if row.get("event"):
                    gw_points[lid][row["event"]] = num(row.get("points"))

    last = ctx["last"]
    rank_by_gw = {lid: [] for lid in entries}
    table = {lid: [0.0, 0.0] for lid in entries}   # [league pts, points for]
    for gw in range(1, last + 1):
        if h2h:
            for m in matches:
                if m.get("event") != gw or not m.get("finished"):
                    continue
                a, b = m.get("league_entry_1"), m.get("league_entry_2")
                pa, pb = num(m.get("league_entry_1_points")), num(m.get("league_entry_2_points"))
                for x, px, py in ((a, pa, pb), (b, pb, pa)):
                    if x in table:
                        table[x][0] += 3 if px > py else (1 if px == py else 0)
                        table[x][1] += px
        else:
            for lid in entries:
                table[lid][0] += gw_points[lid].get(gw, 0)
                table[lid][1] += gw_points[lid].get(gw, 0)
        order = sorted(entries, key=lambda x: (-table[x][0], -table[x][1]))
        for r, lid in enumerate(order, 1):
            rank_by_gw[lid].append(r)
    return entries, gw_points, rank_by_gw, h2h, table


def _bench_points(ctx):
    """Points left on your bench per gameweek (after auto-subs, where reported)."""
    model, d2c, cfg = ctx["model"], ctx["d2c"], ctx["cfg"]
    out = []
    for gw in range(1, ctx["last"] + 1):
        d = get(f"{DRAFT}entry/{cfg['entry_id']}/event/{gw}", required=False)
        if not d or not d.get("picks"):
            out.append(None)
            continue
        bench = {pk["element"] for pk in d["picks"] if pk.get("position", 0) > 11}
        for s in d.get("subs") or []:
            bench.discard(s.get("element_in"))
            if s.get("element_out"):
                bench.add(s["element_out"])
        pts = 0
        for de in bench:
            cid = d2c.get(de)
            if cid:
                pts += model.hist[cid]["total_points"][gw - 1]
        out.append(int(pts))
    return out


def _team_contrib(ctx, entries):
    """League points each team actually scored, split by position and by player.
    Counts only players in that team's starting XI (after auto-subs) each gameweek."""
    from concurrent.futures import ThreadPoolExecutor
    model, d2c = ctx["model"], ctx["d2c"]
    jobs = [(e, gw) for e in entries.values() for gw in range(1, ctx["last"] + 1)]

    def fetch(job):
        e, gw = job
        return e, gw, get(f"{DRAFT}entry/{e['entry_id']}/event/{gw}", required=False)

    with ThreadPoolExecutor(max_workers=8) as ex:
        results = list(ex.map(fetch, jobs))

    out = {}
    for e, gw, d in results:
        rec = out.setdefault(e["name"], {"pos": [0, 0, 0, 0], "players": {}, "gws": 0})
        if not d or not d.get("picks"):
            continue
        rec["gws"] += 1
        xi = {pk["element"] for pk in d["picks"] if pk.get("position", 99) <= 11}
        for sb in d.get("subs") or []:
            xi.discard(sb.get("element_out"))
            if sb.get("element_in"):
                xi.add(sb["element_in"])
        for de in xi:
            cid = d2c.get(de)
            if not cid:
                continue
            pts = int(model.hist[cid]["total_points"][gw - 1])
            rec["pos"][model.el[cid]["element_type"] - 1] += pts
            rec["players"][cid] = rec["players"].get(cid, 0) + pts
    return out


def write_dashboard(ctx):
    model, val, d2c = ctx["model"], ctx["val"], ctx["d2c"]
    gws, nxt, last = ctx["gws"], ctx["nxt"], ctx["last"]
    w, k = ctx["w"], ctx["k"]
    print("Building dashboard...", flush=True)

    entries, gw_points, rank_by_gw, h2h, table = _league_progress(ctx)

    # owner value -> team name (owner may be the league entry id or the entry id)
    owner_name = {}
    for e in entries.values():
        owner_name[e["id"]] = e["name"]
        owner_name[e["entry_id"]] = e["name"]
    owner_of = {}
    for es in ctx["status"].get("element_status", []):
        cid = d2c.get(es.get("element"))
        if cid and es.get("owner"):
            owner_of[cid] = owner_name.get(es["owner"], "Other team")

    # ---- players
    ticker_gws = list(range(nxt, nxt + DASH_GWS))
    players = {}
    relevant = {c for c in d2c.values() if sum(model.hist[c]["minutes"]) > 0} | ctx["mine"]
    for cid in relevant:
        e, h = model.el[cid], model.hist[cid]
        r = model.rates(cid, last) or {"xg90": 0, "xa90": 0, "avail": 0}
        fx = []
        for gw in ticker_gws:
            for opp, home, fdr in model.fx.get(e["team"], {}).get(gw, []):
                fx.append([gw, model.short.get(opp, "?"), 1 if home else 0, fdr])
        if cid in ctx["mine"]:
            own = "You"
        elif cid in owner_of:
            own = owner_of[cid]
        elif cid in ctx["waiver"]:
            own = "Waivers"
        else:
            own = "Free"
        players[cid] = {
            "id": cid, "n": e.get("web_name"), "t": model.short.get(e["team"], "?"),
            "p": e["element_type"], "xp": round(val.get(cid, 0), 2),
            "xg": round(r["xg90"], 2), "xa": round(r["xa90"], 2),
            "min": int(sum(h["minutes"])), "st": int(sum(h["starts"][-RECENT:])),
            "tot": int(sum(h["total_points"])), "last": [int(x) for x in h["total_points"][-RECENT:]],
            "news": (e.get("news") or "").strip(), "s": e.get("status", "a"),
            "own": own, "fx": fx, "free": cid in ctx["free"],
            "lock": cid in ctx["waiver"], "prot": bool(ctx["protected"](cid)) if cid in ctx["mine"] else False,
        }

    # ---- targets, with the resulting XI
    squad = ctx["squad"]
    tgt = []
    for g, c, d in ctx["targets"][:TARGETS * 2]:
        pos = model.el[c]["element_type"]
        new = [x for x in squad if x[0] != d] + [(c, pos, val[c])]
        tgt.append({"gain": round(g, 2), "in": c, "out": d, "xi": sorted(best_xi(new)[1])})

    # ---- fixture ticker
    ticker = []
    for tid, short in sorted(model.short.items(), key=lambda kv: kv[1]):
        row = {"t": short, "g": []}
        for gw in ticker_gws:
            cells = []
            for opp, home, fdr in model.fx.get(tid, {}).get(gw, []):
                fa, fd = model.factors(opp, home, 1)
                cells.append([model.short.get(opp, "?"), 1 if home else 0, round(fa, 3), round(fd, 3), fdr])
            row["g"].append(cells)
        ticker.append(row)

    # ---- points by position for current squads (season points of players held now)
    by_pos = {}
    for cid, p in players.items():
        team = "You" if p["own"] == "You" else (p["own"] if p["own"] in owner_name.values() else None)
        if not team:
            continue
        by_pos.setdefault(team, [0, 0, 0, 0])[p["p"] - 1] += p["tot"]
    my_name = next((e["name"] for e in entries.values() if e["me"]), ctx["my_team_name"])
    if "You" in by_pos:
        by_pos[my_name] = by_pos.pop("You")

    # ---- actual league points per team, by position, with top scorers
    print("Loading every team's lineups...", flush=True)
    contrib_raw = _team_contrib(ctx, entries)
    contrib = {}
    for team, rec in contrib_raw.items():
        if not rec["gws"]:
            continue
        top = sorted(rec["players"].items(), key=lambda kv: -kv[1])[:3]
        contrib[team] = {"pos": rec["pos"],
                         "top": [[model.el[c]["web_name"], p, owner_of.get(c) == team or
                                  (team == my_name and c in ctx["mine"])] for c, p in top]}

    # ---- transfers log
    tlog = []
    trans = ctx["trans"]
    if trans:
        for t in trans.get("transactions", []):
            if t.get("result") != "a":
                continue
            ci, co = d2c.get(t.get("element_in")), d2c.get(t.get("element_out"))
            tlog.append({"gw": t.get("event"), "kind": t.get("kind"),
                         "team": owner_name.get(t.get("entry"), "?"),
                         "in": model.el[ci]["web_name"] if ci else "?",
                         "out": model.el[co]["web_name"] if co else "?",
                         "at": (t.get("added") or "")[:10]})
        tlog.sort(key=lambda x: (x["gw"] or 0, x["at"]), reverse=True)

    # ---- model check: predicted vs actual, per finished gameweek
    mcheck = []
    for t in range(BACKTEST_START, last + 1):
        pred, act = [], []
        for cid, h in model.hist.items():
            if sum(h["minutes"][:t - 1]) < 90 or not model.fx.get(model.el[cid]["team"], {}).get(t):
                continue
            pred.append(model.value(cid, t - 1, [t], w, k))
            act.append(h["total_points"][t - 1])
        if pred:
            mcheck.append({"gw": t, "corr": round(pearson(pred, act), 3),
                           "mae": round(mean(abs(a - b) for a, b in zip(pred, act)), 2), "n": len(pred)})
    my_check = []
    if last >= 2:
        for cid in ctx["mine"]:
            if sum(model.hist[cid]["minutes"][:last - 1]) > 0:
                my_check.append({"n": model.el[cid]["web_name"],
                                 "pred": round(model.value(cid, last - 1, [last], w, k), 1),
                                 "act": int(model.hist[cid]["total_points"][last - 1])})
        my_check.sort(key=lambda x: -x["pred"])

    # ---- league summary
    league_rows = []
    for lid, e in entries.items():
        league_rows.append({"id": lid, "name": e["name"], "me": e["me"],
                            "pts": table[lid][0], "pf": table[lid][1],
                            "ranks": rank_by_gw[lid],
                            "gw": [gw_points[lid].get(gw) for gw in range(1, last + 1)]})
    league_rows.sort(key=lambda r: (-r["pts"], -r["pf"]))

    data = {
        "league": ctx["league_name"], "team": my_name, "gws": gws, "tickerGws": ticker_gws,
        "last": last, "phase": ctx["phase"], "lookahead": LOOKAHEAD,
        "model": {"w": w, "k": k, "src": ctx["src"]},
        "updated": datetime.now().strftime("%a %d %b %H:%M"),
        "players": players, "mine": sorted(ctx["mine"]), "xi": sorted(ctx["cur_xi"]),
        "xiTotal": round(ctx["cur_total"], 1), "targets": tgt, "ticker": ticker,
        "leagueRows": league_rows, "h2h": h2h, "byPos": by_pos, "transfers": tlog,
        "transOk": trans is not None, "bench": _bench_points(ctx), "contrib": contrib,
        "mcheck": mcheck, "myCheck": my_check,
    }

    html = DASH_HTML.replace("/*__DATA__*/null", json.dumps(data, separators=(",", ":")).replace("</", "<\\/"))
    dl = os.path.expanduser("~/storage/downloads")
    path = os.path.join(dl if os.path.isdir(dl) else os.path.expanduser("~"), "fpl_dashboard.html")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(html)
    print(f"Dashboard saved: {path}")
    open_dashboard(path)


def open_dashboard(path):
    """Serve the file on this phone only (127.0.0.1) and open it in the browser.
    Browsers can't read Termux's file links directly, so a tiny local server is used.
    It stops by itself once the page has loaded; the page keeps all its data."""
    import functools
    import http.server
    import threading
    import time
    opener = shutil.which("termux-open-url") or shutil.which("xdg-open")
    if not opener:
        print("Open the file above in your browser (e.g. from the Files app).")
        return
    served = threading.Event()

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a, **kw):
            pass

        def do_GET(self):
            super().do_GET()
            served.set()

    handler = functools.partial(Quiet, directory=os.path.dirname(path))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{srv.server_address[1]}/{os.path.basename(path)}"
    subprocess.run([opener, url])
    print("Opening in your browser...", flush=True)
    if served.wait(timeout=60):
        time.sleep(2)
        print("Done.")
    else:
        print("The browser didn't load the page within a minute. "
              "Open fpl_dashboard.html from your Downloads folder instead.")
    srv.shutdown()


DASH_HTML = r"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FPL Draft Dashboard</title>
<style>
:root{--bg:#f6f5f2;--card:#fff;--ink:#1d1d1f;--mute:#6e6e73;--line:#e3e1dc;--acc:#3b5bdb;--good:#2f9e44;--bad:#e03131;--warn:#e8590c;--chip:#efeeea}
@media (prefers-color-scheme:dark){:root{--bg:#141416;--card:#1e1e21;--ink:#ececee;--mute:#9a9aa1;--line:#2e2e33;--acc:#748ffc;--good:#51cf66;--bad:#ff6b6b;--warn:#ff922b;--chip:#29292d}}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{padding:16px 16px 6px}h1{font-size:19px;margin:0}header p{margin:2px 0 0;color:var(--mute);font-size:13px}
nav{position:sticky;top:0;z-index:5;background:var(--bg);display:flex;gap:6px;overflow-x:auto;padding:8px 16px;border-bottom:1px solid var(--line);scrollbar-width:none}
nav button{flex:0 0 auto;border:0;background:var(--chip);color:var(--ink);padding:7px 13px;border-radius:999px;font:inherit;font-size:14px}
nav button.on{background:var(--acc);color:#fff}
main{padding:12px 16px 40px;max-width:900px;margin:0 auto}section{display:none}section.on{display:block}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin:0 0 12px}
h2{font-size:16px;margin:4px 0 10px}h3{font-size:14px;margin:12px 0 6px;color:var(--mute);font-weight:600}
.muted{color:var(--mute);font-size:13px}.tag{display:inline-block;font-size:11px;padding:1px 7px;border-radius:999px;background:var(--chip);color:var(--mute);margin-left:4px;vertical-align:1px}
.tag.bad{background:color-mix(in srgb,var(--bad) 18%,transparent);color:var(--bad)}.tag.warn{background:color-mix(in srgb,var(--warn) 18%,transparent);color:var(--warn)}.tag.acc{background:color-mix(in srgb,var(--acc) 18%,transparent);color:var(--acc)}
.gain{font-weight:700;color:var(--good);font-variant-numeric:tabular-nums}
.tgt{cursor:pointer}.tgt .row1{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.cmp{display:none;margin-top:10px;border-top:1px solid var(--line);padding-top:10px}.tgt.open .cmp{display:block}
.cmpgrid{display:grid;grid-template-columns:1fr auto 1fr;gap:4px 10px;font-size:13px;font-variant-numeric:tabular-nums}.cmpgrid .k{color:var(--mute);text-align:center}.cmpgrid .r{text-align:right}
.better{color:var(--good);font-weight:600}
table{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}th,td{padding:6px 4px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
th:first-child,td:first-child{text-align:left}th{color:var(--mute);font-weight:600;cursor:pointer;user-select:none}tr.me td{font-weight:700}
.scroll{overflow-x:auto;margin:0 -14px;padding:0 14px}
.filters{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}.filters button,.filters select{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:8px;padding:5px 10px;font:inherit;font-size:13px}.filters button.on{background:var(--acc);color:#fff;border-color:var(--acc)}
.tick td{padding:3px 2px;text-align:center;font-size:11px}.tick td.c{border-radius:5px;color:#111}.tick td:first-child{font-weight:600;text-align:left;padding-right:6px}
.xi{display:flex;flex-wrap:wrap;gap:4px}.xi span{font-size:12px;background:var(--chip);padding:2px 8px;border-radius:999px}.xi span.new{background:var(--good);color:#fff}
svg text{fill:var(--mute);font-size:10px}.news{font-size:12px;color:var(--warn)}
select{max-width:100%}
.pl{padding:10px 0;border-bottom:1px solid var(--line)}.pl:last-child{border-bottom:0}
.pl-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.pl-top .nm{font-weight:600}
.pl-top .xp{margin-left:auto;font-weight:700;font-variant-numeric:tabular-nums;font-size:16px}.pl-top .xp small{font-weight:400;color:var(--mute);font-size:11px;margin-left:2px}
.pl-mid{display:flex;align-items:center;gap:12px;margin-top:4px;font-size:12px;color:var(--mute);font-variant-numeric:tabular-nums}
.pl-mid b{color:var(--ink);font-weight:600}.pl-fx{margin-top:5px;display:flex;gap:4px;flex-wrap:wrap}.pl-fx .tag{margin-left:0}
.dot{width:8px;height:8px;border-radius:50%;flex:0 0 8px;background:var(--acc)}.dot.bench{background:transparent;border:1.5px solid var(--mute)}
.sortbar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:4px 0 6px}.sortbar span{font-size:12px;color:var(--mute)}
.sortbar button{border:0;background:var(--chip);color:var(--ink);border-radius:999px;padding:4px 10px;font:inherit;font-size:12px}.sortbar button.on{background:var(--acc);color:#fff}
</style></head><body>
<header><h1 id="h"></h1><p id="sub"></p></header>
<nav id="nav"></nav>
<main>
<section id="s-targets"></section><section id="s-squad"></section><section id="s-free"></section>
<section id="s-fix"></section><section id="s-league"></section><section id="s-model"></section>
</main>
<script>
const D=/*__DATA__*/null;
const POS={1:"GKP",2:"DEF",3:"MID",4:"FWD"},P=D.players,$=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const f1=x=>(x==null?"–":(+x).toFixed(1)),f2=x=>(+x).toFixed(2);
const css=v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim();

$("#h").textContent=D.team+" · "+D.league;
$("#sub").textContent=`GW${D.gws[0]}–${D.gws[D.gws.length-1]} · updated ${D.updated} · model: ${D.model.src}`;

const tabs=[["targets","Targets"],["squad","Squad"],["free","Free agents"],["fix","Fixtures"],["league","League"],["model","Model check"]];
$("#nav").innerHTML=tabs.map(([k,l],i)=>`<button data-k="${k}" class="${i?"":"on"}">${l}</button>`).join("");
$("#s-targets").classList.add("on");
$("#nav").onclick=e=>{const b=e.target.closest("button");if(!b)return;
  document.querySelectorAll("nav button").forEach(x=>x.classList.toggle("on",x===b));
  document.querySelectorAll("section").forEach(s=>s.classList.toggle("on",s.id==="s-"+b.dataset.k));scrollTo(0,0)};

function spark(a,w=70,h=20){if(!a||!a.length)return"";const m=Math.max(10,...a),bw=w/a.length;
  return `<svg width="${w}" height="${h}" style="vertical-align:middle">`+a.map((v,i)=>{const bh=Math.max(1,Math.max(0,v)/m*h);
  return `<rect x="${i*bw+1}" y="${h-bh}" width="${bw-2}" height="${bh}" rx="1" fill="${v>=6?css("--good"):v>=3?css("--acc"):css("--mute")}"/>`}).join("")+"</svg>"}
function fxs(p){const f=p.fx.filter(([g])=>D.gws.includes(g));
  return f.length?f.map(([g,o,h,d])=>`<span class="tag" title="GW${g}">${h?o.toUpperCase():o.toLowerCase()}${d}</span>`).join(""):'<span class="tag">no game</span>'}
function stat(p){const t=[];if(p.s!=="a")t.push(`<span class="tag ${p.s==="d"?"warn":"bad"}">${{d:"doubt",i:"injured",s:"suspended",u:"unavailable",n:"unavailable"}[p.s]||p.s}</span>`);
  if(p.lock)t.push('<span class="tag warn">claim only</span>');if(p.prot)t.push('<span class="tag acc">protected</span>');return t.join("")}

/* ---------- targets */
(function(){
  const ph=D.phase==="waivers"?"Waiver targets — claim before the deadline":D.phase==="free"?"Free-agent targets — waivers done, sign now (first come, first served)":"Transfer targets";
  let h=`<div class="card"><h2>${ph}</h2><p class="muted">Ranked by how much each swap improves your best XI over the next ${D.lookahead} gameweeks (your XI now: ${D.xiTotal} xp). Tap a target to compare.</p></div>`;
  if(!D.targets.length)h+=`<div class="card">No clear upgrades right now.</div>`;
  D.targets.forEach((t,i)=>{const a=P[t.in],b=P[t.out];
    const rows=[["xp next "+D.lookahead,a.xp,b.xp,1],["xG+xA /90",a.xg+a.xa,b.xg+b.xa,1],["minutes",a.min,b.min,1],["starts last 6",a.st,b.st,1],["season pts",a.tot,b.tot,1]];
    h+=`<div class="card tgt"><div class="row1"><div><b>${i+1}. ${esc(a.n)}</b> <span class="muted">${a.t} ${POS[a.p]}</span>${stat(a)}<br><span class="muted">for ${esc(b.n)}</span>${stat(b)}</div><div class="gain">+${f1(t.gain)}</div></div>
    <div class="cmp"><div class="cmpgrid"><b>${esc(a.n)}</b><span></span><b class="r">${esc(b.n)}</b>`+
    rows.map(([k,x,y])=>`<span class="${x>y?"better":""}">${typeof x==="number"&&!Number.isInteger(x)?f2(x):x}</span><span class="k">${k}</span><span class="r ${y>x?"better":""}">${typeof y==="number"&&!Number.isInteger(y)?f2(y):y}</span>`).join("")+
    `<span>${spark(a.last)}</span><span class="k">last 6</span><span class="r">${spark(b.last)}</span>
     <span>${fxs(a)}</span><span class="k">next ${D.lookahead} GWs</span><span class="r">${fxs(b)}</span></div>
     ${a.news?`<p class="news">${esc(a.n)}: ${esc(a.news)}</p>`:""}${b.news?`<p class="news">${esc(b.n)}: ${esc(b.news)}</p>`:""}
     <h3>Your best XI after this swap</h3><div class="xi">${t.xi.map(id=>`<span class="${id===t.in?"new":""}">${esc(P[id]?.n)}</span>`).join("")}</div></div></div>`});
  h+=`<p class="muted">${D.phase==="free"?"":"Lower targets are backups if earlier ones are taken. "}Check the news before dropping anyone.${D.transOk?"":" Transfer list unavailable: recently dropped players may show as free."}</p>`;
  $("#s-targets").innerHTML=h;
  document.querySelectorAll(".tgt").forEach(c=>c.onclick=()=>c.classList.toggle("open"));
})();

/* ---------- squad */
function prow(p,{dot=null,extra=""}={}){
  return `<div class="pl"><div class="pl-top">${dot===null?"":`<span class="dot ${dot?"":"bench"}"></span>`}<span class="nm">${esc(p.n)}</span><span class="muted">${p.t}${extra}</span>${stat(p)}<span class="xp">${f1(p.xp)}<small>xp</small></span></div>
  <div class="pl-mid"><span>xGI <b>${f2(p.xg+p.xa)}</b></span><span>starts <b>${p.st}/6</b></span><span>pts <b>${p.tot}</b></span><span style="margin-left:auto">${spark(p.last,64,18)}</span></div>
  <div class="pl-fx">${fxs(p)}</div>${p.news?`<div class="news" style="margin-top:4px">${esc(p.news)}</div>`:""}</div>`}
(function(){
  let h=`<div class="card"><h2>Your squad</h2><p class="muted">Best XI: <b>${D.xiTotal}</b> expected points over the next ${D.lookahead} gameweeks. <span class="dot" style="display:inline-block"></span> best XI · <span class="dot bench" style="display:inline-block"></span> bench. Bars = last 6 scores.</p>`;
  [1,2,3,4].forEach(pos=>{const g=D.mine.map(id=>P[id]).filter(p=>p&&p.p===pos).sort((a,b)=>b.xp-a.xp);if(!g.length)return;
    h+=`<h3>${POS[pos]}</h3>`+g.map(p=>prow(p,{dot:D.xi.includes(p.id)})).join("")});
  h+=`</div>`;
  const b=D.bench;if(b&&b.some(x=>x!=null)){const tot=b.reduce((s,x)=>s+(x||0),0);
    h+=`<div class="card"><h2>Points left on your bench</h2><p class="muted">${tot} points in ${b.length} gameweeks.</p>${bars(b.map((v,i)=>({l:"GW"+(i+1),v:v||0})))}</div>`}
  $("#s-squad").innerHTML=h;
})();

function bars(items,{h=120,max=1}={}){const T=16,W=Math.max(280,items.length*28),m=Math.max(max,...items.map(x=>x.v)),bw=W/items.length;
  return `<div class="scroll"><svg width="${W}" height="${T+h+18}">`+items.map((x,i)=>{const bh=x.v/m*h,top=T+h-bh;
  return `<rect x="${i*bw+3}" y="${top}" width="${bw-6}" height="${bh}" rx="3" fill="${x.c||css("--acc")}"/><text x="${i*bw+bw/2}" y="${T+h+13}" text-anchor="middle">${x.l}</text>${x.v?`<text x="${i*bw+bw/2}" y="${top-4}" text-anchor="middle">${x.v}</text>`:""}`}).join("")+"</svg></div>"}

/* ---------- free agents */
(function(){
  const S={pos:0,sort:"xp",q:""};
  const list=Object.values(P).filter(p=>p.free||p.own==="Waivers");
  list.forEach(p=>p.xgi=p.xg+p.xa);
  const sorts=[["xp","xp"],["xgi","xGI"],["min","minutes"],["tot","points"]];
  function draw(){
    let r=list.filter(p=>(!S.pos||p.p===S.pos)&&(!S.q||p.n.toLowerCase().includes(S.q)));
    r.sort((a,b)=>(b[S.sort]||0)-(a[S.sort]||0));
    $("#fa").innerHTML=r.slice(0,40).map(p=>prow(p,{extra:" · "+POS[p.p]})).join("")||'<p class="muted">No players match.</p>';
  }
  $("#s-free").innerHTML=`<div class="card"><h2>Free agents</h2><div class="filters">${[0,1,2,3,4].map(p=>`<button data-p="${p}" class="${p?"":"on"}">${p?POS[p]:"All"}</button>`).join("")}
    <input id="q" placeholder="Search" style="flex:1;min-width:110px;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:8px;padding:5px 10px;font:inherit;font-size:13px"></div>
    <div class="sortbar"><span>Sort by</span>${sorts.map(([k,l],i)=>`<button data-s="${k}" class="${i?"":"on"}">${l}</button>`).join("")}</div>
    <div id="fa"></div><p class="muted">Top 40 shown.</p></div>
    <div class="card" id="cmpbox"><h2>Compare two players</h2><div class="filters"><select id="c1"></select><select id="c2"></select></div><div id="cmpout"></div></div>`;
  $("#s-free").querySelectorAll("[data-s]").forEach(b=>b.onclick=()=>{S.sort=b.dataset.s;$("#s-free").querySelectorAll("[data-s]").forEach(x=>x.classList.toggle("on",x===b));draw()});
  $("#s-free").querySelectorAll("[data-p]").forEach(b=>b.onclick=()=>{S.pos=+b.dataset.p;$("#s-free").querySelectorAll("[data-p]").forEach(x=>x.classList.toggle("on",x===b));draw()});
  $("#q").oninput=e=>{S.q=e.target.value.toLowerCase();draw()};draw();
  const all=Object.values(P).sort((a,b)=>a.n.localeCompare(b.n));
  const opts=all.map(p=>`<option value="${p.id}">${esc(p.n)} (${p.t} ${POS[p.p]} · ${esc(p.own)})</option>`).join("");
  $("#c1").innerHTML=opts;$("#c2").innerHTML=opts;
  const top=D.targets[0];if(top){$("#c1").value=top.in;$("#c2").value=top.out}else if(D.mine.length){$("#c1").value=D.mine[0];$("#c2").value=D.mine[1]||D.mine[0]}
  function cmp(){const a=P[$("#c1").value],b=P[$("#c2").value];if(!a||!b)return;
    const rows=[["xp next "+D.lookahead,a.xp,b.xp],["xG /90",a.xg,b.xg],["xA /90",a.xa,b.xa],["minutes",a.min,b.min],["starts last 6",a.st,b.st],["season pts",a.tot,b.tot]];
    $("#cmpout").innerHTML=`<div class="cmpgrid"><b>${esc(a.n)}</b><span></span><b class="r">${esc(b.n)}</b>`+
    rows.map(([k,x,y])=>`<span class="${x>y?"better":""}">${Number.isInteger(x)?x:f2(x)}</span><span class="k">${k}</span><span class="r ${y>x?"better":""}">${Number.isInteger(y)?y:f2(y)}</span>`).join("")+
    `<span>${spark(a.last)}</span><span class="k">last 6</span><span class="r">${spark(b.last)}</span><span>${fxs(a)}</span><span class="k">next ${D.lookahead} GWs</span><span class="r">${fxs(b)}</span></div>`}
  $("#c1").onchange=cmp;$("#c2").onchange=cmp;cmp();
})();

/* ---------- fixture ticker */
(function(){
  let mode="att";
  function col(v){const t=Math.max(-1,Math.min(1,(v-1)/0.35));const g=[81,207,102],r=[255,107,107],y=[245,245,240];
    const a=t>0?g:r,s=Math.abs(t);return `rgb(${y.map((c,i)=>Math.round(c+(a[i]-c)*s)).join(",")})`}
  function draw(){
    const rows=D.ticker.map(r=>{const vals=r.g.map(cs=>cs.length?cs.reduce((s,c)=>s+(mode==="att"?c[2]:c[3]),0)/cs.length*(cs.length>1?1.6:1):0.55);
      return {r,vals,sum:vals.reduce((a,b)=>a+b,0)}}).sort((a,b)=>b.sum-a.sum);
    $("#tick").innerHTML=`<tr><td></td>${D.tickerGws.map(g=>`<td class="muted">${g}</td>`).join("")}</tr>`+rows.map(({r,vals})=>
      `<tr><td>${r.t}</td>${r.g.map((cs,i)=>`<td class="c" style="background:${cs.length?col(vals[i]):css("--chip")};${cs.length?"":"color:var(--mute)"}">${cs.map(c=>(c[1]?c[0].toUpperCase():c[0].toLowerCase())).join(" ")||"–"}</td>`).join("")}</tr>`).join("");
  }
  $("#s-fix").innerHTML=`<div class="card"><h2>Fixture ticker</h2><div class="filters"><button data-m="att" class="on">For attackers</button><button data-m="def">For defenders</button></div>
    <p class="muted">Green = easy, red = hard. Based on this season's expected goals: the opponent's <b>defence</b> (for attackers) or <b>attack</b> (for defenders), adjusted for home/away. CAPS = home. Teams sorted by easiest run. Two games in a week counts extra; a blank is grey.</p>
    <div class="scroll"><table class="tick" id="tick"></table></div></div>`;
  $("#s-fix").querySelectorAll("[data-m]").forEach(b=>b.onclick=()=>{mode=b.dataset.m;$("#s-fix").querySelectorAll("[data-m]").forEach(x=>x.classList.toggle("on",x===b));draw()});
  draw();
})();

/* ---------- league */
(function(){
  const L=D.leagueRows,n=D.last;
  const pal=["#3b5bdb","#e8590c","#2f9e44","#c2255c","#7048e8","#1098ad","#f59f00","#5c940d","#d6336c","#495057","#0b7285","#862e9c"];
  let h=`<div class="card"><h2>Table</h2><div class="scroll"><table><tr><th>#</th><th style="text-align:left">Team</th><th>${D.h2h?"Pts":"Total"}</th>${D.h2h?"<th>For</th>":""}<th>Last 3 GWs</th></tr>`+
    L.map((r,i)=>`<tr class="${r.me?"me":""}"><td>${i+1}</td><td style="text-align:left">${esc(r.name)}</td><td>${r.pts}</td>${D.h2h?`<td>${r.pf}</td>`:""}<td>${r.gw.slice(-3).map(x=>x??"–").join(" · ")}</td></tr>`).join("")+`</table></div></div>`;
  // rank over time
  if(n>=2){const W=Math.max(300,n*40),H=180,m=L.length,x=i=>20+i*(W-40)/(n-1),y=r=>12+(r-1)*(H-30)/Math.max(1,m-1);
    h+=`<div class="card"><h2>Rank over time</h2><div class="scroll"><svg width="${W}" height="${H}">`+
      Array.from({length:n},(_,i)=>`<text x="${x(i)}" y="${H-2}" text-anchor="middle">${i+1}</text>`).join("")+
      L.map((r,j)=>`<polyline fill="none" stroke="${pal[j%pal.length]}" stroke-width="${r.me?4:1.6}" opacity="${r.me?1:.75}" points="${r.ranks.map((rk,i)=>x(i)+","+y(rk)).join(" ")}"/>`).join("")+
      `</svg></div><div class="xi">${L.map((r,j)=>`<span style="border-left:4px solid ${pal[j%pal.length]};${r.me?"font-weight:700":""}">${esc(r.name)}</span>`).join("")}</div></div>`}
  // points per GW: me vs average vs leader
  const me=L.find(r=>r.me);if(me&&n){const avg=i=>{const v=L.map(r=>r.gw[i]).filter(x=>x!=null);return v.length?v.reduce((a,b)=>a+b,0)/v.length:0};
    const best=i=>Math.max(...L.map(r=>r.gw[i]??0));
    h+=`<div class="card"><h2>Your points per gameweek</h2><p class="muted">Bar = you · orange line = league average · green dot = best score that week. Left axis = points.</p>`+lineBars(me.gw.map(x=>x||0),Array.from({length:n},(_,i)=>avg(i)),Array.from({length:n},(_,i)=>best(i)))+`</div>`}
  // league points by position (actual)
  if(Object.keys(D.contrib||{}).length)h+=`<div class="card"><h2>League points by position</h2>
    <p class="muted">Points each team has actually scored in the league, split by the position of the players who earned them (starting XI only, after auto-subs). Below each bar: the team's top 3 contributors. Tap a position to sort by it.</p>
    <div id="cp"></div></div>`;
  // squad strength by position
  if(Object.keys(D.byPos).length)h+=`<div class="card"><h2>Squad strength by position</h2>
    <p class="muted">Season points of the players each team holds <b>now</b>, wherever they earned them (bench, other teams, before signing). Not the league score. Tap a position to sort by it.</p>
    <div id="bp"></div></div>`;
  // transfers
  if(D.transOk){const t=D.transfers.slice(0,40);
    h+=`<div class="card"><h2>Recent transfers</h2>${t.length?`<div class="scroll"><table><tr><th>GW</th><th>Team</th><th>In</th><th>Out</th><th>Type</th></tr>`+
      t.map(x=>`<tr class="${x.team===D.team?"me":""}"><td style="text-align:left">${x.gw}</td><td style="text-align:left">${esc(x.team)}</td><td style="text-align:left;color:var(--good)">${esc(x.in)}</td><td style="text-align:left;color:var(--bad)">${esc(x.out)}</td><td>${x.kind==="w"?"waiver":x.kind==="f"?"free":esc(x.kind||"")}</td></tr>`).join("")+`</table></div>`:'<p class="muted">No transfers yet.</p>'}</div>`}
  $("#s-league").innerHTML=h;
  if($("#cp"))posChart($("#cp"),Object.fromEntries(Object.entries(D.contrib).map(([t,v])=>[t,v.pos])),
    t=>`<div class="muted" style="font-size:12px;margin-top:3px">${D.contrib[t].top.map(([n,p,still],i)=>`${i+1}. ${esc(n)} <b style="color:var(--ink)">${p}</b>${still?"":' <span title="no longer in this squad">↗</span>'}`).join(" · ")}</div>`);
  if($("#bp"))posChart($("#bp"),D.byPos);
})();

/* stacked position bars with Points / % toggle and sort-by-position */
function posChart(el,bp,below){
  const cs=["#f59f00","#2f9e44","#3b5bdb","#e03131"],B={mode:"pts",sort:0};
  const tot=t=>bp[t].reduce((a,b)=>a+b,0);
  const draw=()=>{
    const teams=Object.keys(bp).sort((a,b)=>B.sort?(B.mode==="pct"?bp[b][B.sort-1]/(tot(b)||1)-bp[a][B.sort-1]/(tot(a)||1):bp[b][B.sort-1]-bp[a][B.sort-1]):tot(b)-tot(a));
    const mx=Math.max(1,...teams.map(tot));
    el.innerHTML=`<div class="sortbar"><button data-m="pts" class="${B.mode==="pts"?"on":""}">Points</button><button data-m="pct" class="${B.mode==="pct"?"on":""}">% share</button></div>`+
      teams.map(t=>{const T=tot(t),pct=bp[t].map(v=>T?v/T*100:0);
      const lab=B.sort?(B.mode==="pct"?pct[B.sort-1].toFixed(0)+"% "+POS[B.sort]:bp[t][B.sort-1]+" "+POS[B.sort]):(B.mode==="pct"?"":T);
      return `<div style="margin:9px 0"><div class="muted" style="${t===D.team?"font-weight:700;color:var(--ink)":""}">${esc(t)}${lab!==""?" · "+lab:""}</div>
      <div style="display:flex;height:18px;border-radius:4px;overflow:hidden;width:${B.mode==="pct"?100:T/mx*100}%">${bp[t].map((v,i)=>{const w=pct[i];
        const txt=B.mode==="pct"?(w>=9?w.toFixed(0)+"%":""):(w>=12?v:"");
        return `<div style="width:${w}%;background:${cs[i]};color:#fff;font-size:11px;line-height:18px;text-align:center;opacity:${B.sort&&B.sort!==i+1?.45:1}">${txt}</div>`}).join("")}</div>${below?below(t):""}</div>`}).join("")+
      `<div class="sortbar" style="margin-top:10px">${[1,2,3,4].map(i=>`<button data-s="${i}" class="${B.sort===i?"on":""}" style="border-left:8px solid ${cs[i-1]}">${POS[i]}</button>`).join("")}${B.sort?'<button data-s="0">Total</button>':""}</div>`;
    el.querySelectorAll("[data-m]").forEach(b=>b.onclick=()=>{B.mode=b.dataset.m;draw()});
    el.querySelectorAll("[data-s]").forEach(b=>b.onclick=()=>{B.sort=+b.dataset.s;draw()});
  };
  draw();
}

function lineBars(v,avg,best){const n=v.length,L=30,W=Math.max(300,L+n*34),H=170,top=8,bot=18,
  raw=Math.max(10,...v,...best),step=raw>80?20:raw>40?10:5,m=Math.ceil(raw/step)*step,bw=(W-L-6)/n,y=x=>H-bot-x/m*(H-bot-top),cx=i=>L+i*bw+bw/2;
  let grid="";for(let g=0;g<=m;g+=step)grid+=`<line x1="${L}" x2="${W}" y1="${y(g)}" y2="${y(g)}" stroke="${css("--line")}" stroke-width="1"/><text x="${L-5}" y="${y(g)+3}" text-anchor="end">${g}</text>`;
  return `<div class="scroll"><svg width="${W}" height="${H}">${grid}`+v.map((x,i)=>`<rect x="${L+i*bw+4}" y="${y(x)}" width="${bw-8}" height="${H-bot-y(x)}" rx="3" fill="${css("--acc")}"><title>GW${i+1}: ${x} pts</title></rect><text x="${cx(i)}" y="${H-4}" text-anchor="middle">${i+1}</text>`).join("")+
  `<polyline fill="none" stroke="${css("--warn")}" stroke-width="2" points="${avg.map((a,i)=>cx(i)+","+y(a)).join(" ")}"/>`+
  best.map((b,i)=>`<circle cx="${cx(i)}" cy="${y(b)}" r="3" fill="${css("--good")}"/>`).join("")+"</svg></div>"}

/* ---------- model check */
(function(){
  let h=`<div class="card"><h2>How good are the predictions?</h2><p class="muted">For each finished gameweek, the model predicted every player's points using only earlier data. Correlation 0 = no better than guessing, 1 = perfect. For single-gameweek FPL points, around 0.3 is decent: football is noisy.</p>`;
  if(D.mcheck.length){h+=bars(D.mcheck.map(m=>({l:"GW"+m.gw,v:Math.round(m.corr*100)/100,c:m.corr>=0.3?css("--good"):m.corr>=0.15?css("--acc"):css("--warn")})),{max:0.4})+
    `<div class="scroll"><table><tr><th>GW</th><th>corr</th><th>avg error</th><th>players</th></tr>${D.mcheck.map(m=>`<tr><td>${m.gw}</td><td>${f2(m.corr)}</td><td>${f2(m.mae)} pts</td><td>${m.n}</td></tr>`).join("")}</table></div>`}
  else h+=`<p>Not enough gameweeks yet.</p>`;
  h+=`<p class="muted">Model settings: xG weight ${D.model.w}, opponent effect ${D.model.k}.</p></div>`;
  if(D.myCheck.length)h+=`<div class="card"><h2>Your squad in GW${D.last}: predicted vs actual</h2><div class="scroll"><table><tr><th>Player</th><th>predicted</th><th>actual</th></tr>`+
    D.myCheck.map(r=>`<tr><td>${esc(r.n)}</td><td>${f1(r.pred)}</td><td style="color:${r.act>=r.pred+2?css("--good"):r.act<=r.pred-2?css("--bad"):"inherit"}">${r.act}</td></tr>`).join("")+`</table></div></div>`;
  $("#s-model").innerHTML=h;
})();
</script></body></html>"""


if __name__ == "__main__":
    main()
