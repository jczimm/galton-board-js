"""Read a bucket distribution off a photograph of the real board.

The sim can be compared to a gaussian all day; what it hasn't been compared to
is the actual printed board. `analysis/reference/` has two independent
realisations -- a still and the last frame of the animation -- and between them
they give both a target shape and an estimate of how much of that shape is
sampling noise.

Balls are separated from plastic by local texture, not brightness: the balls are
specular, so their pixels run from near-black in the gaps to near-white on the
highlights, and no brightness threshold splits them. A ball region is
high-frequency, the plastic is smooth.

Bucket dividers are detected individually rather than assumed evenly spaced, so
mild perspective is absorbed rather than modelled.

    uv run python photo.py
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

REFERENCE_DIR = Path(__file__).parent / "reference"

# The two photographs, with the crop that contains the bucket array. These are
# specific images, not a general pipeline -- the crop just has to contain the
# buckets and exclude the dark surroundings.
SOURCES = {
    "still": {
        "webp": "board_def_still.webp",
        "region": (820, 1130, 150, 830),
        "sd": 25,  # sharp enough for the texture mask
    },
    # last frame of the 30-frame animation: the same board, a separate run.
    # Lower texture threshold because it is far softer than the still.
    # Rows are the bucket array only: the peg field above and the rim below are
    # textured too, and including them made every column read as full height.
    "anim_last": {
        "webp": "board_def.webp",
        "frame": 30,
        "region": (358, 459, 70, 245),
        "sd": None,  # too soft for texture; threshold on darkness instead
    },
}


@dataclass
class PhotoProfile:
    name: str
    counts: np.ndarray  # ball-pixel area per bucket
    heights_mm: np.ndarray  # fill height per bucket
    px_per_mm: float
    n_buckets: int

    @property
    def probs(self) -> np.ndarray:
        return self.counts / self.counts.sum()


def _box_mean(a: np.ndarray, k: int) -> np.ndarray:
    p = np.pad(a, k // 2, mode="edge")
    c = np.pad(p.cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    h, w = a.shape
    return (c[k : k + h, k : k + w] - c[0:h, k : k + w] - c[k : k + h, 0:w] + c[0:h, 0:w]) / (k * k)


def ball_mask(gray: np.ndarray, sd_threshold: float, k: int = 7) -> np.ndarray:
    """Ball pixels = locally high-variance pixels.

    Works on the sharp still, where each ball is a distinct sphere. Fails on the
    animation frame: at that resolution the fin edges are the highest-contrast
    thing in the picture, so every column reads as full. Use `dark_mask` there.
    """
    mu = _box_mean(gray, k)
    sd = np.sqrt(np.maximum(_box_mean(gray**2, k) - mu**2, 0))
    return sd > sd_threshold


def otsu(gray: np.ndarray) -> float:
    """Threshold splitting dark (steel) from bright (white plastic)."""
    hist, edges = np.histogram(gray, bins=64, range=(0, 256))
    centers = 0.5 * (edges[:-1] + edges[1:])
    w0 = np.cumsum(hist)
    w1 = hist.sum() - w0
    m0 = np.cumsum(hist * centers) / np.maximum(w0, 1)
    m1 = (np.sum(hist * centers) - np.cumsum(hist * centers)) / np.maximum(w1, 1)
    between = w0 * w1 * (m0 - m1) ** 2
    return float(centers[int(np.argmax(between))])


def dark_mask(gray: np.ndarray) -> np.ndarray:
    """Ball pixels = pixels darker than the plastic, split adaptively."""
    return gray < otsu(gray)


def find_dividers(profile: np.ndarray, n_fins: int = 15) -> tuple[np.ndarray, float]:
    """Divider positions and bucket pitch, by fitting a rigid comb.

    Detecting each divider as a local minimum works on the high-resolution
    still, but not on the animation frame, where a 1.05mm fin is about two
    pixels wide. Fitting the whole array at once -- position and pitch, with the
    fin count known from the CAD -- uses every divider to constrain both
    parameters, and it is not derailed by the board rim or the stand.

    `profile` is ball pixels per column, and the teeth are scored to land in the
    gaps *between* ball columns. Fitting to column brightness instead (teeth on
    the bright fins) looks equivalent but is not: the board's rim is bright too,
    so on the still it locked one bucket to the right, dropping a real bucket
    and reading the rim as the sixteenth. Both fits were checked by drawing them
    over the photo.
    """
    width = len(profile)
    nominal = width / (n_fins + 2)  # roughly: fins plus the two edge buckets
    best = None
    for pitch in np.arange(nominal * 0.6, nominal * 1.5, max(nominal * 0.002, 0.02)):
        span = (n_fins - 1) * pitch
        if span >= width - 1:
            continue
        for x0 in np.arange(0, width - span - 1, 0.2):
            at = np.round(x0 + pitch * np.arange(n_fins)).astype(int)
            between = np.round(x0 + pitch * (np.arange(n_fins - 1) + 0.5)).astype(int)
            score = profile[between].mean() - profile[at].mean()
            if best is None or score > best[0]:
                best = (score, x0, pitch)

    if best is None:
        raise ValueError("could not fit a divider comb -- is the crop right?")
    _, x0, pitch = best
    return np.round(x0 + pitch * np.arange(n_fins)).astype(int), float(pitch)


def _as_png(webp: str, frame: int | None = None) -> str:
    """WebP -> PNG via the system tools, since Pillow can't read animated WebP.

    `board_def.webp` is an animated WebP despite its history as a .gif, so its
    frames come out through webpmux rather than ffmpeg.
    """
    import subprocess
    import tempfile

    src = REFERENCE_DIR / webp
    tmp = Path(tempfile.gettempdir())
    out = tmp / f"{Path(webp).stem}{'' if frame is None else f'_f{frame}'}.png"

    if frame is not None:
        stage = tmp / f"{Path(webp).stem}_f{frame}.webp"
        subprocess.run(["webpmux", "-get", "frame", str(frame), str(src), "-o", str(stage)],
                       check=True, capture_output=True)
        src = stage
    subprocess.run(["sips", "-s", "format", "png", str(src), "--out", str(out)],
                   check=True, capture_output=True)
    return str(out)


def extract(name: str, webp: str, region: tuple, sd: float, frame: int | None = None,
            pitch_mm: float = 4.8, edge_bucket_mm: float = 2.96) -> PhotoProfile:
    from PIL import Image

    gray = np.asarray(Image.open(_as_png(webp, frame)).convert("L"), dtype=float)
    r0, r1, c0, c1 = region
    crop = gray[r0:r1, c0:c1]

    mask = dark_mask(crop) if sd is None else ball_mask(crop, sd)
    dividers, pitch_px = find_dividers(mask.sum(axis=0).astype(float))
    px_per_mm = pitch_px / pitch_mm

    # the two outer buckets are narrower than the rest and have no fin beyond
    # them, so close the array with the known geometry rather than a detection
    edge_px = edge_bucket_mm * px_per_mm
    edges = np.concatenate([[dividers[0] - edge_px], dividers, [dividers[-1] + edge_px]])
    edges = np.clip(np.round(edges).astype(int), 0, crop.shape[1] - 1)

    counts, heights = [], []
    for lo, hi in zip(edges[:-1], edges[1:]):
        sub = mask[:, lo:hi]
        counts.append(sub.sum())
        rows = np.flatnonzero(sub.any(axis=1))
        heights.append((rows[-1] - rows[0] + 1) / px_per_mm if len(rows) else 0.0)

    return PhotoProfile(
        name=name,
        counts=np.array(counts, dtype=float),
        heights_mm=np.array(heights),
        px_per_mm=px_per_mm,
        n_buckets=len(counts),
    )


def load_profiles() -> dict[str, PhotoProfile]:
    return {name: extract(name, **cfg) for name, cfg in SOURCES.items()}


def moments(probs: np.ndarray, centers: np.ndarray) -> dict:
    mean = float((probs * centers).sum())
    var = float((probs * (centers - mean) ** 2).sum())
    m3 = float((probs * (centers - mean) ** 3).sum())
    return {
        "mean": mean,
        "variance": var,
        "skewness": m3 / var**1.5 if var > 0 else float("nan"),
    }


def earth_mover(a: np.ndarray, b: np.ndarray, centers: np.ndarray) -> float:
    """Distance between two bucket distributions, in mm."""
    return float((np.abs(np.cumsum(a) - np.cumsum(b))[:-1] * np.diff(centers)).sum())


def sim_baseline_profiles(geom) -> np.ndarray:
    """Per-seed bucket distributions for the sim at default parameters."""
    import polars as pl

    from load_data import load_all
    from main import bucket_counts
    from sensitivity import BALLS, BASELINE

    df = load_all().filter(pl.col("balls") == BALLS, pl.col("settled") == 1)
    for key, value in BASELINE.items():
        if key in df.columns:
            df = df.filter(pl.col(key) == value)

    out = []
    for _, group in df.group_by("source_file"):
        counts = bucket_counts(group["x"].to_numpy(), group["y"].to_numpy(), geom)["counts"]
        out.append(counts / counts.sum())
    return np.array(out)


if __name__ == "__main__":
    from geometry import load_geometry
    from main import divergences, gaussian_bucket_probs

    geom = load_geometry("boarddef")
    profiles = load_profiles()

    for name, p in profiles.items():
        print(f"\n=== {name} ===")
        print(f"  {p.n_buckets} buckets, {p.px_per_mm:.2f} px/mm")
        print(f"  fill heights (mm): {np.round(p.heights_mm, 1)}")
        for prob, h in zip(p.probs, p.heights_mm):
            print(f"    {'#' * int(round(prob * 200)):<40} {h:5.1f}mm")

    sims = sim_baseline_profiles(geom)
    sim_p = sims.mean(axis=0)

    print("\n=== photographs vs simulation ===")
    rows = list(profiles.items()) + [("sim", type("P", (), {"probs": sim_p})())]
    for name, p in rows:
        m = moments(p.probs, geom.centers)
        target = gaussian_bucket_probs(geom, m["mean"], m["variance"])
        d = divergences(np.round(p.probs * 10000).astype(int), target, geom)
        print(f"  {name:10s} variance {m['variance']:6.1f}  skew {m['skewness']:+.3f}"
              f"  normality r2 {d['fit_r2']:.3f}")

    still, anim = profiles["still"].probs, profiles["anim_last"].probs
    between_seeds = np.mean([earth_mover(a, b, geom.centers)
                             for i, a in enumerate(sims) for b in sims[i + 1:]])
    print("\n  distances (mm):")
    print(f"    still  <-> anim  {earth_mover(still, anim, geom.centers):.2f}   two runs of the real board")
    print(f"    still  <-> sim   {earth_mover(still, sim_p, geom.centers):.2f}")
    print(f"    anim   <-> sim   {earth_mover(anim, sim_p, geom.centers):.2f}")
    print(f"    sim seed to seed {between_seeds:.2f}")

    # an ideal 10-row lattice would be far tighter than any of these
    step = geom.pitch / 2
    ideal = 10 * 0.25 * (2 * step) ** 2
    observed = [moments(p.probs, geom.centers)["variance"] for _, p in rows]
    print(f"\n  an ideal 10-row lattice would give variance {ideal:.1f} mm^2 "
          f"(sigma {np.sqrt(ideal):.1f}mm)")
    print(f"  observed is {min(observed)/ideal:.1f}-{max(observed)/ideal:.1f}x that in "
          f"variance ({np.sqrt(min(observed)/ideal):.1f}-{np.sqrt(max(observed)/ideal):.1f}x in sigma),")
    print(f"  so a ball is not making a single +/-{step:.1f}mm decision per row")
