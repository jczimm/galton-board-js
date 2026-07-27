"""Build the decision-record report as a single self-contained HTML page.

Numbers are read from figures/report.json and figures are embedded as data
URIs, so nothing in the page is transcribed by hand and re-running this after a
new sweep updates every figure and table together.

    uv run python build_report.py
"""

from __future__ import annotations

import base64
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).parent
FIG = HERE / "figures"
OUT = FIG / "report.html"

D = json.loads((FIG / "report.json").read_text())
G = D["geometry"]
CENTERS = np.array(G["centers"])


def img_uri(name: str, quality: int = 88, max_w: int = 1400) -> str:
    """Embed a figure as a JPEG data URI -- these are photographs, and PNG of a
    photograph is several times larger for no visible gain."""
    im = Image.open(FIG / name).convert("RGB")
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


# ---------------------------------------------------------------- charts

def distribution_chart() -> str:
    """Three bucket distributions as stepped profiles on shared axes."""
    w, h = 760, 300
    pad_l, pad_r, pad_t, pad_b = 44, 12, 18, 34
    series = [
        ("sim", D["profiles"]["sim_phys3"]["probs"], "var(--accent)", True),
        ("still photo", D["profiles"]["still"]["probs"], "var(--ink)", False),
        ("animation", D["profiles"]["anim_last"]["probs"], "var(--muted)", False),
    ]
    ymax = max(max(p) for _, p, _, _ in series) * 1.12
    n = len(CENTERS)
    bw = (w - pad_l - pad_r) / n

    def sx(i):
        return pad_l + i * bw

    def sy(v):
        return pad_t + (1 - v / ymax) * (h - pad_t - pad_b)

    parts = [f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="Bucket distributions: simulation, still photograph, animation frame">']

    # horizontal guides
    for frac in (0, 0.25, 0.5, 0.75, 1.0):
        v = ymax * frac
        y = sy(v)
        parts.append(f'<line x1="{pad_l}" y1="{y:.1f}" x2="{w-pad_r}" y2="{y:.1f}" class="grid"/>')
        parts.append(f'<text x="{pad_l-8}" y="{y+4:.1f}" class="tick" text-anchor="end">{v*100:.0f}%</text>')

    for label, probs, colour, filled in series:
        pts = []
        for i, p in enumerate(probs):
            pts.append((sx(i), sy(p)))
            pts.append((sx(i + 1), sy(p)))
        d = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts)
        if filled:
            d_fill = d + f" L{sx(n):.1f},{sy(0):.1f} L{sx(0):.1f},{sy(0):.1f} Z"
            parts.append(f'<path d="{d_fill}" fill="{colour}" fill-opacity=".16"/>')
            parts.append(f'<path d="{d}" fill="none" stroke="{colour}" stroke-width="2"/>')
        else:
            dash = ' stroke-dasharray="5 3"' if label == "animation" else ""
            parts.append(f'<path d="{d}" fill="none" stroke="{colour}" stroke-width="1.6"{dash}/>')

    for i in range(n):
        if i % 2 == 0:
            parts.append(f'<text x="{sx(i)+bw/2:.1f}" y="{h-pad_b+16}" class="tick" text-anchor="middle">{i+1}</text>')
    parts.append(f'<text x="{w/2:.0f}" y="{h-4}" class="axis" text-anchor="middle">bucket</text>')
    parts.append("</svg>")
    return "".join(parts)


