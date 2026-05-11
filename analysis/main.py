import numpy as np
import polars as pl

from load_data import load_all

N_BINS = 16

PARAM_COLS = [
    "model",
    "balls",
    "ballRest",
    "ballFric",
    "paneRest",
    "paneFric",
    "boardRest",
    "boardFric",
    "steps",
]


def moments_for_group(g: pl.DataFrame, n_bins: int = N_BINS) -> dict:
    """Bucket x, take mean(y)-min(y) per bucket as the density, return its first 3 moments.

    Returns mean, variance, and skewness (1st raw, 2nd central, 3rd standardized).
    """
    x = g["x"].to_numpy()
    y = g["y"].to_numpy()
    y = y - y.min()
    edges = np.linspace(x.min(), x.max(), n_bins + 1)
    centers = 0.5 * (edges[:-1] + edges[1:])
    # right=False so left edges are inclusive; subtract 1 to land in [0, n_bins-1].
    idx = np.clip(np.digitize(x, edges) - 1, 0, n_bins - 1)
    sums = np.bincount(idx, weights=y, minlength=n_bins)
    counts = np.bincount(idx, minlength=n_bins)
    density = np.where(counts > 0, sums / counts, 0.0)

    total = density.sum()
    p = density / total
    mean = float((p * centers).sum())
    variance = float((p * (centers - mean) ** 2).sum())
    m3 = float((p * (centers - mean) ** 3).sum())
    skewness = m3 / variance**1.5 if variance > 0 else float("nan")

    # Goodness-of-fit to the normal with matching mean/variance: R² of the
    # observed bin masses against the gaussian's bin masses. 1 = perfectly
    # normal-shaped, 0 = no better than a flat line, <0 = worse than flat.
    if variance > 0:
        bin_width = edges[1] - edges[0]
        gauss_pdf = np.exp(-((centers - mean) ** 2) / (2 * variance)) / np.sqrt(
            2 * np.pi * variance
        )
        gauss_p = gauss_pdf * bin_width
        ss_res = float(((p - gauss_p) ** 2).sum())
        ss_tot = float(((p - p.mean()) ** 2).sum())
        normality_r2 = 1 - ss_res / ss_tot if ss_tot > 0 else float("nan")
    else:
        normality_r2 = float("nan")

    return {
        "mean": mean,
        "variance": variance,
        "skewness": skewness,
        "normality_r2": normality_r2,
    }


def compute_moments(df: pl.DataFrame, n_bins: int = N_BINS) -> pl.DataFrame:
    rows = []
    for (source_file,), g in df.group_by("source_file"):
        params = {c: g[c][0] for c in PARAM_COLS if c in g.columns}
        rows.append(
            {"source_file": source_file, **params, **moments_for_group(g, n_bins)}
        )
    return pl.DataFrame(rows).sort("source_file")


def main():
    dat = load_all()
    moments = compute_moments(dat)
    with pl.Config(tbl_cols=-1, tbl_width_chars=200):
        print(moments)


if __name__ == "__main__":
    main()
