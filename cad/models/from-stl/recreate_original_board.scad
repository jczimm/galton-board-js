include <pegs.scad>;

union() {
    import("clear_board.stl");
    original_peg_layout();
    // note slight difference in second row discussed in pegs.scad
}