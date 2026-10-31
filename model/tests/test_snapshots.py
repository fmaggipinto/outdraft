import json
from datetime import timedelta

import pytest
from conftest import GW10_DEADLINE, GW11_DEADLINE, utc

from outdraft_model.publish import FrozenSnapshotError, run, snapshot_path, write_snapshot


def read(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def snap(gw=10, deadline="2026-11-06T18:30:00Z", value=1.0):
    return {"updated_at": "x", "gameweek": gw, "deadline": deadline, "projections": {"1": value}}


def test_run_before_deadline_writes_the_next_gameweeks_snapshot(api, tmp_path):
    summary = run(api, tmp_path, utc(2026, 11, 1, 12, 0))
    s = read(snapshot_path(tmp_path / "snapshots", 10))
    assert summary["next"] == 10
    assert s["gameweek"] == 10 and s["deadline"] == "2026-11-06T18:30:00Z"
    assert s["based_on_gameweek"] == 8 and s["model_version"] == 1
    assert len(s["projections"]) == 669
    assert read(tmp_path / "manifest.json")["snapshots"] == [10]


def test_later_run_before_deadline_refreshes_the_snapshot(tmp_path):
    assert write_snapshot(tmp_path, snap(value=1.0), utc(2026, 11, 1))
    assert write_snapshot(tmp_path, snap(value=2.0), GW10_DEADLINE - timedelta(minutes=1))
    assert read(snapshot_path(tmp_path, 10))["projections"] == {"1": 2.0}


def test_snapshot_is_never_changed_after_the_deadline(api, tmp_path):
    run(api, tmp_path, GW10_DEADLINE - timedelta(minutes=10))
    path = snapshot_path(tmp_path / "snapshots", 10)
    frozen = path.read_bytes()

    summary = run(api, tmp_path, GW10_DEADLINE + timedelta(minutes=5))
    assert summary["next"] == 11
    assert path.read_bytes() == frozen
    with pytest.raises(FrozenSnapshotError):
        write_snapshot(tmp_path / "snapshots", snap(value=99.0), GW10_DEADLINE)
    assert path.read_bytes() == frozen


def test_missed_snapshot_is_recorded_as_a_gap_and_not_created(api, tmp_path):
    summary = run(api, tmp_path, GW10_DEADLINE + timedelta(hours=1))
    assert not snapshot_path(tmp_path / "snapshots", 10).exists()
    assert summary["gaps"] == [10]
    manifest = read(tmp_path / "manifest.json")
    assert manifest["gaps"] == [10] and manifest["snapshots"] == [11]


def test_gaps_only_count_from_the_first_snapshot_gameweek(api, tmp_path):
    run(api, tmp_path, utc(2026, 11, 1))
    assert read(tmp_path / "manifest.json")["gaps"] == []


def test_postponed_deadline_does_not_unfreeze_a_snapshot(tmp_path):
    write_snapshot(tmp_path, snap(), utc(2026, 11, 1))
    with pytest.raises(FrozenSnapshotError):
        write_snapshot(tmp_path, snap(deadline="2026-11-07T18:30:00Z", value=5.0),
                       GW10_DEADLINE + timedelta(hours=1))
    assert read(snapshot_path(tmp_path, 10))["projections"] == {"1": 1.0}


def test_each_gameweek_keeps_its_own_snapshot(api, tmp_path):
    run(api, tmp_path, GW10_DEADLINE - timedelta(hours=1))
    run(api, tmp_path, GW11_DEADLINE - timedelta(hours=1))
    assert read(tmp_path / "manifest.json")["snapshots"] == [10, 11]