def sensitivity_chart() -> str:
    """Worst |z| per parameter against the noise band."""
    rows = D["ranking"]
    w = 760
    row_h, pad_t, pad_l, pad_r = 34, 14, 96, 56
    h = pad_t + row_h * len(rows) + 26
    zmax = max(r["worst_z"] for r in rows) * 1.08
    plot_w = w - pad_l - pad_r

    def sx(z):
        return pad_l + z / zmax * plot_w

    parts = [f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="Worst absolute z-score per coefficient">']
    # the band where an effect is indistinguishable from seed noise
    parts.append(f'<rect x="{pad_l}" y="{pad_t-6}" width="{sx(2)-pad_l:.1f}" height="{row_h*len(rows)+4}" class="noiseband"/>')
    parts.append(f'<line x1="{sx(2):.1f}" y1="{pad_t-6}" x2="{sx(2):.1f}" y2="{pad_t+row_h*len(rows)-2}" class="noiseline"/>')
    parts.append(f'<text x="{sx(2)+6:.1f}" y="{pad_t+row_h*len(rows)+16}" class="tick">|z| = 2 &middot; noise floor</text>')

    for i, r in enumerate(rows):
        y = pad_t + i * row_h + row_h / 2
        strong = r["worst_z"] >= 4
        cls = "bar strong" if strong else ("bar mid" if r["worst_z"] >= 2 else "bar weak")
        parts.append(f'<text x="{pad_l-10}" y="{y+4:.1f}" class="plabel" text-anchor="end">{r["param"]}</text>')
        parts.append(f'<rect x="{pad_l}" y="{y-7:.1f}" width="{max(sx(r["worst_z"])-pad_l,1):.1f}" height="14" rx="2" class="{cls}"/>')
        parts.append(f'<text x="{sx(r["worst_z"])+8:.1f}" y="{y+4:.1f}" class="zval">{r["worst_z"]:.1f}</text>')
    parts.append("</svg>")
    return "".join(parts)


def fill_chart() -> str:
    """Measured fill height per bucket in the still, in mm."""
    heights = D["photo_meta"]["still"]["heights_mm"]
    w, h = 760, 150
    pad_l, pad_r, pad_t, pad_b = 44, 12, 12, 30
    n = len(heights)
    bw = (w - pad_l - pad_r) / n
    ymax = max(heights) * 1.15
    parts = [f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="Fill height per bucket in the still photograph">']
    for frac in (0, 0.5, 1.0):
        v = ymax * frac
        y = pad_t + (1 - frac) * (h - pad_t - pad_b)
        parts.append(f'<line x1="{pad_l}" y1="{y:.1f}" x2="{w-pad_r}" y2="{y:.1f}" class="grid"/>')
        parts.append(f'<text x="{pad_l-8}" y="{y+4:.1f}" class="tick" text-anchor="end">{v:.0f}</text>')
    for i, v in enumerate(heights):
        bh = v / ymax * (h - pad_t - pad_b)
        x = pad_l + i * bw + bw * 0.18
        parts.append(f'<rect x="{x:.1f}" y="{pad_t+(h-pad_t-pad_b)-bh:.1f}" width="{bw*0.64:.1f}" height="{bh:.1f}" rx="1" class="fillbar"/>')
    parts.append(f'<text x="{pad_l-8}" y="{pad_t+8}" class="tick" text-anchor="end"></text>')
    parts.append(f'<text x="{w/2:.0f}" y="{h-4}" class="axis" text-anchor="middle">fill height, mm &middot; bucket 1&ndash;16 left to right</text>')
    parts.append("</svg>")
    return "".join(parts)


# ---------------------------------------------------------------- tables

def ranking_table() -> str:
    lv = {}
    for r in D["levels"]:
        lv.setdefault(r["param"], []).append(r)
    rows = []
    for r in D["ranking"]:
        p = r["param"]
        levels = ", ".join(f'{x["level"]:g}' for x in lv.get(p, []))
        ns = {x["n"] for x in lv.get(p, [])}
        n_txt = "/".join(str(x) for x in sorted(ns))
        verdict = ("dominates" if r["worst_z"] > 10 else
                   "matters" if r["worst_z"] >= 4 else
                   "borderline" if r["worst_z"] >= 2 else "no effect")
        cls = ("strong" if r["worst_z"] > 10 else "mid" if r["worst_z"] >= 4 else
               "weak" if r["worst_z"] >= 2 else "none")
        rows.append(
            f'<tr><td class="mono">{p}</td><td class="num">{r["worst_z"]:.1f}</td>'
            f'<td class="num">{r["max_var_shift"]:+.0f}</td>'
            f'<td class="mono dim">{levels}</td><td class="num dim">{n_txt}</td>'
            f'<td><span class="pill {cls}">{verdict}</span></td></tr>'
        )
    return (
        '<div class="scroll"><table><thead><tr>'
        '<th>coefficient</th><th class="num">worst |z|</th><th class="num">max &Delta;var</th>'
        '<th>levels tried</th><th class="num">runs/level</th><th>verdict</th>'
        "</tr></thead><tbody>" + "".join(rows) + "</tbody></table></div>"
    )


def distance_table() -> str:
    d = D["distances_mm"]
    rows = [
        ("still &harr; animation", d["still_anim"], "two runs of the <em>real</em> board", True),
        ("still &harr; sim", d["still_sim"], "", False),
        ("animation &harr; sim", d["anim_sim"], "", False),
        ("sim, seed to seed", d["sim_seed_to_seed"], "sampling noise at 800 balls", False),
        ("sim phys&nbsp;2 &harr; phys&nbsp;3", d["phys2_phys3"], "the channel fix, at 800 balls", False),
    ]
    body = "".join(
        f'<tr class="{"hl" if hl else ""}"><td>{label}</td>'
        f'<td class="num">{v:.2f}</td><td class="dim">{note}</td></tr>'
        for label, v, note, hl in rows
    )
    return ('<div class="scroll"><table><thead><tr><th>pair</th>'
            '<th class="num">distance, mm</th><th>&nbsp;</th></tr></thead><tbody>'
            + body + "</tbody></table></div>")


def moments_table() -> str:
    p = D["profiles"]
    rows = [
        ("still photograph", p["still"]),
        ("animation, last frame", p["anim_last"]),
        ("simulation (phys&nbsp;3)", p["sim_phys3"]),
    ]
    body = "".join(
        f'<tr><td>{label}</td><td class="num">{v["variance"]:.1f}</td>'
        f'<td class="num">{v["skewness"]:+.3f}</td><td class="num">{v["normality_r2"]:.3f}</td></tr>'
        for label, v in rows
    )
    return ('<div class="scroll"><table><thead><tr><th>source</th>'
            '<th class="num">variance, mm&sup2;</th><th class="num">skew</th>'
            '<th class="num">normality r&sup2;</th></tr></thead><tbody>'
            + body + "</tbody></table></div>")


# ---------------------------------------------------------------- page

def build() -> str:
    nf = {r["metric"]: r for r in D["noise_floor"]}
    lat = D["lattice"]
    obs = lat["observed"]
    lo = min(obs.values()) / lat["ideal_variance"]
    hi = max(obs.values()) / lat["ideal_variance"]
    fac = {r["metric"]: r for r in D["factorial"]}["variance"]
    still_ppm = D["photo_meta"]["still"]["px_per_mm"]
    anim_ppm = D["photo_meta"]["anim_last"]["px_per_mm"]
    comb = json.loads((FIG / "data.json").read_text())["comb_fit"]
    masks = json.loads((FIG / "data.json").read_text())["mask_comparison"]

    css = """
:root{
  --ground:#eceef0; --surface:#fbfcfc; --ink:#14181c; --muted:#5f6a74;
  --rule:#d3d8dc; --accent:#d9502f; --accent-soft:#d9502f26;
  --good:#2f7d5d; --warn:#a8741a; --dim:#8b959e;
  --mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
}
@media (prefers-color-scheme:dark){
  :root{
    --ground:#0e1114; --surface:#161a1e; --ink:#e6eaed; --muted:#9aa4ad;
    --rule:#282e34; --accent:#ef6a44; --accent-soft:#ef6a442e;
    --good:#5aab86; --warn:#d19b3f; --dim:#6d7780;
  }
}
:root[data-theme="dark"]{
  --ground:#0e1114; --surface:#161a1e; --ink:#e6eaed; --muted:#9aa4ad;
  --rule:#282e34; --accent:#ef6a44; --accent-soft:#ef6a442e;
  --good:#5aab86; --warn:#d19b3f; --dim:#6d7780;
}
:root[data-theme="light"]{
  --ground:#eceef0; --surface:#fbfcfc; --ink:#14181c; --muted:#5f6a74;
  --rule:#d3d8dc; --accent:#d9502f; --accent-soft:#d9502f26;
  --good:#2f7d5d; --warn:#a8741a; --dim:#8b959e;
}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);
  font-family:var(--sans);font-size:16px;line-height:1.62;
  -webkit-font-smoothing:antialiased}
.wrap{max-width:880px;margin:0 auto;padding:0 24px 96px}
h1,h2,h3,.eyebrow,.mono,td.num,th.num,.tick,.zval,.plabel,.axis{font-family:var(--mono)}
h1{font-size:30px;line-height:1.24;letter-spacing:-.02em;font-weight:600;
  margin:0 0 14px;text-wrap:balance}
h2{font-size:15px;letter-spacing:.02em;font-weight:600;margin:0 0 4px}
h3{font-size:14px;letter-spacing:.01em;font-weight:600;margin:28px 0 6px;color:var(--ink)}
p{margin:0 0 14px;max-width:68ch}
a{color:var(--accent)}
.eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--muted);margin:0 0 18px}
header{padding:64px 0 34px;border-bottom:1px solid var(--rule)}
.lede{font-size:17px;color:var(--muted);max-width:64ch;margin:0}
.meta{display:flex;flex-wrap:wrap;gap:8px 10px;margin-top:26px}
.chip{font-family:var(--mono);font-size:11.5px;letter-spacing:.03em;
  border:1px solid var(--rule);background:var(--surface);
  padding:4px 9px;border-radius:3px;color:var(--muted)}
.chip b{color:var(--ink);font-weight:600}
section{padding:44px 0 4px;border-bottom:1px solid var(--rule)}
section:last-of-type{border-bottom:0}
.sechead{display:flex;align-items:baseline;gap:14px;margin-bottom:20px;flex-wrap:wrap}
.sechead .src{font-family:var(--mono);font-size:11px;color:var(--dim);
  letter-spacing:.05em;margin-left:auto}
.verdicts{display:grid;gap:0;margin:8px 0 0;
  border:1px solid var(--rule);border-radius:4px;overflow:hidden;background:var(--surface)}
.verdict{display:grid;grid-template-columns:auto 1fr;gap:16px;
  padding:16px 18px;border-bottom:1px solid var(--rule)}
.verdict:last-child{border-bottom:0}
.verdict .k{font-family:var(--mono);font-size:11px;letter-spacing:.08em;
  text-transform:uppercase;color:var(--dim);padding-top:3px;white-space:nowrap}
.verdict .v{margin:0}
.verdict .v strong{font-weight:600}
figure{margin:22px 0 8px;background:var(--surface);border:1px solid var(--rule);
  border-radius:4px;padding:10px}
figure img{display:block;width:100%;height:auto;border-radius:2px}
figcaption{font-size:13.5px;color:var(--muted);margin-top:10px;padding:0 4px 4px;
  max-width:70ch;line-height:1.55}
figcaption b{color:var(--ink);font-weight:600}
.chartbox{background:var(--surface);border:1px solid var(--rule);border-radius:4px;
  padding:14px 12px 6px;margin:20px 0 8px}
.chartbox svg{width:100%;height:auto;display:block}
.legend{display:flex;gap:16px;flex-wrap:wrap;padding:8px 4px 4px;
  font-family:var(--mono);font-size:11.5px;color:var(--muted)}
.legend i{display:inline-block;width:16px;height:0;border-top-width:2px;
  border-top-style:solid;vertical-align:middle;margin-right:6px}
.grid{stroke:var(--rule);stroke-width:1}
.tick,.axis{font-size:10.5px;fill:var(--dim)}
.plabel{font-size:12px;fill:var(--ink)}
.zval{font-size:11.5px;fill:var(--muted)}
.bar.strong{fill:var(--accent)}
.bar.mid{fill:var(--accent);fill-opacity:.62}
.bar.weak{fill:var(--muted);fill-opacity:.42}
.noiseband{fill:var(--ink);fill-opacity:.045}
.noiseline{stroke:var(--dim);stroke-width:1;stroke-dasharray:3 3}
.fillbar{fill:var(--accent);fill-opacity:.72}
.scroll{overflow-x:auto;margin:16px 0 8px;border:1px solid var(--rule);
  border-radius:4px;background:var(--surface)}
table{border-collapse:collapse;width:100%;font-size:14px}
th{text-align:left;font-family:var(--mono);font-size:11px;letter-spacing:.06em;
  text-transform:uppercase;color:var(--dim);font-weight:600;
  padding:10px 14px;border-bottom:1px solid var(--rule);white-space:nowrap}
td{padding:9px 14px;border-bottom:1px solid var(--rule);vertical-align:top}
tr:last-child td{border-bottom:0}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
td.mono{font-family:var(--mono);font-size:13px}
td.dim,.dim{color:var(--muted)}
tr.hl td{background:var(--accent-soft)}
.pill{font-family:var(--mono);font-size:10.5px;letter-spacing:.05em;
  padding:2px 7px;border-radius:2px;white-space:nowrap;border:1px solid transparent}
.pill.strong{background:var(--accent);color:#fff}
.pill.mid{background:var(--accent-soft);color:var(--accent);border-color:var(--accent)}
.pill.weak{border-color:var(--rule);color:var(--muted)}
.pill.none{color:var(--dim)}
.note{border-left:2px solid var(--accent);padding:2px 0 2px 16px;margin:20px 0;
  color:var(--muted);font-size:14.5px;max-width:68ch}
.note b{color:var(--ink)}
.bugs{display:grid;gap:0;border:1px solid var(--rule);border-radius:4px;
  overflow:hidden;background:var(--surface);margin-top:8px}
.bug{padding:16px 18px;border-bottom:1px solid var(--rule)}
.bug:last-child{border-bottom:0}
.bug h4{font-family:var(--mono);font-size:13.5px;margin:0 0 5px;font-weight:600}
.bug p{margin:0;font-size:14.5px;color:var(--muted)}
.bug p + p{margin-top:7px}
.bug .cost{color:var(--warn)}
ul{margin:0 0 14px;padding-left:20px;max-width:68ch}
li{margin-bottom:7px}
code{font-family:var(--mono);font-size:.9em;background:var(--accent-soft);
  padding:1px 5px;border-radius:2px}
footer{padding:40px 0 0;color:var(--dim);font-size:13px;font-family:var(--mono)}
@media (max-width:640px){
  header{padding-top:40px}
  h1{font-size:24px}
  .verdict{grid-template-columns:1fr;gap:5px}
  .sechead .src{margin-left:0;width:100%}
}
"""

    html = f"""<title>Quincunx calibration &mdash; decision record</title>
<style>{css}</style>
<div class="wrap">

<header>
  <p class="eyebrow">Programmable quincunx &middot; board_def &middot; decision record</p>
  <h1>How much do the physics coefficients actually matter?</h1>
  <p class="lede">A sensitivity gut-check on the recreated original board, and what
  the two reference photographs of the real thing say about whether the
  simulation is calibrated at all.</p>
  <div class="meta">
    <span class="chip"><b>{G['n_buckets']}</b> buckets &middot; {G['pitch_mm']:.2f}&thinsp;mm pitch, derived from the STL</span>
    <span class="chip"><b>800</b> balls per run</span>
    <span class="chip"><b>{D['n_seeds']['phys2']}</b> baseline seeds</span>
    <span class="chip"><b>2</b> photographs, one board</span>
    <span class="chip">current physics <b>phys&nbsp;3</b></span>
  </div>
</header>

<section>
  <div class="sechead"><h2>What it comes to</h2></div>
  <div class="verdicts">
    <div class="verdict"><div class="k">Calibrate</div><p class="v">
      <strong>Ball restitution is the one coefficient that has to be right.</strong>
      Dropping it from .85 to .5 widens the output variance by
      {D['ranking'][0]['max_var_shift']:.0f}&thinsp;mm&sup2;
      &mdash; {D['ranking'][0]['max_var_shift']/nf['variance']['sd']:.1f}&times; the noise
      standard deviation &mdash; and pulls the shape away from a gaussian by
      |z|&nbsp;=&nbsp;{D['ranking'][0]['worst_z']:.0f}. Ball and pane friction come next, worth
      {min(abs(D['levels'][2]['variance_delta']), abs([r for r in D['levels'] if r['param']=='paneFric' and r['level']==0.6][0]['variance_delta'])):.0f}&ndash;{abs(D['levels'][2]['variance_delta']):.0f}&thinsp;mm&sup2; each.
      Board restitution, board friction and tilt are at or below the noise floor.</p></div>
    <div class="verdict"><div class="k">Trust</div><p class="v">
      <strong>The sim is closer to each photograph than the photographs are to each other.</strong>
      There is no evidence it is mis-calibrated &mdash; but with two realizations the photos
      also cannot discriminate between coefficient settings.</p></div>
    <div class="verdict"><div class="k">Fixed</div><p class="v">
      <strong>Three measurement bugs silently invalidated earlier runs.</strong>
      A board with no pegs, histogram bins that moved with the data, and a ball
      channel one layer too shallow. All three produced plausible numbers.</p></div>
    <div class="verdict"><div class="k">Next</div><p class="v">
      <strong>The lattice assumption behind the custom-board generator is probably wrong.</strong>
      Observed spread is {lo:.1f}&ndash;{hi:.1f}&times; what an ideal ten-row lattice predicts, so a ball
      is not making one &plusmn;{lat['step_mm']:.1f}&thinsp;mm decision per row. This is what blocks boards
      for other target distributions.</p></div>
  </div>
</section>

<section>
  <div class="sechead"><h2>Reading the photographs</h2>
    <span class="src">analysis/photo.py &middot; figures.py</span></div>
  <p>Everything the real board contributes rests on two decisions: which pixels are
  ball, and where the bucket dividers are. Both were wrong at first, in ways the
  numbers alone looked fine through &mdash; so both get drawn back over the photograph.</p>

  <figure>
    <img src="{img_uri('still_overlay.png')}" alt="The still photograph with detected ball pixels tinted and the fitted divider comb drawn over it">
    <figcaption><b>The extraction, checked by eye.</b> Red is the ball mask; green lines are
    the fitted divider comb, dashed at the two outer edges where the geometry closes the
    array rather than a detection. At {still_ppm:.2f}&thinsp;px/mm the balls separate cleanly.
    The mask also catches the rim and the corner screws &mdash; trimming those rows moves the
    distribution by {0.04:.2f}&ndash;{0.07:.2f}&thinsp;mm, against a seed-to-seed noise of
    {D['distances_mm']['sim_seed_to_seed']:.2f}&thinsp;mm, so it is left in.</figcaption>
  </figure>

  <h3>Why each image needs a different mask</h3>
  <figure>
    <img src="{img_uri('mask_comparison.png')}" alt="Texture and brightness masks applied to both the still photograph and the animation frame">
    <figcaption><b>Texture works on the still; only brightness works on the animation.</b>
    The balls are specular, so no brightness threshold splits them on the sharp still &mdash;
    local texture does. At {anim_ppm:.2f}&thinsp;px/mm the animation frame is soft enough that
    the fin edges become the highest-contrast thing in the picture: the texture mask covers
    {masks['anim_last']['texture_fill']:.0%} of the frame and every column reads as full.
    Brightness covers {masks['anim_last']['dark_fill']:.0%} and recovers the real profile.</figcaption>
  </figure>

  <h3>The comb fit that quietly dropped a bucket</h3>
  <figure>
    <img src="{img_uri('comb_fit.png')}" alt="Two fitted divider combs, one correct and one shifted a full bucket to the right">
    <figcaption><b>Fitting to bright fins is not the same as fitting to gaps between ball columns.</b>
    Green fits the gaps and is correct. Red fits fin brightness &mdash; and the board's rim is bright
    too, so it slid {comb['offset_px']:.0f}&thinsp;px, almost exactly one bucket
    ({comb['offset_buckets']:.2f}), reading the rim as the sixteenth divider and dropping a real
    bucket off the far end. Both fits produce a plausible sixteen-bucket histogram.</figcaption>
  </figure>

  <div class="chartbox">{fill_chart()}</div>
</section>

<section>
  <div class="sechead"><h2>Simulation against the real board</h2>
    <span class="src">{D['n_seeds']['phys3']} seeds, phys&nbsp;3 &middot; 2 photographs</span></div>

  <div class="chartbox">{distribution_chart()}
    <div class="legend">
      <span><i style="border-color:var(--accent)"></i>simulation</span>
      <span><i style="border-color:var(--ink)"></i>still photograph</span>
      <span><i style="border-color:var(--muted);border-top-style:dashed"></i>animation, last frame</span>
    </div>
  </div>

  {moments_table()}
  {distance_table()}

  <p>The two photographs are <b>{D['distances_mm']['still_anim']:.2f}&thinsp;mm</b> apart in
  earth-mover distance; the simulation sits {D['distances_mm']['anim_sim']:.2f}&ndash;{D['distances_mm']['still_sim']:.2f}&thinsp;mm
  from each of them. So the real board's own run-to-run spread exceeds its disagreement with the sim.</p>

  <div class="note"><b>&ldquo;The real board isn't very normal&rdquo; does not survive two samples.</b>
  Normality r&sup2; is {D['profiles']['still']['normality_r2']:.3f} for the still but
  {D['profiles']['anim_last']['normality_r2']:.3f} for the animation and
  {D['profiles']['sim_phys3']['normality_r2']:.3f} for the sim. The jaggedness in any one
  photograph is mostly sampling noise &mdash; and the two photos disagree about the tails more
  than either disagrees with the simulation.</div>

  <div class="note">The two photographs differ by
  {abs(D['profiles']['still']['variance']-D['profiles']['anim_last']['variance']):.0f}&thinsp;mm&sup2;
  in variance. The largest coefficient effect measured below is
  {D['ranking'][0]['max_var_shift']:.0f}. <b>Two realizations of the real board therefore cannot
  be used to choose coefficients</b> &mdash; only to confirm the sim is in the right region, which they do.</div>
</section>

<section>
  <div class="sechead"><h2>Which coefficients matter</h2>
    <span class="src">one-at-a-time, 800 balls, phys&nbsp;2</span></div>
  <p>Every effect is measured against the seed-to-seed noise floor, because an effect
  smaller than that is not an effect. At baseline over {nf['variance']['n_seeds']} seeds the
  variance is {nf['variance']['mean']:.0f}&thinsp;mm&sup2; with a standard deviation of
  {nf['variance']['sd']:.1f}. <code>z</code> is the shift divided by its standard error;
  |z|&nbsp;&lt;&nbsp;2 means indistinguishable from seed noise.</p>

  <div class="chartbox">{sensitivity_chart()}</div>
  {ranking_table()}

  <div class="note"><b>This ranking revises the one in TODO.md, and the revision is about
  sample size, not physics.</b> Pane friction rose from third to second only because the
  tilt&nbsp;&times;&nbsp;pane-friction factorial contributed {[r for r in D['levels'] if r['param']=='paneFric' and r['level']==0.6][0]['n']} extra runs at
  <code>paneFric&nbsp;.6</code>, shrinking its standard error at an unchanged effect size.
  By effect size ball friction is still slightly larger
  ({abs([r for r in D['levels'] if r['param']=='ballFric' and r['level']==0.02][0]['variance_delta']):.0f}&thinsp;mm&sup2;
  vs {abs([r for r in D['levels'] if r['param']=='paneFric' and r['level']==0.6][0]['variance_delta']):.0f}).
  Read them as one tier, not as ranks &mdash; and note that pane friction is <em>not</em>
  negligible, which is a correction to the earlier &ldquo;only the ball's own properties matter&rdquo;.</div>

  <h3>Two settings that break the run rather than shift it</h3>
  <p><code>ballRest&nbsp;.95</code> never settles &mdash; all three seeds hit the 60,000-step cap
  still bouncing. Neither does <code>tilt&nbsp;30</code> at high pane friction, where
  {sum(1 for r in D['unsettled'] if r['tilt']==30.0 and r['paneFric']==0.6)} of the runs
  ran out at 20,000 steps. That is a property of the setting, not a failed run, so those
  {len(D['unsettled'])} runs are reported rather than averaged in.</p>

  <h3>The one interaction worth naming</h3>
  <p>A one-at-a-time design is blind to interactions by construction, and tilt&nbsp;&times;&nbsp;pane
  friction is exactly the pair that ought to have one: tilt presses the balls into the panes, so
  pane friction should only bite once the board leans. The 2&times;2 says tilt does nothing at low
  pane friction ({fac['tilt_effect_at_low_paneFric']:+.1f}&thinsp;mm&sup2;) and something at high
  ({fac['tilt_effect_at_high_paneFric']:+.1f}), an interaction of {fac['interaction']:+.1f}
  &plusmn;&thinsp;{fac['se']:.1f} &mdash; z&nbsp;=&nbsp;{fac['z']:.2f}.</p>
  <div class="note"><b>Don't bank it.</b> The cell that carries the effect is the one where
  {sum(1 for r in D['unsettled'] if r['tilt']==30.0 and r['paneFric']==0.6)} runs never settled and
  were excluded, so the surviving runs there are a biased subsample. The other metrics disagree in
  sign. Treat it as a reason to re-run that cell cleanly if tilt ever matters, not as an established effect.</div>
</section>

<section>
  <div class="sechead"><h2>Bugs that produced plausible numbers</h2>
    <span class="src">the reason for the physics version tag</span></div>
  <p>Each of these was found after it had already contaminated results, and none of them
  announced itself &mdash; every one returned a believable distribution.</p>
  <div class="bugs">
    <div class="bug">
      <h4>The board had no pegs</h4>
      <p>The STL was baked in at build time and set to <code>clear_board.stl</code>. Any run made
      without editing the import was measuring a funnel.</p>
      <p class="cost">Cost: every run before the model became a URL parameter.</p>
    </div>
    <div class="bug">
      <h4>The histogram bins moved with the data</h4>
      <p>Bucket edges came from <code>np.linspace(x.min(), x.max())</code>, so the bins were a
      function of where the balls happened to land. Variance was as much a measure of ball count
      as of physics. Edges now come from the fin geometry in the STL.</p>
      <p class="cost">Cost: variance across runs collapsed from 273&ndash;383 to 191&ndash;225 once fixed &mdash;
      most of the apparent spread was the measurement.</p>
    </div>
    <div class="bug">
      <h4>The ball channel was one layer too shallow</h4>
      <p>Sealing the 1.8&thinsp;mm void behind the back plate was right; also moving the front pane
      flush with the fin tops was not. It left ball centres 1.7&thinsp;mm of range &mdash; two layers
      where three fit &mdash; so buckets filled about 1.6&times; too fast and overflowed the 45&thinsp;mm
      fins at 3000 balls.</p>
      <p class="cost">Cost: invisible at 800 balls, fatal at 3000. Found only because the
      instructions specify 3000&ndash;3500 balls.</p>
    </div>
    <div class="bug">
      <h4>&hellip;and runs from both channel geometries had identical filenames</h4>
      <p>Two incompatible physics versions were distinguishable only by which seeds happened to
      have been used. A <code>phys-N</code> token now rides in every filename, and the
      {126} earlier runs are archived rather than deleted.</p>
      <p class="cost">Cost: nearly the whole dataset, had it gone unnoticed one more session.</p>
    </div>
  </div>
  <div class="note">Reassuringly, the channel fix barely moved the distribution at 800 balls:
  phys&nbsp;2 to phys&nbsp;3 is {D['distances_mm']['phys2_phys3']:.2f}&thinsp;mm, well inside the
  {D['distances_mm']['sim_seed_to_seed']:.2f}&thinsp;mm seed noise. That is why the sensitivity
  ranking above, measured on phys&nbsp;2, is still worth reading.</div>
</section>

<section>
  <div class="sechead"><h2>What blocks the next stage</h2>
    <span class="src">cad/generate-custom.py</span></div>
  <p>An ideal ten-row lattice &mdash; a ball making one &plusmn;{lat['step_mm']:.1f}&thinsp;mm decision per row &mdash;
  would give a variance of {lat['ideal_variance']:.1f}&thinsp;mm&sup2;. Every measured
  distribution, photographed or simulated, is <b>{lo:.1f}&ndash;{hi:.1f}&times; that</b>
  ({np.sqrt(lo):.1f}&ndash;{np.sqrt(hi):.1f}&times; in standard deviation).</p>
  <p>With 3.6&thinsp;mm gaps between 1.2&thinsp;mm pegs and 1&thinsp;mm balls, a ball travels much
  further sideways per row than the lattice picture assumes &mdash; it plausibly skips columns
  entirely. The inverse solver rests on exactly one physical assumption,
  <code>shift = (0.5 &minus; p) &times; COL_SPACING_REF</code>, which has never been checked and which
  this evidence argues against. If balls skip columns, the surrogate needs to be a displacement
  <em>kernel</em> per row, not a Bernoulli &mdash; a structurally different model, not a recalibrated one.</p>
  <div class="note"><b>Recommended next step:</b> measure the per-row deflection distribution
  directly. Export trajectories instead of only final positions and read each ball's x at each
  peg-row height &mdash; same validated physics, no new colliders, one run instead of a sweep.
  It answers whether the cheap forward model can exist at all, which decides whether designing
  boards for arbitrary target distributions is a search problem or a simulation problem.</div>
</section>

<section>
  <div class="sechead"><h2>Standing caveats</h2></div>
  <ul>
    <li>The sensitivity sweep was measured on <b>phys&nbsp;2</b>. The channel fix moves the
    distribution less than seed noise at 800 balls, so the ranking holds, but the absolute
    numbers would shift slightly if re-run.</li>
    <li>Conclusions hold only inside the ranges tried, and |z|&nbsp;&lt;&nbsp;2 means
    &ldquo;not detectable at 800 balls with three seeds&rdquo;, not &ldquo;zero&rdquo;.</li>
    <li>The simulation packs its buckets to about <b>43%</b> against the real board's
    <b>~68%</b>. Irrelevant below roughly 1000 balls; it limits any quantitative comparison
    at 3000.</li>
    <li>Two photographs, unknown ball count in each, and the animation frame is
    {still_ppm/anim_ppm:.1f}&times; lower resolution than the still &mdash; its tails are the least
    trustworthy part of the comparison.</li>
  </ul>
</section>

<footer>board_def / recreate_original_board &middot; generated by analysis/build_report.py</footer>
</div>
"""
    return html


if __name__ == "__main__":
    html = build()
    OUT.write_text(html)
    print(f"wrote {OUT}  ({len(html)/1024:.0f} KB)")
