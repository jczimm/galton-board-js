"""Collect every number the report quotes into one JSON file.

Runs live in two places for a reason: `data/` is the current physics (phys 3),
`data/pre-phys3/` is everything measured before the ball-channel fix. The
sensitivity sweep was only ever run on the older geometry, so it is read from
there and labelled as such rather than silently mixed with current runs.

    uv run python report_data.py
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import polars as pl

from geometry import load_geometry
from load_data import DATA_DIR, load_all
from main import bucket_counts, compute_summary, divergences, gaussian_bucket_probs
from photo import earth_mover, load_profiles, moments
from sensitivity import BALLS, BASELINE, factorial, noise_floor, ranking, sensitivity

OUT = Path(__file__).parent / "figures" / "report.json"


def sim_profiles(data_dir: Path, geom) -> tuple[np.ndarray, list[str]]:
    """Per-seed bucket distributions at baseline parameters."""
    df = load_all(data_dir).filter(pl.col("balls") == BALLS)
    if "settled" in df.columns:
        df = df.filter(pl.col("settled") == 1)
    for key, value in BASELINE.items():
        if key in df.columns:
            df = df.filter(pl.col(key) == value)

    out, names = [], []
    for (name,), group in df.group_by("source_file"):
        counts = bucket_counts(group["x"].to_numpy(), group["y"].to_numpy(), geom)["counts"]
        out.append(counts / counts.sum())
        names.append(name)
    return np.array(out), names


def describe(probs: np.ndarray, geom) -> dict:
    m = moments(probs, geom.centers)
    target = gaussian_bucket_probs(geom, m["mean"], m["variance"])
    d = divergences(np.round(probs * 10000).astype(int), target, geom)
    return {**m, "normality_r2": d["fit_r2"], "probs": probs.tolist()}


def main():
    geom = load_geometry("boarddef")
    photos = load_profiles()

    sims2, _ = sim_profiles(DATA_DIR / "pre-phys3", geom)
    sims3, _ = sim_profiles(DATA_DIR, geom)

    dists = {
        "still_anim": earth_mover(photos["still"].probs, photos["anim_last"].probs, geom.centers),
        "still_sim": earth_mover(photos["still"].probs, sims2.mean(axis=0), geom.centers),
        "anim_sim": earth_mover(photos["anim_last"].probs, sims2.mean(axis=0), geom.centers),
        "sim_seed_to_seed": float(np.mean([
            earth_mover(a, b, geom.centers)
            for i, a in enumerate(sims2) for b in sims2[i + 1:]
        ])),
        "phys2_phys3": earth_mover(sims2.mean(axis=0), sims3.mean(axis=0), geom.centers),
    }

    # sensitivity was measured on phys 2 only
    summary = compute_summary(load_all(DATA_DIR / "pre-phys3")).filter(
        pl.col("tilt").is_not_null(), pl.col("balls") == BALLS
    )
    unsettled = summary.filter(pl.col("settled") == 0)
    settled = summary.filter(pl.col("settled") == 1)
    sens = sensitivity(settled)

    step = geom.pitch / 2
    ideal_var = 10 * 0.25 * (2 * step) ** 2

    data = {
        "geometry": {
            "n_buckets": geom.n_buckets,
            "pitch_mm": geom.pitch,
            "centers": geom.centers.tolist(),
            "edges": geom.bucket_edges.tolist(),
            "bucket_top_y": geom.bucket_top_y,
        },
        "profiles": {
            "still": describe(photos["still"].probs, geom),
            "anim_last": describe(photos["anim_last"].probs, geom),
            "sim_phys2": describe(sims2.mean(axis=0), geom),
            "sim_phys3": describe(sims3.mean(axis=0), geom),
        },
        "photo_meta": {
            name: {"px_per_mm": p.px_per_mm, "n_buckets": p.n_buckets,
                   "heights_mm": p.heights_mm.tolist()}
            for name, p in photos.items()
        },
        "n_seeds": {"phys2": len(sims2), "phys3": len(sims3)},
        "distances_mm": dists,
        "noise_floor": noise_floor(settled).to_dicts(),
        "ranking": ranking(sens).to_dicts(),
        "levels": sens.select([
            "param", "level", "n", "variance_delta", "variance_z",
            "skewness_z", "fit_r2_z", "w1_mm_z",
        ]).to_dicts(),
        "unsettled": unsettled.select(
            [p for p in BASELINE if p in unsettled.columns] + ["seed", "steps"]
        ).to_dicts(),
        # the 2x2 was run at the extremes of both ranges, not at the mid levels
        "factorial": factorial(settled, "tilt", (0.0, 30.0), "paneFric", (0.05, 0.6)).to_dicts(),
        "lattice": {
            "ideal_variance": ideal_var,
            "step_mm": step,
            "observed": {
                k: describe(v, geom)["variance"]
                for k, v in [("still", photos["still"].probs),
                             ("anim_last", photos["anim_last"].probs),
                             ("sim", sims3.mean(axis=0))]
            },
        },
    }

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2))
    print(f"wrote {OUT}")
    print(f"  {len(sims2)} phys-2 baseline seeds, {len(sims3)} phys-3")
    print(f"  variances: " + ", ".join(
        f"{k} {v['variance']:.1f}" for k, v in data["profiles"].items()))
    print(f"  distances: " + ", ".join(f"{k} {v:.2f}" for k, v in dists.items()))
    print(f"  ideal lattice variance {ideal_var:.1f}; observed "
          f"{min(data['lattice']['observed'].values())/ideal_var:.1f}-"
          f"{max(data['lattice']['observed'].values())/ideal_var:.1f}x")
    print(f"  {len(unsettled)} never-settled run(s)")


if __name__ == "__main__":
    main()
