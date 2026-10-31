import json
from pathlib import Path

import pytest
from conftest import utc

from outdraft_model import distribution as dist
from outdraft_model.publish import run


@pytest.fixture(scope="module")
def published(api, tmp_path_factory):
    out = tmp_path_factory.mktemp("data")
    run(api, out, utc(2026, 11, 1, 12, 0))
    with open(Path(out) / "distributions.json", encoding="utf-8") as fh:
        d = json.load(fh)
    with open(Path(out) / "projections.json", encoding="utf-8") as fh:
        p = json.load(fh)
    return d, p


def expand(compact):
    pts, probs = compact
    return dict(zip(pts, probs))


def test_every_published_distribution_averages_to_its_projection(published):
    d, p = published
    assert d["gameweeks"] == p["gameweeks"]
    checked = 0
    for player in p["players"]:
        dists = d["players"].get(str(player["id"]))
        if dists is None:
            assert not any(player["projections"])
            continue
        for compact, projection in zip(dists, player["projections"]):
            probs = compact[1]
            assert all(x > 0 for x in probs) and sum(probs) == pytest.approx(1, abs=1e-9)
            assert all(x >= 0 for x in compact[0])
            # Probabilities are published to 3 decimals, so allow a little rounding.
            assert dist.mean(expand(compact)) == pytest.approx(projection, abs=0.06)
            checked += 1
    assert checked > 1000


@pytest.mark.parametrize("q,m,pos", [(1.0, 6.3, 3), (0.8, 4.1, 2), (0.5, 1.4, 4), (0.3, 0.6, 1), (1.0, 2.0, 1)])
def test_a_fixture_distribution_has_the_expected_average(q, m, pos):
    d = dist.fixture_distribution(q, m, pos)
    assert sum(d.values()) == pytest.approx(1)
    assert dist.mean(d) == pytest.approx(q * m, abs=1e-6)
    assert min(d.values()) >= 0


def test_blank_and_unavailable_score_zero_and_doubles_spread_wider():
    assert dist.gameweek_distribution([], 3) == {0: 1.0}
    assert dist.fixture_distribution(0.0, 5.0, 3) == {0: 1.0}
    one = dist.gameweek_distribution([(0.9, 5.0)], 3)
    two = dist.gameweek_distribution([(0.9, 5.0), (0.9, 5.0)], 3)
    assert dist.mean(two) == pytest.approx(2 * dist.mean(one))
    var = lambda d: dist.mean({x * x: p for x, p in d.items()}) - dist.mean(d) ** 2
    assert var(two) > var(one)


def test_compact_rounds_and_still_sums_to_one():
    pts, probs = dist.compact({0: 0.33333, 2: 0.33333, 6: 0.33334, 50: 1e-7})
    assert pts == [0, 2, 6] and sum(probs) == pytest.approx(1)
