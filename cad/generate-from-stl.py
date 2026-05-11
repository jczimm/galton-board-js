import("./models/simulate-stl/board_def.stl")

board_thickness = 4;

translate([0, -75.83333333333334, -board_thickness/2])
    cube([196.00000000000003, 186.66666666666669, board_thickness], center=true);