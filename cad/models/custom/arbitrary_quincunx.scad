// Procedural Quincunx Board for Arbitrary CDF
$fn = 50;
peg_radius = 1.4583;
ball_radius = 1.7500; // recommended marble radius (matches sim)
peg_height = 8.0;
row_spacing = 11.6667;
col_spacing = 14.0000;
board_thickness = 4.0;
wall_thickness = 2.0;

difference() {
  translate([0, -75.83333333333334, -board_thickness/2])
    cube([196.00000000000003, 186.66666666666669, board_thickness], center=true);
}

union() {
  translate([-0.583, 0.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-5.348, -11.667, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([4.525, -11.667, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-11.367, -23.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([0.066, -23.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([10.312, -23.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-18.557, -35.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-3.950, -35.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([4.025, -35.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([17.091, -35.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-26.103, -46.667, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-10.424, -46.667, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([1.712, -46.667, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([9.134, -46.667, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([24.362, -46.667, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-33.798, -58.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-17.891, -58.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-1.983, -58.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([3.268, -58.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([15.930, -58.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([31.815, -58.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-41.709, -70.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-25.510, -70.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-9.282, -70.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([6.829, -70.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([7.052, -70.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([23.230, -70.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([39.409, -70.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-49.948, -81.667, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-33.362, -81.667, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-16.717, -81.667, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-0.053, -81.667, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([4.308, -81.667, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([14.036, -81.667, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([30.645, -81.667, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([47.219, -81.667, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-58.711, -93.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-41.606, -93.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-24.358, -93.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-7.054, -93.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([7.000, -93.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([7.000, -93.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([21.036, -93.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([38.253, -93.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([55.388, -93.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-68.278, -105.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-50.578, -105.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-32.400, -105.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-14.054, -105.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-0.000, -105.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([7.000, -105.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([14.000, -105.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([28.036, -105.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([46.227, -105.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([64.201, -105.000, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-77.000, -116.667, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-61.036, -116.667, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-41.392, -116.667, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-21.054, -116.667, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-7.000, -116.667, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([0.000, -116.667, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([14.000, -116.667, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([21.000, -116.667, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([35.037, -116.667, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([55.039, -116.667, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([74.260, -116.667, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-77.000, -128.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-70.000, -128.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-53.716, -128.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-28.054, -128.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-14.000, -128.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-7.000, -128.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([7.000, -128.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([21.000, -128.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([28.000, -128.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([42.037, -128.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([66.593, -128.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([84.000, -128.333, 0]) cylinder(h=peg_height, r=peg_radius);
  translate([-91.000, -157.500, peg_height/2])
    cube([wall_thickness, 46.66666666666667, peg_height], center=true);
  translate([-77.000, -157.500, peg_height/2])
    cube([wall_thickness, 46.66666666666667, peg_height], center=true);
  translate([-63.000, -157.500, peg_height/2])
    cube([wall_thickness, 46.66666666666667, peg_height], center=true);
  translate([-49.000, -157.500, peg_height/2])
    cube([wall_thickness, 46.66666666666667, peg_height], center=true);
  translate([-35.000, -157.500, peg_height/2])
    cube([wall_thickness, 46.66666666666667, peg_height], center=true);
  translate([-21.000, -157.500, peg_height/2])
    cube([wall_thickness, 46.66666666666667, peg_height], center=true);
  translate([-7.000, -157.500, peg_height/2])
    cube([wall_thickness, 46.66666666666667, peg_height], center=true);
  translate([7.000, -157.500, peg_height/2])
    cube([wall_thickness, 46.66666666666667, peg_height], center=true);
  translate([21.000, -157.500, peg_height/2])
    cube([wall_thickness, 46.66666666666667, peg_height], center=true);
  translate([35.000, -157.500, peg_height/2])
    cube([wall_thickness, 46.66666666666667, peg_height], center=true);
  translate([49.000, -157.500, peg_height/2])
    cube([wall_thickness, 46.66666666666667, peg_height], center=true);
  translate([63.000, -157.500, peg_height/2])
    cube([wall_thickness, 46.66666666666667, peg_height], center=true);
  translate([77.000, -157.500, peg_height/2])
    cube([wall_thickness, 46.66666666666667, peg_height], center=true);
  translate([91.000, -157.500, peg_height/2])
    cube([wall_thickness, 46.66666666666667, peg_height], center=true);
}