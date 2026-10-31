# Outdraft

A web app for FPL Draft that analyses the competition inside a League, alongside each Manager's own squad decisions.

## Language

### League and people

**League**:
An FPL Draft league, identified by its league ID. The League is the unit the app is organised around: one shareable link per League.
_Avoid_: mini-league, group

**Manager**:
A participant in a League who owns exactly one Squad.
_Avoid_: user, team, entry, owner

**Viewer**:
The person looking at the app. A Viewer sees the whole League and may claim one Manager as themselves.
_Avoid_: user, visitor

**Claimed Manager**:
The Manager a Viewer has identified as themselves; personal views (targets, suggestions) are computed for this Manager.
_Avoid_: me, my team, home team

### Football

**Player**:
A Premier League footballer who can be owned in FPL Draft.
_Avoid_: footballer, asset

**Squad**:
The 15 Players a Manager currently owns.
_Avoid_: team, roster

**Fixture**:
A Premier League game between two clubs.
_Avoid_: match, game

### Predictions

**Model**:
The method that turns Player data into Projections. v1 uses the existing xG-based formula; it is designed to be replaceable.
_Avoid_: algorithm, engine

**Projection**:
A Player's expected points for a specific future gameweek, produced by the Model.
_Avoid_: prediction, forecast, xP (in prose)

**Model check**:
A comparison of Snapshots with the points Players actually scored. Past Projections are never recomputed for it.
_Avoid_: backtest, validation

**Snapshot**:
The set of Projections for one gameweek, frozen just before its Gameweek deadline and kept unchanged afterwards.
_Avoid_: archive, history, saved predictions

**Best XI**:
The highest-projected valid starting lineup a Squad can field in a given gameweek.
_Avoid_: optimal team, starting eleven

**Squad strength**:
The sum of a Manager's Best XI Projections over a chosen number of upcoming gameweeks (1, 3 or 6), assuming current Squads and optimal lineups. It describes a Squad's potential, not what its Manager will do.
_Avoid_: power ranking, team rating, forecast

**Score distribution**:
The range of points a Player might score in a gameweek, with their likelihoods. The Projection is its average.
_Avoid_: variance model, uncertainty

### League formats

**League format**:
How a League ranks its Managers: Classic (total points) or Head-to-head.
_Avoid_: scoring type, league type

**Matchup**:
In a Head-to-head League, the pairing of two Managers in a gameweek, decided by who scores more points.
_Avoid_: fixture (reserved for Premier League games), game, match

**Win probability**:
The estimated chance that a Manager wins a Matchup, with a separate chance of a draw, derived from Score distributions.
_Avoid_: odds, chance

### Transactions

**Trade**:
An exchange of Players between two Managers in the same League, which only happens if both accept.
_Avoid_: swap, deal

**Win-win trade**:
A 1-for-1 or 2-for-2 Trade that raises the Squad strength of both Managers involved.
_Avoid_: fair trade, balanced trade

**Free agent**:
A Player not in any Squad in the League.
_Avoid_: unowned player, available player

**Waiver order**:
The priority in which Managers' waiver claims are processed at the Waiver deadline.
_Avoid_: waiver priority, pick order

**Waiver target**:
A Free agent whose addition would raise the Claimed Manager's Squad strength.
_Avoid_: pickup, recommendation

**Rival interest**:
An estimate of which other Managers would gain most from a Free agent, and whether they are ahead of the Claimed Manager in the Waiver order. It estimates who should want the Player, not who will claim him.
_Avoid_: competition, contested players

### Calendar

**Gameweek deadline**:
The moment a gameweek's lineups lock.
_Avoid_: deadline (unqualified), lock

**Waiver deadline**:
The moment, about a day before the Gameweek deadline, after which pending waiver claims are processed.
_Avoid_: deadline (unqualified)
