import json
import math
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / 'models' / 'custom'

# Canonical proportions (in JS-sim units; mirror src/constants.js
# and the Ball default in src/balls.js). Both outputs derive from
# these, so peg/ball/spacing ratios match between the printed board and the sim.
COL_SPACING_REF = 2 * 1.2    # JS 2 * PEG_SPACING_X (horizontal distance between adjacent pegs in a row)
ROW_SPACING_REF = 2.    # JS PEG_SPACING_Y
PEG_RADIUS_REF = 0.25    # JS PEG_RADIUS
BALL_RADIUS_REF = 0.3   # JS Ball default radius

# SCAD scale picked so col_spacing stays at 14 mm (the original printable size).
SCAD_SCALE = 14.0 / COL_SPACING_REF


def compute_peg_positions(cdf_func, N):
    """
    Compute laterally-shifted peg positions in JS-sim units that bias each row's
    branch probabilities so the bottom-row distribution matches cdf_func.
    Returns (peg_positions, p) where peg_positions[r] is a list of [x, y] pairs.
    """
    T = []
    for k in range(N + 1):
        if k == 0:
            val = cdf_func(0)
        else:
            val = cdf_func(k) - cdf_func(k - 1)
        T.append(max(0.0, val))

    total = sum(T)
    if total == 0:
        raise ValueError("CDF yields zero probability across all bins.")
    T = [t / total for t in T]

    M = {}
    p = {}
    for c in range(N + 1):
        M[(N, c)] = T[c]

    for r in range(N - 1, -1, -1):
        for c in range(r + 1):
            left_flow = ((r + 1 - c) / (r + 1)) * M[(r + 1, c)]
            right_flow = ((c + 1) / (r + 1)) * M[(r + 1, c + 1)]
            M[(r, c)] = left_flow + right_flow

            if M[(r, c)] > 1e-9:
                p[(r, c)] = right_flow / M[(r, c)]
            else:
                p[(r, c)] = 0.5

    peg_positions = []
    for r in range(N):
        row = []
        for c in range(r + 1):
            x = (c - r / 2.0) * COL_SPACING_REF
            y = -r * ROW_SPACING_REF
            shift = (0.5 - p[(r, c)]) * COL_SPACING_REF
            row.append([x + shift, y])
        peg_positions.append(row)
    return peg_positions


def write_scad(peg_positions, N, filename):
    peg_radius = PEG_RADIUS_REF * SCAD_SCALE
    ball_radius = BALL_RADIUS_REF * SCAD_SCALE
    col_spacing = COL_SPACING_REF * SCAD_SCALE
    row_spacing = ROW_SPACING_REF * SCAD_SCALE
    peg_height = 8.0
    board_thickness = 4.0
    wall_thickness = 2.0

    width = (N + 2) * col_spacing
    height = (N + 4) * row_spacing

    scad = [
        "// Procedural Quincunx Board for Arbitrary CDF",
        "$fn = 50;",
        f"peg_radius = {peg_radius:.4f};",
        f"ball_radius = {ball_radius:.4f}; // recommended marble radius (matches sim)",
        f"peg_height = {peg_height};",
        f"row_spacing = {row_spacing:.4f};",
        f"col_spacing = {col_spacing:.4f};",
        f"board_thickness = {board_thickness};",
        f"wall_thickness = {wall_thickness};",
    ]

    scad.append("\ndifference() {")
    scad.append(f"  translate([0, {-height/2 + row_spacing * 1.5}, -board_thickness/2])")
    scad.append(f"    cube([{width}, {height}, board_thickness], center=true);")
    scad.append("}")

    scad.append("\nunion() {")

    for r in range(N):
        for c in range(r + 1):
            x_js, y_js = peg_positions[r][c]
            x = x_js * SCAD_SCALE
            y = y_js * SCAD_SCALE
            scad.append(f"  translate([{x:.3f}, {y:.3f}, 0]) cylinder(h=peg_height, r=peg_radius);")

    bin_top_y = -N * row_spacing + row_spacing / 2
    bin_length = row_spacing * 4
    for c in range(N + 2):
        x = (c - (N + 1) / 2.0) * col_spacing
        scad.append(f"  translate([{x:.3f}, {bin_top_y - bin_length/2:.3f}, peg_height/2])")
        scad.append(f"    cube([wall_thickness, {bin_length}, peg_height], center=true);")

    scad.append("}")

    outpath = OUTPUT_DIR / filename
    with open(outpath, "w") as f:
        f.write("\n".join(scad))
    print(f"Successfully generated {outpath}")


def write_peg_positions_json(peg_positions, N, filename):
    data = {
        "pegRadius": PEG_RADIUS_REF,
        "ballRadius": BALL_RADIUS_REF,
        "pegRows": N,
        "pegPositions": peg_positions,
    }

    outpath = OUTPUT_DIR / filename
    os.makedirs(os.path.dirname(outpath) or ".", exist_ok=True)
    with open(outpath, "w") as f:
        json.dump(data, f, indent=2)
    print(f"Successfully generated {outpath}")


def generate(cdf_func, N, scad_filename="arbitrary_quincunx.scad",
             json_filename="peg_positions.json"):
    peg_positions = compute_peg_positions(cdf_func, N)
    write_scad(peg_positions, N, scad_filename)
    write_peg_positions_json(peg_positions, N, json_filename)


def bimodal_cdf(k):
    """An arbitrary CDF demonstrating a two-humped final distribution."""
    N = 12

    def gaussian_cdf(x, mu, sigma):
        return 0.5 * (1 + math.erf((x - mu) / (sigma * math.sqrt(2))))

    v1 = gaussian_cdf(k, N * 0.2, .25)
    v2 = gaussian_cdf(k, N * 0.8, .25)
    return (v1 + v2) / 2


if __name__ == "__main__":
    generate(bimodal_cdf, N=12)
