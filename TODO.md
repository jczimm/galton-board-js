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
- [ ] vary restitution and friction coefficients and analyze the resulting data to how sensitive the measures (normality_r2 and the three moments) are to each coefficient. this way I can develop some confidence about the results given uncertainty about these coefficients-- i.e. determine which coefficients I need to get a good measure of. (this is all under the assumption that board_def.stl actually gives a normal distribution!)
- [ ] make a pipeline which manipulates the pegs to optimize for some arbitrary PDF (include modifying a .scad file (like recreate_original_board.scad), rendering it using the openscad CLI, then automatically open the simulation, download the CSV when sim is "done", analyze to get an error signal, and repeat)
  - [ ] why does the modification in board_def.stl (shifting four pegs in the top row) help the distribution more normal?
