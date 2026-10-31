# Published data format

The Model job (`model/`, run by the "Model job" workflow) publishes these files to `data/` on `main`. The browser reads them from `https://raw.githubusercontent.com/fmaggipinto/outdraft/main/data/…`, which allows cross-site reads and caches for 5 minutes.

All times are UTC ISO strings (`2026-11-06T18:30:00Z`). Player and team IDs are FPL Draft IDs, the same IDs the League endpoints use. Every `updated_at` is the time the file's content last changed: files are only rewritten when something other than the timestamp changes.

## `manifest.json`

```json
{
  "updated_at": "2026-11-01T12:00:00Z",
  "model": { "version": 1, "params": { "w": 0.5, "k": 1.0, "corr": 0.295, "mae": 2.152, "n": 1480, "backtest_gws": [4, 8], "tuned_at": 8 } },
  "first_snapshot_gameweek": 10,
  "snapshots": [10, 11],
  "gaps": []
}
```

- `snapshots`: gameweeks that have a Snapshot file.
- `gaps`: gameweeks from `first_snapshot_gameweek` onwards whose Gameweek deadline passed with no Snapshot. They are never backfilled (ADR-0001).
- `params`: the Model's tuned parameters. `corr` and `mae` come from the backtest over `backtest_gws`. A backtest re-tunes the past and is not the Model check.

## `projections.json`

The latest Projections for the next (up to) 6 gameweeks.

```json
{
  "updated_at": "…",
  "model_version": 1,
  "params": { "w": 0.5, "k": 1.0, "…": "…" },
  "based_on_gameweek": 8,
  "gameweeks": [10, 11, 12, 13, 14, 15],
  "events": [{ "gameweek": 10, "deadline": "…", "waivers_deadline": "…" }],
  "teams": [{ "id": 1, "name": "Arsenal", "short_name": "ARS" }],
  "squad_rules": { "size": 15, "play": 11,
                   "min_play": { "1": 1, "2": 3, "3": 2, "4": 1 },
                   "max_play": { "1": 1, "2": 5, "3": 5, "4": 3 } },
  "fixtures": [{ "gameweek": 10, "home": 9, "away": 7, "kickoff": "…" }],
  "players": [{
    "id": 1, "name": "Raya", "first_name": "David", "second_name": "Raya Martín",
    "team": 1, "position": 1, "status": "a", "chance_next": null, "news": "", "draft_rank": 40,
    "minutes": 720, "total_points": 38, "points_avg_capped": 4.25, "starts_recent": 6, "points_recent": [2, 6, 1, 2, 9, 6],
    "xg90": 0.0, "xa90": 0.012,
    "projections": [5.3, 4.6, 4.0, 3.9, 4.8, 4.2]
  }]
}
```

- `based_on_gameweek`: the last finished gameweek whose data the Model used.
- `squad_rules`: the Draft lineup rules, keyed by position. A Best XI fields `play` Players, with between `min_play` and `max_play` from each position.
- `position`: 1 GKP, 2 DEF, 3 MID, 4 FWD.
- `points_avg_capped`: points per finished gameweek with any single score capped at 10, so one haul doesn't dominate. Waiver targets use it to protect a Manager's consistent scorers from drop suggestions.
- `status`: `a` available, `d` doubtful, `i` injured, `s` suspended, `u`/`n` unavailable.
- `projections[i]` is the Projection for `gameweeks[i]`. It sums over all the Player's Fixtures that gameweek (a double gameweek counts twice, a blank gameweek is 0), and has injury status applied: 0 if unavailable, scaled by `chance_next` if doubtful.
- `fixtures` lists every Fixture in `gameweeks`. A club with two entries in a gameweek has a double, and a club with none has a blank.

## `snapshots/gwNN.json`

One file per gameweek, frozen at its Gameweek deadline.

```json
{
  "updated_at": "…",
  "gameweek": 10,
  "deadline": "2026-11-06T18:30:00Z",
  "model_version": 1,
  "params": { "…": "…" },
  "based_on_gameweek": 8,
  "projections": { "1": 5.3, "2": 0.0 }
}
```

`projections` maps every Player id (as a string) to that gameweek's Projection. Every run before `deadline` may refresh the file. After it, the job refuses to write it.
