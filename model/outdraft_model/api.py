"""Reading the FPL Draft API, live or from recorded responses.

Only the Draft API is used: Player IDs are Draft IDs throughout, and nothing
needs mapping to the Classic FPL API.
"""
import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

BASE = "https://draft.premierleague.com/api/"
USER_AGENT = "outdraft-model/1 (+https://github.com/fmaggipinto/outdraft)"
LAST_GW = 38

ELEMENT_FIELDS = {"id", "web_name", "first_name", "second_name", "team", "element_type",
                  "status", "chance_of_playing_next_round", "news", "draft_rank"}
LIVE_STATS = {"total_points", "minutes", "starts", "expected_goals",
              "expected_assists", "expected_goals_conceded"}
FIXTURE_FIELDS = {"id", "event", "team_h", "team_a", "kickoff_time", "finished"}
EVENT_FIELDS = {"id", "deadline_time", "waivers_time", "finished"}


class ApiShapeError(RuntimeError):
    """The API answered, but not with the fields the job relies on."""


def _require(obj, keys, where):
    if not isinstance(obj, dict):
        raise ApiShapeError(f"{where}: expected an object, got {type(obj).__name__}")
    missing = set(keys) - set(obj)
    if missing:
        raise ApiShapeError(f"{where}: missing {sorted(missing)}")


class LiveApi:
    def __init__(self, base=BASE, retries=3):
        self.base, self.retries = base, retries

    def get(self, path):
        req = urllib.request.Request(self.base + path, headers={"User-Agent": USER_AGENT})
        for attempt in range(self.retries):
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    return json.load(resp)
            except (urllib.error.URLError, TimeoutError):
                if attempt == self.retries - 1:
                    raise
                time.sleep(2 * (attempt + 1))


class RecordedApi:
    """Serves responses saved by the recorder: `a/b/c` is read from `a_b_c.json`."""

    def __init__(self, directory):
        self.dir = Path(directory)

    def get(self, path):
        with open(self.dir / (path.strip("/").replace("/", "_") + ".json"), encoding="utf-8") as fh:
            return json.load(fh)


def parse_time(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None


@dataclass
class Season:
    players: dict          # Draft Player id -> element fields
    teams: dict            # team id -> {"id", "name", "short_name"}
    events: list           # [{"id", "deadline", "waivers_deadline", "finished"}], by id
    scoring: dict          # Draft settings.scoring
    squad_rules: dict      # Draft settings.squad
    live: dict = field(default_factory=dict)      # gw -> Player id -> stats (finished gws)
    fixtures: dict = field(default_factory=dict)  # gw -> [fixture]

    @property
    def last_finished(self):
        return max((e["id"] for e in self.events if e["finished"]), default=0)

    def next_gw(self, now):
        """First gameweek whose Gameweek deadline is still ahead (None after the season)."""
        return next((e["id"] for e in self.events if e["deadline"] > now), None)

    def event(self, gw):
        return next((e for e in self.events if e["id"] == gw), None)


def load_season(api):
    boot = api.get("bootstrap-static")
    _require(boot, {"elements", "teams", "events", "settings"}, "bootstrap-static")
    _require(boot["events"], {"data"}, "bootstrap-static.events")
    _require(boot["settings"], {"scoring", "squad"}, "bootstrap-static.settings")
    if not boot["elements"]:
        raise ApiShapeError("bootstrap-static: no Players")
    for e in boot["elements"]:
        _require(e, ELEMENT_FIELDS, f"element {e.get('id')}")
    for ev in boot["events"]["data"]:
        _require(ev, EVENT_FIELDS, f"event {ev.get('id')}")

    events = sorted(({"id": ev["id"], "deadline": parse_time(ev["deadline_time"]),
                      "waivers_deadline": parse_time(ev["waivers_time"]),
                      "finished": bool(ev["finished"])} for ev in boot["events"]["data"]),
                    key=lambda e: e["id"])
    season = Season(
        players={e["id"]: {k: e[k] for k in ELEMENT_FIELDS} for e in boot["elements"]},
        teams={t["id"]: {"id": t["id"], "name": t["name"], "short_name": t["short_name"]}
               for t in boot["teams"]},
        events=events, scoring=boot["settings"]["scoring"], squad_rules=boot["settings"]["squad"])

    last = season.last_finished
    for gw in range(1, max(e["id"] for e in events) + 1):
        d = api.get(f"event/{gw}/live")
        _require(d, {"elements", "fixtures"}, f"event/{gw}/live")
        for f in d["fixtures"]:
            _require(f, FIXTURE_FIELDS, f"event/{gw}/live fixture")
        season.fixtures[gw] = [{k: f[k] for k in FIXTURE_FIELDS} for f in d["fixtures"]]
        if gw <= last:
            els = d["elements"]
            if not els:
                raise ApiShapeError(f"event/{gw}/live: finished gameweek has no Player stats")
            stats = {}
            for pid, e in els.items():
                _require(e, {"stats"}, f"event/{gw}/live element {pid}")
                _require(e["stats"], LIVE_STATS, f"event/{gw}/live element {pid} stats")
                stats[int(pid)] = {k: e["stats"][k] for k in LIVE_STATS}
            season.live[gw] = stats
    return season
