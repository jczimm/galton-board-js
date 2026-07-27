# TODO

- [-] Make an alternative version in which, instead of placing pegs, we the negative space like the toys have!
  - [x] actually, let's try loading in an stl file and simulating .5mm metal balls in it (STL taken from https://makerworld.com/en/models/517003-galton-board#profileId-433233)
- [-] and ensure generate.py and the js simulation of the pegs are in parity

- [x] fix build of from-stl.html -- need to include from-stl.js in the rollup build somehow

- [x] fix the sim showing a right-skew; it shouldn't be, unless there's something with the model (try both mirroring and changing triangle index order)? or try rotating the pegs so there's a flat face upwards? or give the pegs a new flat surface on top?
  > **Trimesh triangle index order.** The mirror test flips vertex positions but geometry.index is unchanged. If Rapier accumulates contact impulses by traversing triangles in index order, and the index list happens to enumerate left-side triangles before right-side (or vice versa), you get a chirality the mirror test can't detect. Hard to fix without re-exporting/reshuffling the STL.
  - just needed to add in the flag TriMeshFlags.FIX_INTERNAL_EDGES!

- [c] ~~try adding back some randomness to the positions of the balls in initialization so that we can get a sampling distribution of the mean of the output curve and ensure that its mean approaches 0 (otherwise, we still have some unexpected asymmetry!)~~ there is randomness again actually!
- [x] prevent balls from entering the holes on the bottom edge of the model
- [x] in the analysis, exclude balls that aren't even in the buckets at all (e.g. got stuck on a peg)

## Current goal: sensitivity gut-check on board_def

Scope is deliberately small. Only board_def / recreate_original_board, no peg
optimization yet. The question is just: **how much do the material coefficients
actually move the output distribution?** — so I know how carefully they need to be
pinned down before moving on to boards targeting other PDFs.

Note from the reference photos (`analysis/reference/`): the real board's output is
NOT very normal — it's jagged and asymmetric. So normality was never the right
target; the metric needs to be a distance to an arbitrary target PDF, and the
photos give a better empirical target than a gaussian does.

### A. make runs comparable and automatable

