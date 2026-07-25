"""Bucket geometry read straight out of the board STL.

The analysis used to bin ball positions with `np.linspace(x.min(), x.max(), 17)`,
which makes the bin edges a function of the data: a run with one stray ball gets
different bins than a run without, so moments aren't comparable across the very
parameter settings a sweep varies. The buckets are physical objects with fixed
positions, so read them off the mesh instead.

Run `uv run python geometry.py` to print what it found for each board.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np

MODELS_DIR = Path(__file__).parent.parent / "cad" / "models" / "from-stl"

# `model` token in exported filenames -> stl, matching the from-stl.js glob keys
MODEL_FILES = {
    "boarddef": "board_def.stl",
    "clearboard": "clear_board.stl",
    "recreateoriginalboard": "recreate_original_board.stl",
}

# a face is treated as part of a divider fin if its normal is this close to +/-x
X_FACING = 0.99
# two x-facing planes closer than this are candidates for the two sides of a fin
MAX_FIN_THICKNESS = 2.0
# x positions within this distance are the same plane
CLUSTER_TOL = 0.3


@dataclass(frozen=True)
class BoardGeometry:
    """Bucket layout in simulation coordinates."""

    model: str
    bucket_edges: np.ndarray  # (n_buckets + 1,) x positions of the fin centers
    bucket_top_y: float  # top of the divider fins -- a ball below this is caught
    bucket_floor_y: float  # bottom of the fins
    fin_thickness: float
    pitch: float

    @property
    def n_buckets(self) -> int:
        return len(self.bucket_edges) - 1

    @property
    def centers(self) -> np.ndarray:
        return 0.5 * (self.bucket_edges[:-1] + self.bucket_edges[1:])

    @property
    def widths(self) -> np.ndarray:
        return np.diff(self.bucket_edges)


def _load_triangles(path: Path) -> tuple[np.ndarray, np.ndarray]:
    """Return (triangles, normals) in simulation coordinates.

    from-stl.js applies geometry.rotateX(+pi/2) on load, which maps STL
    (x, y, z) to sim (x, -z, y). Everything here is in the sim frame so it can
    be compared against exported ball positions directly.
    """
    raw = path.read_bytes()

    if raw[:5] == b"solid" and b"facet normal" in raw[:2048]:
        tris, norms = [], []
        tri: list[list[float]] = []
        for line in raw.decode("ascii", "replace").splitlines():
            parts = line.split()
            if not parts:
                continue
            if parts[0] == "vertex":
                tri.append([float(v) for v in parts[1:4]])
                if len(tri) == 3:
                    tris.append(tri)
                    tri = []
            elif parts[0] == "facet":
                norms.append([float(v) for v in parts[2:5]])
        triangles = np.array(tris, dtype=np.float64)
        normals = np.array(norms, dtype=np.float64)
    else:
        count = struct.unpack("<I", raw[80:84])[0]
        dt = np.dtype([("n", "<3f4"), ("v", "<3,3f4"), ("a", "<u2")])
        data = np.frombuffer(raw[84 : 84 + 50 * count], dtype=dt)
        triangles = data["v"].astype(np.float64)
        normals = data["n"].astype(np.float64)

    def to_sim(a: np.ndarray) -> np.ndarray:
        return np.stack([a[..., 0], -a[..., 2], a[..., 1]], axis=-1)

    return to_sim(triangles), to_sim(normals)


def _cluster(values: np.ndarray, tol: float = CLUSTER_TOL) -> np.ndarray:
    """Collapse near-identical positions into their means."""
    values = np.sort(values)
    breaks = np.flatnonzero(np.diff(values) > tol) + 1
    return np.array([g.mean() for g in np.split(values, breaks)])


def _fin_centers(planes: np.ndarray) -> tuple[np.ndarray, float, float]:
    """Find the divider fins among a set of x-facing plane positions.

    A fin shows up as two planes a fin-thickness apart. The board's outer shell
    has thin structures too, so rather than accepting every thin pair, take the
    most common thickness (the fins are by far the most repeated feature) and
    keep only pairs matching it.
    """
    gaps = np.diff(planes)
    thin = gaps[gaps < MAX_FIN_THICKNESS]
    if len(thin) < 3:
        raise ValueError("no repeated thin structure found -- is this a board STL?")

    rounded, counts = np.unique(np.round(thin, 2), return_counts=True)
    thickness = float(rounded[counts.argmax()])

    is_fin = np.isclose(gaps, thickness, atol=0.05)
    centers = np.array(
        [(planes[i] + planes[i + 1]) / 2 for i in np.flatnonzero(is_fin)]
    )

    # keep the longest evenly-spaced run, so stray shell features can't sneak in
    spacings = np.diff(centers)
    pitch = float(np.median(spacings))
    keep, run = [], [0]
    for i, s in enumerate(spacings):
        if np.isclose(s, pitch, atol=0.05):
            run.append(i + 1)
        else:
            keep, run = max(keep, run, key=len), [i + 1]
    keep = max(keep, run, key=len)
    return centers[keep], thickness, pitch


@lru_cache(maxsize=None)
def load_geometry(model: str = "boarddef") -> BoardGeometry:
    if model not in MODEL_FILES:
        raise KeyError(f"unknown model {model!r}; have {sorted(MODEL_FILES)}")

    triangles, normals = _load_triangles(MODELS_DIR / MODEL_FILES[model])
    centroids = triangles.mean(axis=1)
    x_facing = np.abs(normals[:, 0]) > X_FACING

    # Cluster only within a slab at the bottom of the board. Over the whole
    # board there are enough x-facing triangles that clustering invents a
    # regular lattice out of unrelated shell features; down here the bucket
    # dividers are the only repeated structure. Any slab inside the array works.
    y_lo, y_hi = triangles[..., 1].min(), triangles[..., 1].max()
    slab = x_facing & (centroids[:, 1] < y_lo + 0.2 * (y_hi - y_lo))

    planes = _cluster(centroids[slab][:, 0])
    fin_centers, thickness, pitch = _fin_centers(planes)

    # The fins are tall flat plates. Other small x-facing features share their x
    # positions, so pick out the plates by their vertical extent rather than
    # taking everything at that x -- otherwise the array looks ~7mm taller.
    on_fin = x_facing & (
        np.abs(centroids[:, 0][:, None] - fin_centers[None, :]).min(axis=1) <= thickness
    )
    fin_tris = triangles[on_fin]
    extent = fin_tris[:, :, 1].max(axis=1) - fin_tris[:, :, 1].min(axis=1)
    fin_y = fin_tris[extent > 0.25 * extent.max()][:, :, 1]

    # the outermost fin center isn't the outer edge of the array -- the two edge
    # buckets (narrower than the rest) are closed by the next x-facing plane
    # beyond it on each side
    outer_left = float(planes[planes < fin_centers[0] - thickness].max())
    outer_right = float(planes[planes > fin_centers[-1] + thickness].min())
    edges = np.concatenate([[outer_left], fin_centers, [outer_right]])

    return BoardGeometry(
        model=model,
        bucket_edges=edges,
        bucket_top_y=float(fin_y.max()),
        bucket_floor_y=float(fin_y.min()),
        fin_thickness=thickness,
        pitch=pitch,
    )


if __name__ == "__main__":
    for name in MODEL_FILES:
        try:
            g = load_geometry(name)
        except Exception as exc:  # a board without buckets is a legitimate answer
            print(f"{name}: {type(exc).__name__}: {exc}\n")
            continue
        print(f"{name}:")
        print(f"  {g.n_buckets} buckets, pitch {g.pitch:.3f}, fin {g.fin_thickness:.3f}")
        print(f"  caught below y = {g.bucket_top_y:.2f}, floor at {g.bucket_floor_y:.2f}")
        print(f"  edges: {np.round(g.bucket_edges, 2)}")
        print(f"  widths: {np.round(g.widths, 2)}\n")
