"""Publish Projections, Snapshots and the manifest as JSON (formats: docs/data-format.md).

Snapshot rule (ADR-0001): every run before a Gameweek deadline writes or
refreshes that gameweek's Snapshot. Once the deadline has passed it is never
written again, and a gameweek with no Snapshot by then is recorded as a gap.
"""
import json
from datetime import timedelta
from pathlib import Path

from . import model as xg
from .api import load_season, parse_time

FIRST_SNAPSHOT_GW = 10   # Snapshots started with the first deploy, before GW10
HORIZON = 6              # gameweeks of Projections published
RETUNE_EVERY = 3         # re-run the backtest every 3 finished gameweeks
TIMESTAMP_KEYS = ("updated_at",)
FAST_WINDOW = timedelta(hours=6)   # run every 15 minutes this close to a deadline


class FrozenSnapshotError(RuntimeError):
    """An attempt to write a Snapshot after its Gameweek deadline."""


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ") if dt else None


def _strip(data):
    return {k: v for k, v in data.items() if k not in TIMESTAMP_KEYS}


def write_if_changed(path, data):
    """Write `data` unless the file already holds the same content apart from
    timestamps. Returns True if written. Keeps commits to real changes."""
    path = Path(path)
    if path.exists():
        with open(path, encoding="utf-8") as fh:
            if _strip(json.load(fh)) == _strip(data):
                return False
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, separators=(",", ":"), ensure_ascii=False)
        fh.write("\n")
    tmp.replace(path)
    return True


def snapshot_path(directory, gw):
    return Path(directory) / f"gw{gw:02d}.json"


def write_snapshot(directory, snapshot, now):
    """Write or refresh a Snapshot. Refuses once its Gameweek deadline has passed,
    judged by both the new deadline and any deadline already on file."""
    gw, deadline = snapshot["gameweek"], parse_time(snapshot["deadline"])
    path = snapshot_path(directory, gw)
    if now >= deadline:
        raise FrozenSnapshotError(f"GW{gw} Gameweek deadline {iso(deadline)} has passed")
    if path.exists():
        with open(path, encoding="utf-8") as fh:
            on_file = parse_time(json.load(fh)["deadline"])
        if now >= on_file:
            raise FrozenSnapshotError(f"GW{gw} Snapshot is frozen (deadline {iso(on_file)})")
    return write_if_changed(path, snapshot)


def snapshot_status(season, directory, now):
    """(gameweeks with a Snapshot, gameweeks missed for good)."""
    have = sorted(int(p.stem[2:]) for p in Path(directory).glob("gw*.json"))
    gaps = [e["id"] for e in season.events
            if e["id"] >= FIRST_SNAPSHOT_GW and e["deadline"] <= now and e["id"] not in have]
    return have, gaps


def choose_params(model, last, previous):
    """Reuse tuned parameters unless the Model changed or 3 more gameweeks finished."""
    prev = (previous or {}).get("model") or {}
    params = prev.get("params")
    if (params and prev.get("version") == xg.VERSION
            and 0 <= last - params.get("tuned_at", -99) < RETUNE_EVERY):
        return params, False
    if last < xg.BACKTEST_START:
        return dict(xg.DEFAULT_PARAMS, tuned_at=last), False
    res = model.backtest()
    if not res:
        return dict(xg.DEFAULT_PARAMS, tuned_at=last), False
    corr, mae, n, w, k = res[0]
    return {"w": w, "k": k, "corr": round(corr, 3), "mae": round(mae, 3), "n": n,
            "backtest_gws": [xg.BACKTEST_START, last], "tuned_at": last}, True


def squad_rules(rules):
    """Draft lineup rules the browser needs to pick a Best XI."""
    names = {1: "GKP", 2: "DEF", 3: "MID", 4: "FWD"}
    return {"size": rules["size"], "play": rules["play"],
            "min_play": {str(p): rules[f"min_play_{n}"] for p, n in names.items()},
            "max_play": {str(p): rules[f"max_play_{n}"] for p, n in names.items()}}


