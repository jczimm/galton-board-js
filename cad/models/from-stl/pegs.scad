h_spacing = 4.8;
v_spacing = 3.6;
first_row_y = 3.6 * 6;

module original_peg_layout(peg_r=.6, peg_z_start=.54, peg_z_end=3.24) {
    // note: in the second row of board_def.stl, the 2 outermost pegs on each side were shifted slightly up and inwards horizontally for some reason... not sure what effect this had/if this was intentional!
    union() {
        for ( row = [ 0 : 9 ] ) {
            num_pegs_in_row = row == 0 ? 3 : 5 + row;
            start_i = row % 2 ? (num_pegs_in_row / -2) - 1 : (num_pegs_in_row-1)/-2 - 1;
            end_i = row % 2 ? -(start_i+1) : -start_i;
            row_h_offset = (row % 2) * (h_spacing / 2);
            for ( i = [start_i : end_i] ){
                peg(x = i * h_spacing + row_h_offset, y = first_row_y - row * v_spacing, r = peg_r, z_start=peg_z_start, z_end=peg_z_end);
            }
        }
    }
}

module peg(x=0, y=0, r=.6, z_start=0.54, z_end=3.24, cyl_scale=[1,1,1], cyl_twist_angle=0) {
    $fn = 36;
    rotate([90, 0, 0])
    translate([x, -2.25659 - y, z_start])
    rotate([0, 0, cyl_twist_angle])
    scale(cyl_scale)
    cylinder(h = z_end - z_start, r = r, center = false);
}