include <pegs.scad>;

difference() {
    import("./board_def.stl",convexity=2); // convexity just for visual preview
    
    union() {
        original_peg_layout(peg_r=.601, peg_z_start=0);
        
        // finish removing the abnormal pins in second row
        peg(h_spacing * 2.5, v_spacing * 5, cyl_scale=[1.1,1.25,1], cyl_twist_angle=-35);
        peg(h_spacing * 3.5, v_spacing * 5, cyl_scale=[1.1,1.25,1], cyl_twist_angle=-35);
        peg(h_spacing * -2.5, v_spacing * 5, cyl_scale=[1.1,1.25,1], cyl_twist_angle=35);
        peg(h_spacing * -3.5, v_spacing * 5, cyl_scale=[1.1,1.25,1], cyl_twist_angle=35);
    }
}

// an attempt to clean up geometry. ultimately should just clean it up before printing since not really feasible to make the geometry work perfectly when I add new pegs
// rotate([90, 0, 0]) translate([0, 0, 3.24]) linear_extrude(.56) polygon([
//    [37.2, 9.2],
//    [-37.2, 9.2],
//    [-15.2,  -24],
//    [0, -27],
//    [15.2,  -24]
//]);