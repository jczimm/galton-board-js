// Procedural Quincunx Board for Arbitrary CDF
$fn = 50;
peg_radius = 2.3333;
ball_radius = 2.3333; // recommended marble radius (matches sim)
peg_height = 8.0;
row_spacing = 7.0000;
col_spacing = 14.0000;
board_thickness = 4.0;
wall_thickness = 2.0;

difference() {
  translate([0, -45.5, -board_thickness/2])
    cube([196.0, 112.0, board_thickness], center=true);
}

union() {
  translate([-0.583, 0.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-5.348, -7.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([4.525, -7.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-11.367, -14.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([0.066, -14.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([10.312, -14.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-18.557, -21.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-3.950, -21.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([4.025, -21.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([17.091, -21.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-26.103, -28.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-10.424, -28.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([1.712, -28.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([9.134, -28.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([24.362, -28.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-33.798, -35.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-17.891, -35.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-1.983, -35.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([3.268, -35.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([15.930, -35.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([31.815, -35.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-41.709, -42.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-25.510, -42.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-9.282, -42.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([6.829, -42.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([7.052, -42.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([23.230, -42.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([39.409, -42.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-49.948, -49.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-33.362, -49.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-16.717, -49.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-0.053, -49.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([4.308, -49.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([14.036, -49.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([30.645, -49.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([47.219, -49.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-58.711, -56.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-41.606, -56.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-24.358, -56.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-7.054, -56.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([7.000, -56.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([7.000, -56.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([21.036, -56.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([38.253, -56.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([55.388, -56.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-68.278, -63.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-50.578, -63.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-32.400, -63.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-14.054, -63.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-0.000, -63.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([7.000, -63.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([14.000, -63.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([28.036, -63.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([46.227, -63.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([64.201, -63.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-77.000, -70.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-61.036, -70.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-41.392, -70.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-21.054, -70.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-7.000, -70.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([0.000, -70.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([14.000, -70.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([21.000, -70.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([35.037, -70.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([55.039, -70.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([74.260, -70.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-77.000, -77.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-70.000, -77.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-53.716, -77.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-28.054, -77.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-14.000, -77.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-7.000, -77.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([7.000, -77.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([21.000, -77.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([28.000, -77.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([42.037, -77.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([66.593, -77.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([84.000, -77.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-91.000, -94.500, peg_height/2])
    cube([wall_thickness, 28.0, peg_height], center=true);
  translate([-77.000, -94.500, peg_height/2])
    cube([wall_thickness, 28.0, peg_height], center=true);
  translate([-63.000, -94.500, peg_height/2])
    cube([wall_thickness, 28.0, peg_height], center=true);
  translate([-49.000, -94.500, peg_height/2])
    cube([wall_thickness, 28.0, peg_height], center=true);
  translate([-35.000, -94.500, peg_height/2])
    cube([wall_thickness, 28.0, peg_height], center=true);
  translate([-21.000, -94.500, peg_height/2])
    cube([wall_thickness, 28.0, peg_height], center=true);
  translate([-7.000, -94.500, peg_height/2])
    cube([wall_thickness, 28.0, peg_height], center=true);
  translate([7.000, -94.500, peg_height/2])
    cube([wall_thickness, 28.0, peg_height], center=true);
  translate([21.000, -94.500, peg_height/2])
    cube([wall_thickness, 28.0, peg_height], center=true);
  translate([35.000, -94.500, peg_height/2])
    cube([wall_thickness, 28.0, peg_height], center=true);
  translate([49.000, -94.500, peg_height/2])
    cube([wall_thickness, 28.0, peg_height], center=true);
  translate([63.000, -94.500, peg_height/2])
    cube([wall_thickness, 28.0, peg_height], center=true);
  translate([77.000, -94.500, peg_height/2])
    cube([wall_thickness, 28.0, peg_height], center=true);
  translate([91.000, -94.500, peg_height/2])
    cube([wall_thickness, 28.0, peg_height], center=true);
}