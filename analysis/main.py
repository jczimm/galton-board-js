# %%
import numpy as np
import polars as pl

from geometry import BoardGeometry, load_geometry
from load_data import load_all

PARAM_COLS = [
    "model",
    "seed",
    "settled",
    "balls",
    "ballRest",
    "ballFric",
    "paneRest",
    "paneFric",
    "boardRest",
    "boardFric",
    "steps",
]


def bucket_counts(x: np.ndarray, y: np.ndarray, geom: BoardGeometry) -> dict:
    """Assign balls to physical buckets.

    Balls that never reached the buckets (stuck on a peg, still in the funnel)
    and balls that ended up outside the array entirely are counted separately
    rather than quietly folded into the end bins -- if either number is large,
    the run isn't measuring what it claims to.
    """
    edges = geom.bucket_edges
    caught = y < geom.bucket_top_y
    inside = caught & (x >= edges[0]) & (x < edges[-1])

    idx = np.digitize(x[inside], edges) - 1
    counts = np.bincount(idx, minlength=geom.n_buckets)

    return {
        "counts": counts,
        "n_caught": int(inside.sum()),
        "n_stuck": int((~caught).sum()),
        "n_outside": int((caught & ~inside).sum()),
    }


def gaussian_bucket_probs(
    geom: BoardGeometry, mean: float, variance: float
) -> np.ndarray:
    """Probability mass a gaussian puts in each bucket.

    Integrated across each bucket via the error function rather than sampling
    the density at the centre, because the two edge buckets are narrower than
    the rest -- density * width would misweight them.
    """
    from math import erf, sqrt

    sigma = sqrt(variance)
    cdf = np.array([0.5 * (1 + erf((e - mean) / (sigma * sqrt(2)))) for e in geom.bucket_edges])
    probs = np.diff(cdf)
    total = probs.sum()  # renormalise: the board is finite, the gaussian isn't
    return probs / total if total > 0 else probs


def divergences(counts: np.ndarray, target: np.ndarray, geom: BoardGeometry) -> dict:
    """Compare an observed bucket histogram against a target distribution.

    Kept general on purpose: the target is any per-bucket probability vector, so
    the same code covers "is it normal?" and "does it match the PDF I asked
    for?" -- which is what the peg-optimisation loop will need.
    """
    n = counts.sum()
    if n == 0:
        return {"chi2_per_dof": float("nan"), "w1_mm": float("nan"), "fit_r2": float("nan")}

    observed_p = counts / n
    expected = n * target

    # chi-square over buckets the target can actually populate
    live = expected > 0
    chi2 = float(((counts[live] - expected[live]) ** 2 / expected[live]).sum())
    dof = max(int(live.sum()) - 1, 1)

    # earth-mover distance along the board, in mm -- unlike chi-square this
    # cares *where* the mass is wrong, not just that it is
    centers = geom.centers
    cdf_diff = np.abs(np.cumsum(observed_p) - np.cumsum(target))[:-1]
    w1 = float((cdf_diff * np.diff(centers)).sum())

    # R^2 of observed vs target bucket masses; 1 = exact, 0 = no better than flat
    ss_res = float(((observed_p - target) ** 2).sum())
    ss_tot = float(((observed_p - observed_p.mean()) ** 2).sum())
    fit_r2 = 1 - ss_res / ss_tot if ss_tot > 0 else float("nan")

    return {"chi2_per_dof": chi2 / dof, "w1_mm": w1, "fit_r2": fit_r2}


def summarize(
    x: np.ndarray,
    y: np.ndarray,
    geom: BoardGeometry,
    target: np.ndarray | None = None,
) -> dict:
    """Bucket a run and describe it.

    `target` is a per-bucket probability vector. Left as None it defaults to the
    gaussian matched to this run's own mean and variance, which reproduces the
    old normality check as one special case of the general comparison.
    """
    binned = bucket_counts(x, y, geom)
    counts, n = binned["counts"], binned["n_caught"]

    if n == 0:
        return {**binned, "mean": float("nan"), "variance": float("nan"),
                "skewness": float("nan"), "chi2_per_dof": float("nan"),
                "w1_mm": float("nan"), "fit_r2": float("nan")}

    # moments of the bucket histogram -- the same quantity a photo of the real
    # board can give, and now on fixed edges so it's comparable across runs
    centers, p = geom.centers, counts / n
    mean = float((p * centers).sum())
    variance = float((p * (centers - mean) ** 2).sum())
    m3 = float((p * (centers - mean) ** 3).sum())
    skewness = m3 / variance**1.5 if variance > 0 else float("nan")

    if target is None:
        target = gaussian_bucket_probs(geom, mean, variance)

    return {
        **binned,
        "mean": mean,
        "variance": variance,
        "skewness": skewness,
        **divergences(counts, target, geom),
    }


def compute_summary(df: pl.DataFrame, target: np.ndarray | None = None) -> pl.DataFrame:
    rows = []
    for (source_file,), g in df.group_by("source_file"):
        params = {c: g[c][0] for c in PARAM_COLS if c in g.columns}
        geom = load_geometry(params.get("model") or "boarddef")
        stats = summarize(g["x"].to_numpy(), g["y"].to_numpy(), geom, target)
        stats.pop("counts")
        rows.append({"source_file": source_file, **params, **stats})
    return pl.DataFrame(rows).sort("source_file")


# %%
dat = load_all()
# NOTE: no y filter here any more -- summarize() splits balls into caught /
# stuck / outside using the fin geometry instead of a hand-picked cutoff.
summary = compute_summary(dat)

# %%
summary

# %%
