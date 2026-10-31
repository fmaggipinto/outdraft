"""Record FPL Draft API responses as test data, trimmed to the fields the job reads.

    python model/scripts/record_api.py model/tests/data

Re-record at the start of each season: the tests double as a check that the
API still has the shape the job relies on.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from outdraft_model.api import (ELEMENT_FIELDS, EVENT_FIELDS, FIXTURE_FIELDS,  # noqa: E402
                                LIVE_STATS, LiveApi)


def pick(d, keys):
    return {k: d[k] for k in keys if k in d}


def main(out):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    api = LiveApi()

    def save(path, data):
        with open(out / (path.replace("/", "_") + ".json"), "w", encoding="utf-8") as fh:
            json.dump(data, fh, separators=(",", ":"))

    boot = api.get("bootstrap-static")
    save("bootstrap-static", {
        "elements": [pick(e, ELEMENT_FIELDS) for e in boot["elements"]],
        "teams": [pick(t, {"id", "name", "short_name"}) for t in boot["teams"]],
        "events": {"current": boot["events"]["current"], "next": boot["events"]["next"],
                   "data": [pick(e, EVENT_FIELDS) for e in boot["events"]["data"]]},
        "settings": pick(boot["settings"], {"scoring", "squad"}),
    })
    save("game", api.get("game"))
    for e in boot["events"]["data"]:
        gw = e["id"]
        d = api.get(f"event/{gw}/live")
        save(f"event/{gw}/live", {
            "elements": {pid: {"stats": pick(el.get("stats") or {}, LIVE_STATS)}
                         for pid, el in (d.get("elements") or {}).items()},
            "fixtures": [pick(f, FIXTURE_FIELDS) for f in d.get("fixtures") or []],
        })
    print(f"Recorded {len(boot['events']['data'])} gameweeks to {out}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "model/tests/data")
