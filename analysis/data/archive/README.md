# archived runs

These are physically incomparable with the runs in `analysis/data/`, so they're
kept out of the way here. `load_all()` globs `data/*.csv` and doesn't recurse,
so archiving a file is enough to exclude it from the analysis.

Two changes are why:

- **Ball channel depth.** These were run with the panes at z -5.04 and -0.04, a
  5mm channel. The real channel is 2.7mm (z -3.24..-0.54, the gap between the
  printed back plate and the clear cover), and the extra 1.8mm was empty space
  *behind* the plate. 0.6-1.2% of the balls in each of these runs had leaked
  into that void, while still counting toward buckets by x/y.
- **No settle detection.** Each was exported by hand at whatever step the
  dblclick happened (1876, 2590, 6026, 13995), so they're sampled at different
  and unknown points in the run rather than at rest.

They also predate the seeded RNG, so they can't be reproduced exactly.

Worth keeping rather than deleting: they're the only runs at 1600 and 3000
balls, and the only `recreateoriginalboard` run.
