# PLOT LAB — Spec addendum

These changes override or extend the main PLOT LAB spec. Where they conflict, this addendum wins.
A working reference implementation is in `reference/` (see `reference/README.md`).

## A. Technology stack
- **Remove p5.js.** Geometry is generated as plain TypeScript vector data. The preview uses the native
  Canvas 2D API and export uses hand-written SVG. Do not use p5 or any raster step for generation.

## B. Fields are separate from algorithms
Introduce two shared field types that algorithms consume:

```ts
interface DirectionField {   // sign-free orientation, double-angle form
  width: number; height: number;          // grid size
  c: Float32Array; s: Float32Array;       // θ = ½·atan2(s, c)
}
interface ScalarField {      // 0..1, e.g. tone, density, depth
  width: number; height: number; data: Float32Array;
}
```

Field sources (each one a small module):
- Noise (seeded)
- Image structure tensor (two blended scales: detail + swirl)
- Depth map (16-bit grayscale PNG, optional blend with photo "relief")
- Image luminance (tone / density)
- Constant

Algorithms take fields as inputs, so image-driven art in Phase 4 is just a new field source
plugged into existing algorithms.

## C. Phase 1 — Flow Field = evenly spaced streamline engine
Build the Phase 1 Flow Field on a reusable **streamline engine** (Jobard–Lefer evenly spaced
streamlines with **variable separation**), not plain particle tracing. Port it from
`reference/js/streamlines.worker.js`.

Required parameters (all in mm or degrees, never pixels):
- Darkest spacing, Lightest spacing, Gamma, Clearance (× spacing)
- Min line length, Max line length, Max turn per step
- Step size (× darkest spacing)
- Seed order: darkest first / centre outwards / random
- White cut (no lines above this tone)
- Field: detail smoothing, swirl size, swirl strength, direction offset (0° = contours, 90° = down slopes), wobble amount, wobble size

In Phase 1 the direction field comes from noise and the density field is constant or a radial
gradient. The engine must already accept any `DirectionField` / `ScalarField`.

## D. Phase 4 — Image-driven, priority order
1. **Redraw mode**: direction from the structure tensor of a reference image, density from its
   tone. **Acceptance test:** with `reference/examples/source_lineart.png` and the settings table in
   `reference/README.md`, the output must be visually equivalent to
   `reference/examples/redraw_dense_A3.svg` (about 1,000–1,100 paths, about 30–35 m of ink on A3).
2. **Depth portrait**: direction from a 16-bit depth map plus photo relief, density from the photo.
3. Then Wave Portrait, Adaptive Hatching, and so on.

Image import must read **16-bit PNG** without downsampling to 8-bit. Use a PNG decoder library,
not `<img>` or canvas.

## E. Real clipping (not masks)
Add **Clip to shape**: circle, rectangle or ellipse, with position and size in mm, plus "keep inside" or "keep outside".
Paths are actually cut at the boundary (segment–shape intersection) and the outside pieces are
removed. An optional toggle also draws the clip outline as its own layer. This replaces any need for
SVG `clipPath` in exports.

## F. Pen width ↔ spacing validation
- Every profile and project has a **pen width (mm)**.
- Warn when darkest spacing < 1.2 × pen width ("these areas will plot as solid black").
- Preview strokes are drawn at the real pen width at physical scale, so density looks true.

## G. Paper sizes
Add **A5** and **Square (200 × 200 mm)** to the paper presets, alongside A4, A3, A2 and custom.

## H. Plotting statistics
Report ink length, pen-up travel and estimated time **before and after optimisation**, so the gain is visible.
Reference result: ordering cut pen-up travel from about 50 m to 4 m on the favourite piece.
