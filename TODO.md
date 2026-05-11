# TODO

- [-] Make an alternative version in which, instead of placing pegs, we the negative space like the toys have!
    - [x] actually, let's try loading in an stl file and simulating .5mm metal balls in it (STL taken from https://makerworld.com/en/models/517003-galton-board#profileId-433233)
- [-] and ensure generate.py and the js simulation of the pegs are in parity

- [x] fix build of from-stl.html -- need to include from-stl.js in the rollup build somehow

- [ ] fix the sim showing a right-skew; it shouldn't be, unless there's something with the model (try both mirroring and changing triangle index order)? or try rotating the pegs so there's a flat face upwards? or give the pegs a new flat surface on top?
    > **Trimesh triangle index order.** The mirror test flips vertex positions but geometry.index is unchanged. If Rapier accumulates contact impulses by traversing triangles in index order, and the index list happens to enumerate left-side triangles before right-side (or vice versa), you get a chirality the mirror test can't detect. Hard to fix without re-exporting/reshuffling the STL.
