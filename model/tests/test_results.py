import json
from datetime import timedelta

from conftest import GW10_DEADLINE, EditedApi, utc

from outdraft_model.publish import run


def read(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def test_results_cover_every_finished_gameweek_and_add_up(api, tmp_path):
    run(api, tmp_path, utc(2026, 11, 1, 12, 0))
    r = read(tmp_path / "results.json")
    p = read(tmp_path / "projections.json")
    assert r["gameweeks"] == list(range(1, 9))   # GW1-8 finished in the recording
    totals = {x["id"]: x["total_points"] for x in p["players"]}
    for pid, pts in r["players"].items():
        assert len(pts) == 8
        assert sum(pts) == totals[int(pid)]
    # Players left out scored nothing all season.
    left_out = [x for x in p["players"] if str(x["id"]) not in r["players"]]
    assert left_out and all(x["total_points"] == 0 and not any(x["points_recent"]) for x in left_out)


def test_results_match_the_recorded_live_points(api, tmp_path):
    run(api, tmp_path, utc(2026, 11, 1, 12, 0))
    r = read(tmp_path / "results.json")
    live5 = api.get("event/5/live")["elements"]
    for pid, pts in list(r["players"].items())[:50]:
        assert pts[4] == live5[pid]["stats"]["total_points"]


def test_results_only_change_when_a_gameweek_finishes(api, tmp_path):
    run(api, tmp_path, utc(2026, 11, 1, 12, 0))
    again = run(api, tmp_path, GW10_DEADLINE - timedelta(hours=1))
    assert "results.json" not in again["written"]

    def finish_gw9(d):
        for ev in d["events"]["data"]:
            if ev["id"] == 9:
                ev["finished"] = True
    later = run(EditedApi("bootstrap-static", finish_gw9), tmp_path, GW10_DEADLINE - timedelta(minutes=30))
    assert "results.json" in later["written"]
    assert read(tmp_path / "results.json")["gameweeks"] == list(range(1, 10))
