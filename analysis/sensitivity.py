"""How much does each material coefficient actually move the output?

The point isn't to find the "true" coefficients -- it's to find out which ones
have to be pinned down before trusting a board designed for some target PDF, and
which can be left roughly right. Every effect is measured against the
seed-to-seed noise floor, because an effect smaller than that is not an effect.

    uv run python sensitivity.py
"""

from __future__ import annotations

import numpy as np
import polars as pl

from load_data import load_all
from main import compute_summary

# the configuration everything else is measured against (the sim's own defaults)
BASELINE = {
    "ballRest": 0.85,
    "ballFric": 0.1,
    "paneRest": 0.1,
    "paneFric": 0.05,
    "boardRest": 0.5,
    "boardFric": 0.1,
    "tilt": 0.0,
    "spawnSpread": 0.2,
}

METRICS = ["mean", "variance", "skewness", "fit_r2", "w1_mm"]

# Ball count is not a parameter under test -- it sets the sampling noise, so
# mixing counts would compare runs with different noise floors.
BALLS = 800


def _at_baseline(df: pl.DataFrame, exclude: str | None = None) -> pl.Expr:
    """Rows whose parameters are all at baseline, optionally ignoring one."""
    conds = [
        pl.col(k) == v for k, v in BASELINE.items() if k != exclude and k in df.columns
    ]
    out = conds[0]
    for c in conds[1:]:
        out = out & c
    return out


def noise_floor(summary: pl.DataFrame) -> pl.DataFrame:
    """Spread of each metric across seeds at fixed parameters."""
    base = summary.filter(_at_baseline(summary))
    if len(base) < 3:
        raise ValueError(f"need >=3 baseline seeds for a noise floor, found {len(base)}")
    return pl.DataFrame(
        [
            {
                "metric": m,
                "n_seeds": len(base),
                "mean": base[m].mean(),
                "sd": base[m].std(),
                "min": base[m].min(),
                "max": base[m].max(),
            }
            for m in METRICS
        ]
    )


def sensitivity(summary: pl.DataFrame) -> pl.DataFrame:
    """Effect of each parameter level, in units of the noise floor.

    `z` is a two-sample t-style statistic: the shift between this level and
    baseline, divided by the standard error of that shift under the assumption
    that run-to-run scatter is the same everywhere (which the noise floor
    measures). |z| < 2 means the level is indistinguishable from baseline.
    """
    base = summary.filter(_at_baseline(summary))
    n_base = len(base)
    rows = []

    for param in BASELINE:
        if param not in summary.columns:
            continue
        others_fixed = summary.filter(_at_baseline(summary, exclude=param))
        for level in sorted(others_fixed[param].unique().to_list()):
            if level == BASELINE[param]:
                continue
            group = others_fixed.filter(pl.col(param) == level)
            row = {"param": param, "level": level, "n": len(group)}
            for m in METRICS:
                sd = base[m].std()
                delta = group[m].mean() - base[m].mean()
                se = sd * np.sqrt(1 / len(group) + 1 / n_base) if sd and sd > 0 else np.nan
                row[f"{m}_delta"] = delta
                row[f"{m}_z"] = delta / se if se and se > 0 else np.nan
            rows.append(row)

    return pl.DataFrame(rows)


def ranking(sens: pl.DataFrame) -> pl.DataFrame:
    """Worst-case effect of each parameter across the levels tried."""
    z_cols = [f"{m}_z" for m in METRICS]
    return (
        sens.with_columns(
            pl.max_horizontal([pl.col(c).abs() for c in z_cols]).alias("max_abs_z")
        )
        .group_by("param")
        .agg(
            pl.col("max_abs_z").max().alias("worst_z"),
            pl.col("level").len().alias("levels"),
            pl.col("variance_delta").abs().max().alias("max_var_shift"),
            pl.col("w1_mm_delta").abs().max().alias("max_w1_shift"),
        )
        .sort("worst_z", descending=True)
    )


if __name__ == "__main__":
    pl.Config.set_tbl_rows(60)
    pl.Config.set_tbl_width_chars(220)

    summary = compute_summary(load_all()).filter(
        pl.col("tilt").is_not_null(),  # post-channel-fix runs only
        pl.col("balls") == BALLS,
    )

    # A run that hit maxSteps never came to rest, so its ball positions are a
    # snapshot mid-bounce rather than a final distribution. Those aren't
    # comparable with settled runs, but "this setting never settles" is itself a
    # result about the setting, so report them rather than dropping them quietly.
    unsettled = summary.filter(pl.col("settled") == 0)
    if len(unsettled):
        print(f"!!! {len(unsettled)} run(s) never settled -- excluded from the "
              f"comparison below, but note which levels they are:")
        print(unsettled.select(
            [p for p in BASELINE if p in unsettled.columns] + ["seed", "steps"]
        ))
        print()
        summary = summary.filter(pl.col("settled") == 1)

    print(f"=== noise floor ({BALLS} balls, baseline params, varying seed only) ===")
    print(noise_floor(summary))

    print("\n=== per-level effects, z = shift / noise ===")
    sens = sensitivity(summary)
    print(sens.select(["param", "level", "n", "variance_delta", "variance_z",
                       "skewness_z", "fit_r2_z", "w1_mm_z"]))

    print("\n=== which coefficients matter (worst |z| over levels tried) ===")
    print(ranking(sens))
    print("\n|z| < 2 is indistinguishable from seed noise at this ball count.")

    # a parameter that jams the board or stops it settling matters for reasons
    # the distribution metrics won't show
    print("\n=== run health by level ===")
    health = (
        summary.group_by([p for p in BASELINE if p in summary.columns])
        .agg(
            pl.col("n_stuck").mean().alias("stuck"),
            pl.col("n_outside").mean().alias("outside"),
            pl.col("steps").mean().alias("steps"),
            pl.col("settled").min().alias("all_settled"),
            pl.len().alias("runs"),
        )
        .sort("stuck", descending=True)
    )
    print(health.head(8))
