import re
from datetime import timedelta

from conftest import GW10_DEADLINE, EditedApi, utc

from outdraft_model.api import load_season
from outdraft_model.deadlines import deadlines_ics
from outdraft_model.publish import run

NOW = utc(2026, 11, 1, 12, 0)


def events(ics):
    """[{field: value}] for each VEVENT, after unfolding lines."""
    text = ics.replace("\r\n ", "")
    out = []
    for block in re.findall(r"BEGIN:VEVENT\r\n(.*?)END:VEVENT", text, re.S):
        fields = {}
        for line in block.split("\r\n"):
            if line and ":" in line and not line.startswith(("BEGIN:VALARM", "END:VALARM")):
                k, v = line.split(":", 1)
                fields.setdefault(k, v)
        out.append(fields)
    return out


def test_calendar_is_well_formed(season):
    ics = deadlines_ics(season.events, NOW)
    assert ics.startswith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n") and ics.endswith("END:VCALENDAR\r\n")
    assert "\n" not in ics.replace("\r\n", "")
    lines = ics.split("\r\n")[:-1]
    assert all(len(line.encode("utf-8")) <= 75 for line in lines)
    for kind in ("VCALENDAR", "VEVENT", "VALARM"):
        assert ics.count(f"BEGIN:{kind}") == ics.count(f"END:{kind}")
    uids = [e["UID"] for e in events(ics)]
    assert len(uids) == len(set(uids))
    for e in events(ics):
        for k in ("DTSTAMP", "DTSTART", "DTEND", "SUMMARY"):
            assert k in e


def test_every_upcoming_deadline_is_in_the_calendar_at_the_right_time(season):
    by_uid = {e["UID"]: e for e in events(deadlines_ics(season.events, NOW))}
    upcoming = [e for e in season.events if e["deadline"] > NOW]
    assert len(by_uid) == 2 * len(upcoming) == 2 * 29   # GW10-38
    gw10 = by_uid["gw10-deadline@outdraft"]
    assert gw10["DTSTART"] == "20261106T183000Z" and gw10["SUMMARY"] == "GW10 Gameweek deadline"
    assert by_uid["gw10-waivers@outdraft"]["DTSTART"] == "20261105T183000Z"
    assert by_uid["gw14-waivers@outdraft"]["DTSTART"] == "20261204T140000Z"   # moved for GW14
    assert "gw9-deadline@outdraft" not in by_uid


def test_a_moved_deadline_moves_the_same_event(tmp_path):
    def postpone(d):
        for ev in d["events"]["data"]:
            if ev["id"] == 10:
                ev["deadline_time"] = "2026-11-07T11:00:00Z"
    moved = load_season(EditedApi("bootstrap-static", postpone))
    gw10 = {e["UID"]: e for e in events(deadlines_ics(moved.events, NOW))}["gw10-deadline@outdraft"]
    assert gw10["DTSTART"] == "20261107T110000Z"


def test_the_job_publishes_the_calendar_and_only_rewrites_it_when_deadlines_change(api, tmp_path):
    summary = run(api, tmp_path, NOW)
    assert "deadlines.ics" in summary["written"]
    assert (tmp_path / "deadlines.ics").read_bytes().startswith(b"BEGIN:VCALENDAR\r\n")
    again = run(api, tmp_path, NOW + timedelta(hours=1))
    assert "deadlines.ics" not in again["written"]
    # Once a deadline is more than a day old it drops out.
    later = run(api, tmp_path, GW10_DEADLINE + timedelta(days=2))
    assert "deadlines.ics" in later["written"]
    assert "gw10-deadline@outdraft" not in (tmp_path / "deadlines.ics").read_text()
