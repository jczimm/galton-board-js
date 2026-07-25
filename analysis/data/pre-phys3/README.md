# runs from before the physics version tag

Everything here predates `phys-3` and the `phys` token in the filename. These
were produced under two different ball-channel geometries whose runs are
*indistinguishable by filename* -- same parameters, different physics -- which
is why the version tag now exists.

- **phys 1** (5mm channel, panes at -5.04 and -0.04): 0.6-1.2% of balls sat in
  the 1.8mm void behind the plate, and there was no settle detection, so each
  was exported by hand at an arbitrary step. In `archive/`.
- **phys 2** (2.7mm channel, panes flush with the fin tops): sealed the void,
  but left ball centres only 1.7mm of range -- two ball layers where the real
  board fits three. Buckets filled about 1.6x too fast and overflowed the 45mm
  fins at 3000 balls. This is most of what's in this directory, including the
  whole sensitivity sweep.

The sensitivity ranking in TODO.md section D was measured on phys 2. At 800
balls nothing overflowed (fill 12-17mm of 45mm) and the geometry change moved
variance by about one noise-floor unit, so the *ranking* should hold -- but the
absolute numbers would shift if it were re-run.

`load_all()` globs `data/*.csv` without recursing, so nothing here is loaded.