def players_table(model, season, gws, proj):
    out = []
    for pid in sorted(season.players):
        e, h = season.players[pid], model.hist[pid]
        r = model.rates(pid, model.last) or {"xg90": 0.0, "xa90": 0.0}
        out.append({
            "id": pid, "name": e["web_name"], "first_name": e["first_name"],
            "second_name": e["second_name"], "team": e["team"], "position": e["element_type"],
            "status": e["status"], "chance_next": e["chance_of_playing_next_round"],
            "news": (e["news"] or "").strip(), "draft_rank": e["draft_rank"],
            "minutes": int(sum(h["minutes"])), "total_points": int(sum(h["total_points"])),
            "points_avg_capped": round(xg.mean(min(p, xg.CAP) for p in h["total_points"]), 2),
            "starts_recent": int(sum(h["starts"][-xg.RECENT:])),
            "points_recent": [int(x) for x in h["total_points"][-xg.RECENT:]],
            "xg90": round(r["xg90"], 3), "xa90": round(r["xa90"], 3),
            "projections": [round(v, 2) for v in proj[pid]],
        })
    return out


def run(api, out_dir, now):
    """One run of the job. Returns a short summary for the log."""
    out = Path(out_dir)
    snap_dir = out / "snapshots"
    manifest_path = out / "manifest.json"
    previous = None
    if manifest_path.exists():
        with open(manifest_path, encoding="utf-8") as fh:
            previous = json.load(fh)

    season = load_season(api)
    last = season.last_finished
    nxt = season.next_gw(now)
    model = xg.XgModel(season, last)
    params, retuned = choose_params(model, last, previous)
    summary = {"last_finished": last, "next": nxt, "retuned": retuned, "written": []}
    stamp = iso(now)

    if nxt is not None:
        gws = [gw for gw in range(nxt, nxt + HORIZON) if season.event(gw)]
        proj = model.projections(gws, params)
        fixtures = [{"gameweek": gw, "home": f["team_h"], "away": f["team_a"],
                     "kickoff": f["kickoff_time"]}
                    for gw in gws for f in sorted(season.fixtures.get(gw, []), key=lambda f: f["id"])]
        projections = {
            "updated_at": stamp, "model_version": xg.VERSION, "params": params,
            "based_on_gameweek": last, "gameweeks": gws,
            "events": [{"gameweek": gw, "deadline": iso(season.event(gw)["deadline"]),
                        "waivers_deadline": iso(season.event(gw)["waivers_deadline"])} for gw in gws],
            "teams": [season.teams[t] for t in sorted(season.teams)],
            "squad_rules": squad_rules(season.squad_rules),
            "fixtures": fixtures,
            "players": players_table(model, season, gws, proj),
        }
        if write_if_changed(out / "projections.json", projections):
            summary["written"].append("projections.json")

        snapshot = {
            "updated_at": stamp, "gameweek": nxt, "deadline": iso(season.event(nxt)["deadline"]),
            "model_version": xg.VERSION, "params": params, "based_on_gameweek": last,
            "projections": {str(pid): round(v[0], 2) for pid, v in sorted(proj.items())},
        }
        if write_snapshot(snap_dir, snapshot, now):
            summary["written"].append(snapshot_path(snap_dir, nxt).relative_to(out).as_posix())

    have, gaps = snapshot_status(season, snap_dir, now)
    manifest = {
        "updated_at": stamp,
        "model": {"version": xg.VERSION, "params": params},
        "first_snapshot_gameweek": FIRST_SNAPSHOT_GW,
        "snapshots": have, "gaps": gaps,
    }
    if write_if_changed(manifest_path, manifest):
        summary["written"].append("manifest.json")
    summary["gaps"] = gaps
    return summary


def near_deadline(api, now):
    """Whether a Gameweek deadline is within FAST_WINDOW, when the extra runs
    between the hourly ones are worth doing."""
    boot = api.get("bootstrap-static")
    for ev in boot["events"]["data"]:
        d = parse_time(ev["deadline_time"])
        if d and now < d <= now + FAST_WINDOW:
            return True
    return False
