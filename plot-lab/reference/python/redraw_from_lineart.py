"""
Redraw a line-art (or any grayscale) image as evenly spaced flow lines for a pen plotter.

This is the exact method behind examples/redraw_dense_A3.svg:
  1. Direction field = structure tensor of the SOURCE image, so new lines follow the
     direction of the original's lines (two scales blended: local detail + overall flow).
  2. Tone field = blurred source brightness, normalised. Dark = lines close together.
  3. Jobard–Lefer evenly-spaced streamlines with variable separation (flow_lines.Tracer).
  4. Greedy nearest-neighbour ordering with reversal to minimise pen-up travel.

It does NOT trace the source: every output line is newly generated geometry.

Usage:
  python redraw_from_lineart.py ../examples/source_lineart.png out.svg            # "dense" preset
  python redraw_from_lineart.py in.png out.svg --min 0.45 --max 2.2 --gamma 0.45  # "light" preset
"""
import argparse
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from flow_lines import Tracer  # noqa: E402

PAPER = {"A5": (148, 210), "A4": (210, 297), "A3": (297, 420), "A2": (420, 594)}

ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("out")
ap.add_argument("--paper", default="A3", choices=PAPER)
ap.add_argument("--margin", type=float, default=20, help="mm")
ap.add_argument("--pen", type=float, default=0.3, help="stroke width in SVG, mm")
ap.add_argument("--min", dest="min_sp", type=float, default=0.35, help="line spacing in darkest areas, mm")
ap.add_argument("--max", dest="max_sp", type=float, default=1.3, help="line spacing in lightest areas, mm")
ap.add_argument("--gamma", type=float, default=0.5, help="<1 = more lines in mid-tones")
ap.add_argument("--white-cut", type=float, default=0.985, help="no lines where tone is lighter than this")
ap.add_argument("--clearance", type=float, default=0.55, help="how close a line may run to a neighbour (x spacing)")
ap.add_argument("--min-len", type=float, default=3, help="drop lines shorter than this, mm")
ap.add_argument("--max-turn", type=float, default=40, help="stop a line at kinks sharper than this per step, deg")
ap.add_argument("--detail", type=float, default=3, help="local direction smoothing (source px)")
ap.add_argument("--swirl", type=float, default=12, help="overall flow smoothing (source px)")
ap.add_argument("--swirl-weight", type=float, default=0.5)
ap.add_argument("--upscale", type=float, default=2, help="working grid = source size × this")
ap.add_argument("--seed", type=int, default=1)
a = ap.parse_args()

UP = a.upscale
g = cv2.imread(a.src, cv2.IMREAD_GRAYSCALE)
if g is None:
    sys.exit(f"Cannot read {a.src}")
g = cv2.resize(g.astype(np.float32) / 255, None, fx=UP, fy=UP, interpolation=cv2.INTER_CUBIC)
H, W = g.shape

# --- direction field: structure tensor of the source, double-angle form (sign-free)
b = cv2.GaussianBlur(g, (0, 0), 0.8 * UP)
gx = cv2.Sobel(b, cv2.CV_32F, 1, 0, ksize=3)
gy = cv2.Sobel(b, cv2.CV_32F, 0, 1, ksize=3)
def tensor(sigma):
    return [cv2.GaussianBlur(t, (0, 0), sigma) for t in (gx * gx, gy * gy, gx * gy)]
A, B = tensor(a.detail * UP), tensor(a.swirl * UP)
xx = A[0] + a.swirl_weight * B[0]
yy = A[1] + a.swirl_weight * B[1]
xy = A[2] + a.swirl_weight * B[2]
c = -(xx - yy)          # rotate 90°: lines run ALONG the source strokes, not across them
s = -2 * xy

# --- tone field
tone = cv2.GaussianBlur(g, (0, 0), 2.5 * UP)
lo = np.percentile(tone, 1)
tone = np.clip((tone - lo) / (0.985 - lo), 0, 1)

# --- paper mapping
pw, ph = PAPER[a.paper]
mm_per_px = min((pw - 2 * a.margin) / W, (ph - 2 * a.margin) / H)
to_px = 1 / mm_per_px
ox, oy = (pw - W * mm_per_px) / 2, (ph - H * mm_per_px) / 2

tr = Tracer(c.astype(np.float32), s.astype(np.float32), tone.astype(np.float32),
            a.min_sp * to_px, a.max_sp * to_px, a.gamma, a.clearance,
            step=max(0.3, a.min_sp * to_px * 0.35), white_cut=a.white_cut,
            min_len=a.min_len * to_px, max_turn_deg=a.max_turn, seed=a.seed)
lines = [np.array(l) * mm_per_px + [ox, oy] for l in tr.run(progress=False)]

# --- simplify + order
lines = [cv2.approxPolyDP(l.astype(np.float32).reshape(-1, 1, 2), 0.05, False).reshape(-1, 2) for l in lines]
st = np.array([l[0] for l in lines]); en = np.array([l[-1] for l in lines])
alive = np.ones(len(lines), bool); cur = np.zeros(2); ordered = []; travel = 0.0
for _ in lines:
    ds = np.hypot(*(st - cur).T); de = np.hypot(*(en - cur).T)
    ds[~alive] = de[~alive] = np.inf
    i, j = ds.argmin(), de.argmin()
    if ds[i] <= de[j]:
        alive[i] = False; ordered.append(lines[i]); travel += ds[i]; cur = en[i]
    else:
        alive[j] = False; ordered.append(lines[j][::-1]); travel += de[j]; cur = st[j]
ink = sum(np.hypot(*np.diff(l, axis=0).T).sum() for l in ordered)

with open(a.out, "w") as f:
    f.write(f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" '
            f'width="{pw}mm" height="{ph}mm" viewBox="0 0 {pw} {ph}">\n'
            f'<g inkscape:groupmode="layer" inkscape:label="1 ink" fill="none" stroke="black" '
            f'stroke-width="{a.pen}" stroke-linecap="round" stroke-linejoin="round">\n')
    for l in ordered:
        f.write('<path d="M' + " L".join(f"{x:.2f},{y:.2f}" for x, y in l) + '"/>\n')
    f.write("</g></svg>\n")
print(f"{len(ordered)} lines · {ink/1000:.1f} m ink · {travel/1000:.1f} m pen-up · saved {a.out}")
