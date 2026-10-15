"""
Depth-driven flow-line portrait for pen plotters.

Lines follow the contours of the depth map (perpendicular to the depth gradient),
so they wrap around nose, cheeks, lips and eye sockets. Darkness comes from line
spacing: lines pack tightly where the photo is dark and spread out where it is light.
Placement uses Jobard–Lefer evenly-spaced streamlines with variable separation.

Usage:
    svg, preview = make_portrait("photo.jpg", "depth_smooth_16bit.png", **settings)
"""
import math
import random
from collections import deque

import cv2
import numpy as np


# ---------------------------------------------------------------- fields
def load_inputs(photo_path, depth_path, work_px):
    photo = cv2.imread(photo_path, cv2.IMREAD_GRAYSCALE)
    depth = cv2.imread(depth_path, cv2.IMREAD_UNCHANGED)
    if photo is None or depth is None:
        raise FileNotFoundError("Could not read the photo or the depth map.")
    if depth.ndim == 3:
        depth = cv2.cvtColor(depth, cv2.COLOR_BGR2GRAY)
    h, w = photo.shape
    s = work_px / max(h, w)
    W, H = int(round(w * s)), int(round(h * s))
    photo = cv2.resize(photo, (W, H), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    depth = cv2.resize(depth.astype(np.float32), (W, H), interpolation=cv2.INTER_AREA)
    depth = (depth - depth.min()) / max(1e-9, depth.max() - depth.min())
    return photo, depth


def orientation_field(depth, detail_sigma, flow_sigma, global_weight):
    """Return (c, s) = cos/sin of DOUBLE the line angle (sign-free orientation)."""
    def tensor(d, sigma):
        d = cv2.GaussianBlur(d, (0, 0), sigma)
        gx = cv2.Sobel(d, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(d, cv2.CV_32F, 0, 1, ksize=3)
        jxx = cv2.GaussianBlur(gx * gx, (0, 0), sigma)
        jyy = cv2.GaussianBlur(gy * gy, (0, 0), sigma)
        jxy = cv2.GaussianBlur(gx * gy, (0, 0), sigma)
        norm = (jxx + jyy).mean() + 1e-12          # make both scales comparable
        return jxx / norm, jyy / norm, jxy / norm

    a = tensor(depth, detail_sigma)
    b = tensor(depth, flow_sigma)
    jxx = a[0] + global_weight * b[0]
    jyy = a[1] + global_weight * b[1]
    jxy = a[2] + global_weight * b[2]
    # gradient orientation phi: (cos2phi, sin2phi) ~ (jxx - jyy, 2jxy)
    # line direction is perpendicular -> theta = phi + 90deg -> negate both
    c = -(jxx - jyy)
    s = -(2 * jxy)
    # tiny fallback bias (vertical lines) where the depth is completely flat
    eps = 1e-3
    c = c + eps * math.cos(2 * math.pi / 2)
    s = s + eps * math.sin(2 * math.pi / 2)
    return c.astype(np.float32), s.astype(np.float32)


def tone_field(photo, contrast, blur):
    t = photo.copy()
    if blur > 0:
        t = cv2.GaussianBlur(t, (0, 0), blur)
    # local contrast (CLAHE) helps faces with soft light
    clahe = cv2.createCLAHE(clipLimit=contrast, tileGridSize=(8, 8))
    t = clahe.apply((t * 255).astype(np.uint8)).astype(np.float32) / 255
    return t


# ---------------------------------------------------------------- tracer
class Tracer:
    def __init__(self, c, s, tone, d_min, d_max, gamma, test_ratio, step,
                 white_cut, min_len, max_turn_deg, seed=1):
        self.c, self.s, self.tone = c, s, tone
        self.H, self.W = tone.shape
        self.d_min, self.d_max, self.gamma = d_min, d_max, gamma
        self.test_ratio, self.step = test_ratio, step
        self.white_cut, self.min_len = white_cut, min_len
        self.cos_max_turn = math.cos(math.radians(max_turn_deg))
        self.cell = d_max
        self.gw = int(self.W / self.cell) + 2
        self.gh = int(self.H / self.cell) + 2
        self.grid = {}
        self.lines = []
        random.seed(seed)

    # bilinear sample
    def _sample(self, arr, x, y):
        x = min(max(x, 0.0), self.W - 1.001)
        y = min(max(y, 0.0), self.H - 1.001)
        x0, y0 = int(x), int(y)
        fx, fy = x - x0, y - y0
        a = arr[y0, x0]; b = arr[y0, x0 + 1]
        c = arr[y0 + 1, x0]; d = arr[y0 + 1, x0 + 1]
        return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy

    def sep(self, x, y):
        t = self._sample(self.tone, x, y)
        return self.d_min + (self.d_max - self.d_min) * (t ** self.gamma)

    def direction(self, x, y, prev):
        c = self._sample(self.c, x, y)
        s = self._sample(self.s, x, y)
        mag = math.hypot(c, s)
        if mag < 1e-9:
            return None
        th = 0.5 * math.atan2(s, c)
        dx, dy = math.cos(th), math.sin(th)
        if prev is not None and dx * prev[0] + dy * prev[1] < 0:
            dx, dy = -dx, -dy
        return dx, dy

    def inside(self, x, y):
        return 1 <= x < self.W - 2 and 1 <= y < self.H - 2

    def too_close(self, x, y, radius, own=None, own_skip=0):
        gx, gy = int(x / self.cell), int(y / self.cell)
        r2 = radius * radius
        for j in range(gy - 1, gy + 2):
            for i in range(gx - 1, gx + 2):
                pts = self.grid.get((i, j))
                if pts:
                    for px, py in pts:
                        if (px - x) ** 2 + (py - y) ** 2 < r2:
                            return True
        if own:  # self-collision against older points of the line being traced
            n = len(own) - own_skip
            for k in range(0, max(0, n), 2):
                px, py = own[k]
                if (px - x) ** 2 + (py - y) ** 2 < r2:
                    return True
        return False

    def add_line(self, pts):
        for x, y in pts:
            key = (int(x / self.cell), int(y / self.cell))
            self.grid.setdefault(key, []).append((x, y))
        self.lines.append(pts)

    def _march(self, x, y, d0):
        pts = []
        prev = d0
        skip = int(3 * self.d_max / self.step) + 2
        max_steps = 20000
        for _ in range(max_steps):
            d = self.direction(x, y, prev)
            if d is None:
                break
            # RK2 midpoint
            mx, my = x + d[0] * self.step * 0.5, y + d[1] * self.step * 0.5
            d2 = self.direction(mx, my, d)
            if d2 is None:
                break
            if prev is not None and d2[0] * prev[0] + d2[1] * prev[1] < self.cos_max_turn:
                break  # sharp turn = singularity, stop
            nx, ny = x + d2[0] * self.step, y + d2[1] * self.step
            if not self.inside(nx, ny):
                break
            if self._sample(self.tone, nx, ny) > self.white_cut:
                break
            sep = self.sep(nx, ny)
            if self.too_close(nx, ny, sep * self.test_ratio, pts, skip):
                break
            pts.append((nx, ny))
            x, y, prev = nx, ny, d2
        return pts

    def trace(self, x, y):
        if not self.inside(x, y) or self._sample(self.tone, x, y) > self.white_cut:
            return None
        if self.too_close(x, y, self.sep(x, y)):
            return None
        d = self.direction(x, y, None)
        if d is None:
            return None
        fwd = self._march(x, y, d)
        back = self._march(x, y, (-d[0], -d[1]))
        pts = back[::-1] + [(x, y)] + fwd
        length = len(pts) * self.step
        if length < self.min_len:
            return None
        return pts

    def run(self, progress=True):
        queue = deque()

        def seeds_from(line):
            stride = max(1, int(self.d_min / self.step))
            for k in range(0, len(line) - 1, stride):
                x, y = line[k]
                x2, y2 = line[k + 1]
                tx, ty = x2 - x, y2 - y
                n = math.hypot(tx, ty) or 1
                nx, ny = -ty / n, tx / n
                d = self.sep(x, y)
                queue.append((x + nx * d, y + ny * d))
                queue.append((x - nx * d, y - ny * d))

        # coarse fallback seeds, darkest first, so every region gets lines
        g = max(2, int(self.d_max))
        cand = [(self.tone[y, x], x + 0.5, y + 0.5)
                for y in range(g // 2, self.H, g) for x in range(g // 2, self.W, g)]
        cand.sort()
        ci = 0
        total = len(cand)
        while True:
            if not queue:
                # pick next unused candidate
                while ci < total:
                    _, x, y = cand[ci]; ci += 1
                    line = self.trace(x, y)
                    if line:
                        self.add_line(line); seeds_from(line)
                        break
                else:
                    break
                if progress and len(self.lines) % 200 == 0:
                    print(f"  {len(self.lines)} lines, {ci}/{total} regions scanned")
                continue
            x, y = queue.popleft()
            line = self.trace(x, y)
            if line:
                self.add_line(line)
                seeds_from(line)
                if progress and len(self.lines) % 200 == 0:
                    print(f"  {len(self.lines)} lines, {ci}/{total} regions scanned")
        return self.lines


# ---------------------------------------------------------------- output
def simplify(pts, tol):
    if len(pts) < 3:
        return pts
    arr = np.array(pts, dtype=np.float32).reshape(-1, 1, 2)
    return cv2.approxPolyDP(arr, tol, False).reshape(-1, 2).tolist()


def to_svg(lines, W, H, paper_mm, margin_mm, stroke_mm, path):
    pw, ph = paper_mm
    scale = min((pw - 2 * margin_mm) / W, (ph - 2 * margin_mm) / H)
    ox = (pw - W * scale) / 2
    oy = (ph - H * scale) / 2
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{pw}mm" height="{ph}mm" '
           f'viewBox="0 0 {pw} {ph}">',
           f'<g fill="none" stroke="black" stroke-width="{stroke_mm}" '
           f'stroke-linecap="round" stroke-linejoin="round">']
    for ln in lines:
        pts = simplify(ln, 0.15)
        if len(pts) < 2:
            continue
        d = "M" + " L".join(f"{ox + x * scale:.2f},{oy + y * scale:.2f}" for x, y in pts)
        out.append(f'<path d="{d}"/>')
    out.append("</g></svg>")
    with open(path, "w") as f:
        f.write("\n".join(out))
    return scale


def preview(lines, W, H, px_per_unit, stroke_units, path):
    img = np.full((int(H * px_per_unit), int(W * px_per_unit)), 255, np.uint8)
    t = max(1, int(round(stroke_units * px_per_unit)))
    for ln in lines:
        p = (np.array(ln) * px_per_unit).astype(np.int32).reshape(-1, 1, 2)
        cv2.polylines(img, [p], False, 0, t, cv2.LINE_AA)
    cv2.imwrite(path, img)
    return img


def make_portrait(photo_path, depth_path,
                  out_svg="portrait_A3.svg", out_png="portrait_preview.png",
                  paper_mm=(297, 420), margin_mm=25, pen_mm=0.4,
                  work_px=900,
                  min_spacing_mm=0.7, max_spacing_mm=3.5, gamma=1.3,
                  detail_sigma=4.0, flow_sigma=25.0, global_weight=0.6,
                  contrast=1.0, tone_blur=1.5,
                  test_ratio=0.5, white_cut=0.97, min_len_mm=8.0,
                  max_turn_deg=35, seed=1, progress=True):
    photo, depth = load_inputs(photo_path, depth_path, work_px)
    H, W = photo.shape
    pw, ph = paper_mm
    mm_per_px = min((pw - 2 * margin_mm) / W, (ph - 2 * margin_mm) / H)
    to_px = 1 / mm_per_px

    c, s = orientation_field(depth, detail_sigma, flow_sigma, global_weight)
    tone = tone_field(photo, contrast, tone_blur)

    d_min = min_spacing_mm * to_px
    d_max = max_spacing_mm * to_px
    tr = Tracer(c, s, tone, d_min, d_max, gamma, test_ratio,
                step=max(0.3, d_min * 0.35), white_cut=white_cut,
                min_len=min_len_mm * to_px, max_turn_deg=max_turn_deg, seed=seed)
    if progress:
        print(f"Grid {W}x{H}px, 1px = {mm_per_px:.3f} mm, spacing {d_min:.2f}-{d_max:.2f}px")
    lines = tr.run(progress)

    to_svg(lines, W, H, paper_mm, margin_mm, pen_mm, out_svg)
    preview(lines, W, H, 3, pen_mm * to_px, out_png)
    total_mm = sum(len(l) for l in lines) * tr.step * mm_per_px
    if progress:
        print(f"Done: {len(lines)} lines, {total_mm / 1000:.1f} m of ink")
        print(f"Saved {out_svg} and {out_png}")
    return lines
