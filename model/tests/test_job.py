import json
from datetime import timedelta

import pytest
from conftest import GW10_DEADLINE, EditedApi, utc

from outdraft_model.api import ApiShapeError
from outdraft_model.publish import near_deadline, run


def read(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


@pytest.fixture(scope="module")
def published(api, tmp_path_factory):
    out = tmp_path_factory.mktemp("data")
    run(api, out, utc(2026, 11, 1, 12, 0))
    return out


def test_projections_cover_six_gameweeks_for_every_player(published, season):
    p = read(published / "projections.json")
    assert p["gameweeks"] == [10, 11, 12, 13, 14, 15]
    assert p["based_on_gameweek"] == 8
    assert len(p["players"]) == len(season.players) == 669
    assert all(len(x["projections"]) == 6 for x in p["players"])
    assert all(v >= 0 for x in p["players"] for v in x["projections"])
    assert [e["gameweek"] for e in p["events"]] == p["gameweeks"]
    assert len(p["teams"]) == 20
    assert p["squad_rules"] == {"size": 15, "play": 11,
                                "min_play": {"1": 1, "2": 3, "3": 2, "4": 1},
                                "max_play": {"1": 1, "2": 5, "3": 5, "4": 3}}


def test_projections_are_sane(published):
    players = read(published / "projections.json")["players"]
    first = [x["projections"][0] for x in players]
    assert max(first) < 15            # nobody is projected an absurd haul
    regulars = [x for x in players if x["minutes"] >= 540 and x["status"] == "a"]
    assert regulars and sum(x["projections"][0] for x in regulars) / len(regulars) > 2


def test_capped_points_average_limits_hauls_to_ten(published):
    players = read(published / "projections.json")["players"]
    assert all(0 <= x["points_avg_capped"] <= 10 for x in players)
    # Capping can only lower the average (allowing for rounding to 2 decimals).
    assert all(x["points_avg_capped"] <= x["total_points"] / 8 + 0.005 for x in players)
    assert any(x["points_avg_capped"] < x["total_points"] / 8 - 0.5 for x in players)


def test_unavailable_players_project_zero_and_doubts_are_scaled(published, season):
    by_id = {x["id"]: x for x in read(published / "projections.json")["players"]}
    out = [p for p in season.players.values() if p["status"] in ("i", "s", "u", "n")]
    assert out and all(by_id[p["id"]]["projections"] == [0] * 6 for p in out)


def test_fixtures_include_double_and_blank_structure(published, season):
    p = read(published / "projections.json")
    for gw in p["gameweeks"]:
        assert len([f for f in p["fixtures"] if f["gameweek"] == gw]) == len(season.fixtures[gw])


def test_rerun_with_no_new_data_writes_nothing(api, tmp_path):
    run(api, tmp_path, utc(2026, 11, 1, 12, 0))
    before = {p: p.read_bytes() for p in tmp_path.rglob("*.json")}
    summary = run(api, tmp_path, utc(2026, 11, 1, 13, 0))
    assert summary["written"] == [] and summary["retuned"] is False
    assert {p: p.read_bytes() for p in tmp_path.rglob("*.json")} == before


def test_tuned_params_are_recorded(published):
    params = read(published / "manifest.json")["model"]["params"]
    assert params["tuned_at"] == 8 and params["backtest_gws"] == [4, 8]
    assert 0 < params["corr"] < 1


def test_missing_api_fields_fail_loudly(tmp_path):
    def drop_xg(d):
        for e in d["elements"].values():
            e["stats"].pop("expected_goals")
    with pytest.raises(ApiShapeError, match="expected_goals"):
        run(EditedApi("event/5/live", drop_xg), tmp_path, utc(2026, 11, 1))

    def drop_deadlines(d):
        d["events"]["data"][0].pop("deadline_time")
    with pytest.raises(ApiShapeError, match="deadline_time"):
        run(EditedApi("bootstrap-static", drop_deadlines), tmp_path, utc(2026, 11, 1))


def test_extra_runs_only_happen_within_6_hours_of_a_deadline(api):
    assert not near_deadline(api, utc(2026, 11, 2, 9, 22))
    assert near_deadline(api, GW10_DEADLINE - timedelta(hours=5, minutes=50))
    assert near_deadline(api, GW10_DEADLINE - timedelta(minutes=8))
    assert not near_deadline(api, GW10_DEADLINE - timedelta(hours=6, minutes=8))
    assert not near_deadline(api, GW10_DEADLINE + timedelta(minutes=7))
