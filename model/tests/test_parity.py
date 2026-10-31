"""The ported Model must match docs/fpl_draft.py once the original is given
Draft scoring for goals and clean sheets (its hard-coded table gives a
goalkeeper goal 6 points; Draft gives 10)."""
import importlib.util
from pathlib import Path

import pytest

from outdraft_model.model import XgModel

ORIGINAL = Path(__file__).resolve().parents[2] / "docs" / "fpl_draft.py"
POS = {1: "GKP", 2: "DEF", 3: "MID", 4: "FWD"}


@pytest.fixture(scope="module")
def original():
    spec = importlib.util.spec_from_file_location("fpl_draft", ORIGINAL)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def build_original(mod, season):
    boot = {"elements": list(season.players.values()),
            "teams": [{"id": t["id"], "short_name": t["short_name"]} for t in season.teams.values()]}
    fixtures = [f for gw in sorted(season.fixtures) for f in season.fixtures[gw]]
    return mod.Model(boot, fixtures, season.live, season.last_finished)


@pytest.mark.parametrize("w,k", [(0.0, 0.0), (0.5, 1.0), (1.0, 2.0)])
def test_port_matches_original_with_draft_scoring(original, season, monkeypatch, w, k):
    monkeypatch.setattr(original, "GOAL_PTS", {p: season.scoring[f"goals_scored_{n}"] for p, n in POS.items()})
    monkeypatch.setattr(original, "CS_PTS", {p: season.scoring[f"clean_sheets_{n}"] for p, n in POS.items()})
    old, new = build_original(original, season), XgModel(season, season.last_finished)
    gws = [10, 11, 12]
    for pid in season.players:
        assert new.value(pid, new.last, gws, w, k) == pytest.approx(old.value(pid, old.last, gws, w, k))


def test_draft_scoring_changes_goalkeeper_projections(original, season):
    # No keeper has xG in the recorded data, so use a made-up one.
    old, new = build_original(original, season), XgModel(season, season.last_finished)
    keeper = {"pos": 1, "team": 1, "pts90": 4.0, "xg90": 0.1, "xa90": 0.0, "pcs": 0.3, "avail": 1.0}
    assert new.fixture_value(keeper, 2, True, 1.0, 1.0) - old.fixture_value(keeper, 2, True, 1.0, 1.0) \
        == pytest.approx((10 - 6) * 0.1 * new.factors(2, True, 1.0)[0])
