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
- [ ] playwright script to drive the param grid over URL params headlessly and collect CSVs into analysis/data
  > deliberately NOT porting the sim to node — keeping the exact validated physics path, just automating the page. read `window.__simResult` after `window.__simDone`, no download interception needed.

### B. fix the measurement

- [ ] use fixed bucket-edge bins derived from the CAD geometry, not `np.linspace(x.min(), x.max())`
  > right now the bin edges are data-dependent, so different param settings get different bins and the moments aren't comparable across exactly the conditions being swept. also set n_bins to the real bucket count instead of 16.
- [ ] use per-bucket counts instead of `mean(y - y.min())` per bin
  > mean-y is proportional to fill height only under uniform packing, and packing is itself a function of restitution/friction — i.e. it's confounded with the sweep. positions of every ball are already in the CSV, so counts are free and unbiased.
- [ ] generalize `normality_r2` to a divergence against an arbitrary target PDF (chi-square, or EMD if I care where the mass is wrong). normality becomes one target among others; keep reporting the three moments alongside.

### C. physical fidelity gaps the reference photos exposed

- [ ] **board tilt**: the real board is used tilted back in its stand (~15-25 deg), not vertical. in-plane gravity is g*cos(theta) and the rest presses balls against the back pane — so pane friction is load-bearing in reality but nearly inert in the sim (vertical board, ~no normal force on the panes). rotate the gravity vector and include tilt in the sweep.
- [ ] **feed geometry**: the real board feeds through a narrow funnel throat (see the animation), while `spawnBatch` spreads balls over `0.2 * bboxSize.x`. that input width convolves into the output variance, so some of the current "normal-looking" result may just be inherited from the spawn. spawn above the funnel and let the STL channel them if the hopper is in clear_board.stl.

### D. the gut check itself

- [ ] noise floor: ~5 seeds at fixed params -> spread of each metric. nothing else is interpretable without this.
- [ ] one-at-a-time sweep over ballRest, ballFric, boardRest, boardFric, paneRest, paneFric, + tilt; compare each effect size against the noise floor from above.
  - deliverable: a ranked list of which coefficients actually matter and which are noise. that's the whole point.

### E. reference target from the photos

- [ ] extract per-bucket fill heights from `analysis/reference/board_def.webp` (still) and the last frame of `board_def.gif`. rectify with a homography off the four pane corners (real dimensions known from clear_board.stl bbox), then column-profile the ball mass. normalize -> empirical PDF.
- [ ] the still and the animation's final frame are two independent physical realizations — comparing them gives a real-board run-to-run variability estimate, i.e. how much of the jaggedness is sampling noise vs. structure. do this before treating either profile as a target.
  > caveats: unknown ball count, single realization each, unknown handling/tilt during the run. use as a shape/width plausibility check, not to calibrate 6 coefficients.
- [ ] free sanity check needing no photo: an ideal 10-row lattice gives `sigma = sqrt(10 * .25) * (h_spacing / 2) ~= 3.8mm`. compare to the sim's sigma. big deviation = balls aren't doing a clean lattice walk, which is itself the finding.

### F. housekeeping

- [ ] brief README update: it still describes only the LIT/cannon-es peg component and doesn't mention the STL board at all (from-stl.html, rapier3d-simd, src/extra/from-stl.js), the cad/ dir, the CSV export + filename convention, or analysis/. keep it short.

## Parked until custom boards (do NOT start yet)

- [ ] Bernoulli/lattice surrogate. `cad/generate-custom.py` already does the inverse problem (backward flow -> per-peg branch probability p -> peg shifts). its ONE physical assumption is `shift = (0.5 - p) * COL_SPACING_REF` (line 62), which has never been checked. the real work is measuring the deflection curve p(delta) in sim and substituting it for that line.
  - [ ] also: the backward pass splits flow to parents with unbiased Pascal weights (`(r+1-c)/(r+1)`), which is only exact when p == 0.5 everywhere. the forward map is cheap and differentiable, so just least-squares fit the p's to the target instead. it's underdetermined (78 p's, 13 bins) — regularize toward p=0.5 to keep shifts small and stay in the trustworthy part of the p(delta) curve.
  - [ ] test the lattice assumption itself via contact instrumentation (which peg does each ball touch, in order). needs pegs as separate colliders.
- [ ] pegs as programmatic Rapier colliders instead of unioned into the STL. they're `cylinder(r=.6, $fn=36)` (pegs.scad), i.e. 36-gon prisms — so a convex hull of the same vertices is geometrically identical, not an approximation. verify once by comparing recreate_original_board.stl (one trimesh) vs clear_board.stl + JSON pegs at the same seeds, judged against the noise floor. emit the .scad and the peg JSON from one param set so nothing is hand-translated.
- [ ] why does the modification in board_def.stl (shifting four pegs in the top row) make the distribution more normal? (answer mechanistically with the surrogate, not by parameter search)
- [ ] full optimization loop for an arbitrary target PDF. if the surrogate holds up, optimize in surrogate space and use the full sim only to verify — probably no need for CMA-ES over the sim itself.