- [x] seed the RNG (mulberry32, `seed` URL param) so runs are reproducible. verified: same seed twice -> bit-identical CSV; seed 0 and seed 1 differ (`num()` deliberately doesn't collapse 0 into the default).
- [x] auto-terminate on settle instead of dblclick-to-export. a run ends when every remaining ball has been under 0.05 units/s for 60 consecutive steps (checked every 15), with a 120-step guard at the start and a `maxSteps` cap; `settled-0/1` and `seed` go into the filename.
  > without this, every old CSV in analysis/data was sampled at whatever step I happened to click (169 ... 13995), so runs weren't at comparable settle states
  - `autorun` URL param steps free of the display clock (~20x faster) and publishes the result on `window.__simResult` / `window.__simDone` instead of downloading. verified bit-identical to a clock-paced run of the same seed (2955 steps either way, 38.6s vs ~2s).
  - two things had to move to make that true: CCD toggling and escapee removal used to run per *frame*, so they depended on frame rate; they're now keyed to step count. **this slightly changes the physics vs. the existing CSVs in analysis/data** — those were already incomparable, so they should be regenerated rather than mixed in.
  - stepping now waits for the STL to finish loading. previously the world stepped an empty scene while the mesh loaded, which both tripped settle detection instantly (found by testing: a false "settled" at step 165) and made step 0 mean something different depending on load time.
- [x] playwright driver: `pnpm sweep --balls 800 --seed 1,2,3 --ballRest .7,.85` — every sim param takes a comma-separated list, the grid is their cartesian product. starts its own vite server, runs `--concurrency` pages at a time, writes each CSV into analysis/data.
  > deliberately NOT porting the sim to node — keeping the exact validated physics path, just automating the page. reads `window.__simResult` after `window.__simDone`, no download interception.
  - headless chromium (SwiftShader) reproduces real-Chrome runs bit-for-bit — same hashes, same step counts. so the sweep and the interactive page are the same experiment.
  - resumable: the page publishes `window.__simRunKey` before stepping, so an already-collected run is skipped on page load rather than after re-running it (the filename can't be known up front — it contains `steps`).
  - `--dry-run` prints the grid, `--headed` watches one, `--base-url` reuses an already-running dev server.
- [x] the STL was baked in at build time, and was set to `clear_board.stl` — the board with NO pegs. so any run made without editing the import was measuring a funnel, not a galton board. the model is now a runtime param (`?model=boarddef`, default boarddef) with all three boards bundled, so `--model` can be swept like anything else.

### B. fix the measurement

- [x] bucket edges now come from the board STL (`analysis/geometry.py`), not from `np.linspace(x.min(), x.max())`. the dividers are 1.05mm fins on a 4.8mm pitch (= `h_spacing`), giving **16 buckets**: 14 full-width plus 2 narrower (2.96mm) edge buckets. all three boards share the same bucket geometry.
  > validated against the data: zero balls land within 0.5mm of any derived fin centre, hundreds at each bucket middle. the fins top out at y = -12.4, which is where the old hand-picked `y < -12` came from — it's now derived.
  > effect: variance across the 800/1600/3000-ball runs went from 273-383 (mostly a function of ball count, via the floating bins) to 191-225. the leftover spread is real.
- [x] per-bucket counts instead of `mean(y - y.min())` per bin. this also removed the 0/0 divide warning by construction.
- [x] `normality_r2` generalized: `summarize(..., target=<per-bucket probability vector>)` reports `fit_r2`, `chi2_per_dof` and `w1_mm` (earth-mover, in mm — it cares *where* the mass is wrong). target defaults to the gaussian matched to the run's own mean/variance, so the old normality check is just one special case. verified: a target compared with itself gives r2 exactly 1.0, uniform gives exactly 0.
- [x] balls are now split into caught / stuck / outside by geometry instead of being silently dropped by a y filter.
  > this immediately flagged junk: two of the 250-ball CSVs have all 250 balls `n_stuck` (exported long before anything reached the buckets) and a third has 234 stuck / 16 caught. those three files should be deleted rather than analysed.

### C. physical fidelity gaps the reference photos exposed

- [x] **board tilt**: `tilt` URL param, in degrees back from vertical. gravity becomes `(0, -g*cos(tilt), -g*sin(tilt))`, so in-plane gravity drops and the remainder presses balls toward the back plate (-z, the side the pegs stand on). confirmed working: mean ball z shifts -1.89 -> -2.02 at tilt 20.
  - **default stays 0**, so it doesn't silently invalidate comparisons. D sweeps it; the photos suggest the real stand holds ~15-25 deg.
  - first look (2 seeds, 400 balls): tilt 20 vs 0 moves variance less than the seed-to-seed spread does. needs D's noise floor before that means anything.
- [c] ~~**feed geometry**: the real board feeds through a narrow funnel throat, while `spawnBatch` spreads balls over `0.2 * bboxSize.x`, so the input width convolves into the output variance~~ — **checked, and this was wrong.** a cross-section of the mesh at the ball plane shows the funnel narrowing from 82.8mm at y=62 to a ~7mm throat at y≈32, above the first peg row. every ball has to pass through it regardless of where it spawned, so the spawn width isn't the input distribution — the throat is.
  > measured: spawnSpread .04 (a near point source, +/-1.7mm) vs .5 (+/-20.7mm) gives variance 223 / 221 / 230 across 3 seeds each, with within-group sd 5-14. a 12x change in feed width lands inside the seed noise.
  > `spawnSpread` is still a param so it can be swept, and the vertical spawn jitter no longer reuses `spreadX` — it did, so sweeping feed width would have changed the drop height at the same time.
- [x] **ball channel depth** (found while doing the above): the panes were at z -5.04 and -0.04, a 5mm channel, but the fins and pegs both span z -3.24..-0.54 — the real 2.7mm gap between the printed back plate and the clear cover. the extra 1.8mm was empty space *behind* the plate, and 0.8% of balls in the old data had leaked into it (they still counted toward buckets by x/y). panes now match the measured channel; the leak is 0% in new runs.
  > this is the same class of bug as the holes in the bottom edge. tilt would have made it much worse by pressing balls straight into that void.

### D. the gut check itself

- [x] noise floor: 8 seeds at baseline, 800 balls. variance sd **7.70** (3.5% of 218.9), skewness sd 0.050 (mean -0.005, symmetric within noise), fit_r2 sd 0.021, w1 sd 0.127mm, mean sd 0.53mm.
- [x] one-at-a-time sweep, 3 seeds x 15 levels across 7 params, 800 balls, 56 runs total. `uv run python analysis/sensitivity.py`.

### ANSWER: only the ball's own properties matter

| rank | param | worst \|z\| | max variance shift | verdict |
|---|---|---|---|---|
| 1 | **ballRest** | 15.2 | +42 (+19%) | dominates everything |
| 2 | **ballFric** | 5.3 | +28 (+13%) | clearly matters |
| 3 | paneFric | 3.0 | -16 (-7%) | small, and saturates |
| 4 | paneRest | 2.3 | +3 | borderline, skewness only |
| 5 | boardRest | 2.0 | -5 | at the noise floor |
| 6 | tilt | 1.6 | -8 | not detectable, 0-30 deg |
| 7 | boardFric | 1.5 | -1 | no effect |

- **ballRest is the one coefficient that has to be pinned down.** .5 -> variance 261 vs 219 at .85 (fit_r2 z=-15.2, w1 z=+11.3), monotonic. .7 is already indistinguishable from .85 (z=1.8), so the sensitivity is concentrated below ~.7.
- **ballRest .95 never settles at all** — all 3 seeds hit the 60000-step cap still bouncing. excluded from the table; that's a property of the setting, not a failed run.
- **ballFric** second: .02 -> +28 variance, .3 -> -13. monotonic, more friction = less spread.
- **paneFric saturates**: .3 and .6 give the same -15. so it's a threshold, not a dial.
- **board material barely matters.** boardRest and boardFric over 4x and 20x ranges both sit at the noise floor.
- **tilt does not matter over 0-30 deg**, and the shifts aren't even monotonic (-8.3, +2.2, -0.7) — that's noise, not a trend. this contradicts what I expected in section C, where I argued tilt would make pane friction load-bearing. it doesn't, at least not on its own.

**what this means going forward:** the balls are the same steel spheres on every board, so calibrate `ballRest` and `ballFric` once against the real board and the rest of the coefficients can stay approximate. that's the confidence I was after before designing boards for other PDFs.

**caveats, honestly:**
- one-at-a-time only, so **no interactions**. tilt x paneFric is exactly the combination C predicted would matter and this design cannot see it. worth one small 2x2 factorial before fully dismissing tilt.
- 3 seeds per level: \|z\| < 2 means "not detectable at 800 balls with 3 seeds", not "zero".
- conclusions only hold inside the ranges tried.

### E. reference target from the photos

- [x] `analysis/photo.py` reads a bucket distribution off both photographs. no homography needed in the end — locating each divider in the image absorbs the mild perspective directly.

#### ANSWER: the sim already matches the real board as well as the board matches itself

| | variance | skew | normality r2 |
|---|---|---|---|
| still photo | 284.5 | -0.053 | 0.915 |
| animation, last frame | 195.2 | +0.016 | 0.981 |
| sim (800 balls, defaults) | 218.4 | -0.003 | 0.985 |

earth-mover distance between distributions, in mm:

| pair | distance |
|---|---|
| **still <-> anim (two real runs)** | **2.42** |
| still <-> sim | 1.80 |
| anim <-> sim | 1.52 |
| sim seed-to-seed | 0.84 |

- **the sim is closer to each photo than the photos are to each other.** so there's no evidence the sim is mis-calibrated — the real board's own run-to-run spread exceeds its disagreement with the sim.
- **"the real board isn't very normal" doesn't survive two samples.** still r2 0.915, animation 0.981, sim 0.985. the jaggedness in any one photo is mostly sampling noise, and the two photos disagree about the tails (still has 1.8%/3.3% in the outer left buckets, the animation 0.3%/0.4%) more than either disagrees with the sim.
- **physical run-to-run spread dwarfs every coefficient effect from D.** the two photos differ by 89 in variance; the largest coefficient effect measured was ballRest at 42, and sim seed noise is 7.7. so photos cannot discriminate between coefficient settings — 2 realizations is far too few. they can only say the sim is in the right ballpark, which they do.
- caveats: n=2, unknown ball count in each, and the animation frame is low resolution (2.25 px/mm vs 7.23), so its tails are the least trustworthy part of the comparison.

- [x] free sanity check: an ideal 10-row lattice gives variance 57.6 mm^2 (sigma 7.6mm). observed is **3.4-4.9x that in variance** (1.8-2.2x in sigma), across photos and sim alike.
  > **this matters for the parked surrogate work.** a ball is not making one +/-2.4mm decision per row. with 3.6mm gaps between 1.2mm pegs and 1mm balls it travels much further sideways per row than the lattice picture assumes — so `shift = (0.5 - p) * COL_SPACING_REF` in generate-custom.py rests on a model this board doesn't obey. measure p(delta) before trusting it.
- [c] ~~the webm may give more realizations~~ — checked: it's a **different board** (different stand and background), shot at a steep angle with motion blur, so it's not usable for per-bucket measurement. `building_instructions.pdf` is vector-only with no extractable text, so no stated tilt angle or ball count.
- [ ] extraction notes worth keeping: the still is sharp enough that balls separate by local *texture*, but the animation frame is so soft that the fin edges are the highest-contrast thing in it — every column read as completely full until the mask switched to a brightness (otsu) split. and the divider comb must be fitted to the gaps between *ball* columns, not to the bright fins: the board rim is bright too, and fitting to fins locked one bucket right, silently dropping a real bucket and reading the rim as the sixteenth. both fits were checked by drawing them over the photo.

### F. housekeeping

- [x] brief README update: a short section up top on the STL board (from-stl.html, rapier3d-simd, URL params, the settle-and-export CSV convention with `phys-N`), the sweep driver, and analysis/ — with the LIT/cannon-es component kept below as the second, older simulation.

## Parked until custom boards (do NOT start yet)

- [ ] Bernoulli/lattice surrogate. `cad/generate-custom.py` already does the inverse problem (backward flow -> per-peg branch probability p -> peg shifts). its ONE physical assumption is `shift = (0.5 - p) * COL_SPACING_REF` (line 62), which has never been checked. the real work is measuring the deflection curve p(delta) in sim and substituting it for that line.
  - [ ] also: the backward pass splits flow to parents with unbiased Pascal weights (`(r+1-c)/(r+1)`), which is only exact when p == 0.5 everywhere. the forward map is cheap and differentiable, so just least-squares fit the p's to the target instead. it's underdetermined (78 p's, 13 bins) — regularize toward p=0.5 to keep shifts small and stay in the trustworthy part of the p(delta) curve.
  - [ ] test the lattice assumption itself via contact instrumentation (which peg does each ball touch, in order). needs pegs as separate colliders.
- [ ] pegs as programmatic Rapier colliders instead of unioned into the STL. they're `cylinder(r=.6, $fn=36)` (pegs.scad), i.e. 36-gon prisms — so a convex hull of the same vertices is geometrically identical, not an approximation. verify once by comparing recreate_original_board.stl (one trimesh) vs clear_board.stl + JSON pegs at the same seeds, judged against the noise floor. emit the .scad and the peg JSON from one param set so nothing is hand-translated.
- [ ] why does the modification in board_def.stl (shifting four pegs in the top row) make the distribution more normal? (answer mechanistically with the surrogate, not by parameter search)
- [ ] full optimization loop for an arbitrary target PDF. if the surrogate holds up, optimize in surrogate space and use the full sim only to verify — probably no need for CMA-ES over the sim itself.
