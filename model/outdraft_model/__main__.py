"""python -m outdraft_model --out data [--only-near-deadline] [--now ISO] [--recorded DIR]"""
import argparse
import json
import sys
from datetime import datetime, timezone

from .api import LiveApi, RecordedApi, parse_time
from .publish import near_deadline, run


def main(argv=None):
    ap = argparse.ArgumentParser(prog="outdraft_model")
    ap.add_argument("--out", default="data", help="directory the JSON files are published to")
    ap.add_argument("--only-near-deadline", action="store_true",
                    help="skip the run unless a Gameweek deadline is within 6 hours")
    ap.add_argument("--now", help="pretend it is this UTC time (ISO), for testing")
    ap.add_argument("--recorded", help="read recorded API responses from this directory")
    args = ap.parse_args(argv)

    now = parse_time(args.now) if args.now else datetime.now(timezone.utc)
    api = RecordedApi(args.recorded) if args.recorded else LiveApi()
    if args.only_near_deadline and not near_deadline(api, now):
        print("No Gameweek deadline within 6 hours; skipping.")
        return 0
    summary = run(api, args.out, now)
    print(json.dumps(summary))
    return 0


if __name__ == "__main__":
    sys.exit(main())
