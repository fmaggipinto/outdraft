# Model check uses frozen Snapshots, never recomputed Projections

The Model check compares Projections with actual points. We freeze each gameweek's Projections as a Snapshot just before the Gameweek deadline and never recompute past Projections, because rerunning today's Model on old gameweeks leaks information (the Model may have been tuned on those gameweeks, and historical data contains later corrections). The cost is that the Model check starts empty at launch and a missed Snapshot can never be recovered, so Snapshots are taken from the first slice onward.
