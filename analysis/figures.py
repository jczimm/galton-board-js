"""Render the figures behind the photo analysis, so the extraction can be checked by eye.

Every claim photo.py makes about the real board rests on two decisions: which
pixels are ball, and where the dividers are. Both were wrong at first in ways
the numbers alone didn't reveal -- so each one gets drawn back over the
photograph here.

    uv run python figures.py

Writes PNGs into analysis/figures/ and the numbers behind them into
figures/data.json, which the report reads.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from photo import SOURCES, _as_png, ball_mask, dark_mask, find_dividers, otsu

FIG_DIR = Path(__file__).parent / "figures"

BALL_TINT = (255, 96, 64)
COMB_GOOD = (64, 220, 120)
COMB_BAD = (255, 72, 72)


def load_crop(cfg: dict) -> np.ndarray:
    gray = np.asarray(
        Image.open(_as_png(cfg["webp"], cfg.get("frame"))).convert("L"), dtype=float
    )
    r0, r1, c0, c1 = cfg["region"]
    return gray[r0:r1, c0:c1]


def tinted(crop: np.ndarray, mask: np.ndarray, tint=BALL_TINT, alpha=0.55) -> Image.Image:
    """The crop in grey with masked pixels pushed toward `tint`."""
    rgb = np.repeat(crop[:, :, None], 3, axis=2)
    overlay = np.array(tint, dtype=float)[None, None, :]
    out = np.where(mask[:, :, None], (1 - alpha) * rgb + alpha * overlay, rgb)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def upscale(img: Image.Image, factor: int) -> Image.Image:
    if factor == 1:
        return img
    return img.resize((img.width * factor, img.height * factor), Image.NEAREST)


def draw_comb(img: Image.Image, dividers, colour, scale=1, width=2, dash=False):
    d = ImageDraw.Draw(img)
    for x in dividers:
        x = int(round(x * scale))
        if dash:
            for y in range(0, img.height, 12):
                d.line([(x, y), (x, min(y + 6, img.height))], fill=colour, width=width)
        else:
            d.line([(x, 0), (x, img.height)], fill=colour, width=width)


def label_buckets(img: Image.Image, edges, scale=1, colour=(255, 255, 255)):
    d = ImageDraw.Draw(img)
    for i, (lo, hi) in enumerate(zip(edges[:-1], edges[1:])):
        cx = (lo + hi) / 2 * scale
        d.text((cx - 6, img.height - 14), str(i + 1), fill=colour)


def bucket_edges_from(dividers, pitch_px, edge_bucket_mm=2.96, pitch_mm=4.8, width=None):
    edge_px = edge_bucket_mm * (pitch_px / pitch_mm)
    edges = np.concatenate([[dividers[0] - edge_px], dividers, [dividers[-1] + edge_px]])
    return np.clip(np.round(edges).astype(int), 0, (width - 1) if width else None)


# --- figure 1: how the still was read ------------------------------------

def fig_still_overlay(out: Path) -> dict:
    cfg = SOURCES["still"]
    crop = load_crop(cfg)
    mask = ball_mask(crop, cfg["sd"])
    profile = mask.sum(axis=0).astype(float)
    dividers, pitch_px = find_dividers(profile)
    edges = bucket_edges_from(dividers, pitch_px, width=crop.shape[1])

    img = tinted(crop, mask)
    draw_comb(img, dividers, COMB_GOOD)
    draw_comb(img, [edges[0], edges[-1]], COMB_GOOD, dash=True)
    label_buckets(img, edges)
    img.save(out)

    return {
        "px_per_mm": pitch_px / 4.8,
        "pitch_px": pitch_px,
        "size": list(crop.shape),
        "profile": profile.tolist(),
        "dividers": dividers.tolist(),
        "edges": edges.tolist(),
    }


# --- figure 2: texture vs brightness, on both images ---------------------

def fig_mask_comparison(out: Path) -> dict:
    """Why each image needs a different mask.

    The still is sharp, so balls separate from plastic by local texture. The
    animation frame is soft enough that the fin edges are the highest-contrast
    thing in it -- texture marks the fins, every column reads as full, and the
    fill heights come out meaningless. Brightness works there instead.
    """
    panels, meta = [], {}
    for name, scale, sd_try in [("still", 1, 25), ("anim_last", 3, 8)]:
        cfg = SOURCES[name]
        crop = load_crop(cfg)
        tex = ball_mask(crop, sd_try)
        dark = dark_mask(crop)
        meta[name] = {
            "texture_fill": float(tex.mean()),
            "dark_fill": float(dark.mean()),
            "otsu": otsu(crop),
            "px_per_mm_note": name,
            # per-column fill fraction: if a mask is working, columns vary a lot
            # (buckets differ in height); if it is latching onto fins, they don't
            "texture_col_cv": float(np.std(tex.mean(axis=0)) / max(np.mean(tex.mean(axis=0)), 1e-9)),
            "dark_col_cv": float(np.std(dark.mean(axis=0)) / max(np.mean(dark.mean(axis=0)), 1e-9)),
        }
        panels.append([upscale(tinted(crop, m), scale) for m in (tex, dark)])

    pad, label_h = 12, 18
    width = max(sum(p.width for p in row) + pad for row in panels) + pad
    height = sum(max(p.height for p in row) + label_h + pad for row in panels) + pad
    sheet = Image.new("RGB", (width, height), (18, 18, 20))
    d = ImageDraw.Draw(sheet)

    y = pad
    for (name, _, _), row in zip([("still", 1, 25), ("anim_last", 3, 8)], panels):
        x = pad
        for label, panel in zip(["texture mask", "brightness mask"], row):
            d.text((x, y), f"{name} - {label}", fill=(230, 230, 230))
            sheet.paste(panel, (x, y + label_h))
            x += panel.width + pad
        y += max(p.height for p in row) + label_h + pad
    sheet.save(out)
    return meta


# --- figure 3: the comb fit that silently dropped a bucket ---------------

def fig_comb_fit(out: Path) -> dict:
    """Fitting the divider comb to bright fins vs. to gaps between ball columns.

    These look interchangeable and are not. The board's rim is bright too, so
    the fin fit slid one bucket right: it read the rim as the sixteenth divider
    and dropped a real bucket off the other end.
    """
    cfg = SOURCES["still"]
    crop = load_crop(cfg)
    mask = ball_mask(crop, cfg["sd"])

    good, good_pitch = find_dividers(mask.sum(axis=0).astype(float))
    # teeth on bright columns: negate so the scorer's minima land on the fins
    bad, bad_pitch = find_dividers(-crop.mean(axis=0))

    img = tinted(crop, mask, alpha=0.35)
    draw_comb(img, bad, COMB_BAD, width=3, dash=True)
    draw_comb(img, good, COMB_GOOD, width=2)
    img.save(out)

    return {
        "gap_fit": good.tolist(),
        "gap_pitch_px": good_pitch,
        "fin_fit": bad.tolist(),
        "fin_pitch_px": bad_pitch,
        "offset_px": float(np.mean(np.array(bad) - np.array(good))),
        "offset_buckets": float(np.mean(np.array(bad) - np.array(good)) / good_pitch),
    }


def main():
    FIG_DIR.mkdir(exist_ok=True)
    data = {
        "still_overlay": fig_still_overlay(FIG_DIR / "still_overlay.png"),
        "mask_comparison": fig_mask_comparison(FIG_DIR / "mask_comparison.png"),
        "comb_fit": fig_comb_fit(FIG_DIR / "comb_fit.png"),
    }
    (FIG_DIR / "data.json").write_text(json.dumps(data, indent=2))

    print(f"wrote figures to {FIG_DIR}")
    s = data["still_overlay"]
    print(f"  still: {s['size'][1]}x{s['size'][0]} px, {s['px_per_mm']:.2f} px/mm")
    c = data["comb_fit"]
    print(f"  comb fit offset: {c['offset_px']:.1f} px = {c['offset_buckets']:.2f} buckets")
    for name, m in data["mask_comparison"].items():
        print(f"  {name}: texture covers {m['texture_fill']:.1%} (col cv {m['texture_col_cv']:.2f}), "
              f"brightness {m['dark_fill']:.1%} (col cv {m['dark_col_cv']:.2f})")


if __name__ == "__main__":
    main()
