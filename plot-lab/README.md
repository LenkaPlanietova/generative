# Plot Lab

Generative art and pen-plotter studio. Algorithms generate real vector geometry in millimetres; the preview,
SVG exporter, plotter optimiser and statistics all consume the same geometry.

**Status: Phase 4** (image-driven art). Phase 1 delivered the app, geometry system, Flow Field, seeds, paper
sizes, preview and validated SVG export. Phase 2 added Contour Field, Wave Distortion, Radial Geometry, Spirograph,
Lissajous Curves and Harmonograph. Phase 3 adds Moiré, Guilloché, Interference, Reaction-Diffusion, advanced noise
(ridged, billowed, domain-warped), Noise Flow and Topographic Fields. Phase 4 adds image import (16-bit PNG
aware), a shared image sampler, Redraw (passes the SPEC_ADDENDUM acceptance test), Contour Portrait (the sculptural
portrait engine), Wave Portrait, Adaptive Hatching and Image Displacement.

| Algorithm | How it works |
|---|---|
| Flow Field | Evenly spaced streamlines (Jobard–Lefer) through a seeded noise terrain, with variable spacing. |
| Contour Field | Marching squares over attractor / noise / radial / wave-surface fields; segments joined into continuous paths. |
| Wave Distortion | Parallel lines displaced by two sine waves plus noise, with a phase drift and an amplitude envelope; clipped to the area. |
| Radial Geometry | Polar rings or a spiral with petals, twist, amplitude growth, symmetric noise and multiple centres. |
| Spirograph | Hypotrochoids / epitrochoids; closes automatically after r / gcd(R, r) turns. |
| Lissajous Curves | x = A sin(at + δ), y = B sin(bt), with phase-stepped copies for ribbons. |
| Harmonograph | Four damped oscillators (two per axis), optional seeded detune. |
| Noise Flow | Noise-angle flow field (smooth, ridged, billowed or domain-warped noise) on the evenly spaced streamline engine. |
| Topographic Fields | Contour map of advanced-noise terrain with a sea level; coastline and every Nth contour on a separate "index" layer. |
| Moiré | Two to six line or ring systems with rotation, offset, waves and a lens; each system is its own SVG layer. |
| Guilloché | Bands of phase-shifted closed rosettes r = R + A·env(θ)·sin(fθ + 2πk/n) that interlace into an engraved lattice. |
| Interference | Sum of circular waves from point sources (circle, line or seeded positions), fringes traced as contours. |
| Redraw | Structure tensor of a reference image → direction; its tone → spacing; streamline engine with the Python reference's seeding and self-avoidance. |
| Contour Portrait | Depth map (+ photo relief) → direction, photo → spacing, with fidelity, abstraction, detail preservation and edge sensitivity (spec §8). |
| Wave Portrait | Parallel lines whose wave amplitude and frequency grow with darkness (phase integrated along the line). |
| Adaptive Hatching | Up to four hatch directions, each added below a darker tone threshold, each on its own SVG layer. |
| Image Displacement | Parallel lines displaced by tone (dark, light, or both ways from mid-grey) plus optional noise. |
| Reaction-Diffusion | Gray-Scott simulation in the worker on a grid with physical cell size (safety limit 400 k cells), exported as contours only. |

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest), incl. exact parity with the reference streamline worker
npm run e2e        # end-to-end (Playwright): generate → export → parse → render. First run: npx playwright install chromium
npm run build
```

## Architecture

| Layer | Path | Notes |
|---|---|---|
| Geometry | `src/geometry/` | `Point`, `PlotPath`, `GeometryCollection`, layers. Sheet millimetres, origin top-left. |
| Algorithms | `src/algorithms/` | One file per algorithm; shared helpers in `common.ts`. Plugin interface `GenerativeAlgorithm` + `ParameterDefinition`. The UI builds controls from the definitions. Register new algorithms in `registry.ts`. |
| Fields | `src/core/fields.ts`, `src/fields/` | `DirectionField` (double-angle) and `ScalarField` sources: noise, structure tensor, constant, radial; marching squares in `contours.ts`. |
| Geometry tools | `src/geometry/clip.ts`, `shape.ts` | Exact polyline clipping to the drawing area (Liang–Barsky), fit-to-area, rotation, Chaikin smoothing. |
| Engine | `src/engine/streamlines.ts` | Jobard–Lefer evenly spaced streamlines with variable separation, ported from `reference/js/streamlines.worker.js`. |
| Plotter | `src/plotter/` | Optimiser (dedupe, short-path removal, RDP within tolerance, nearest-neighbour ordering with reversal), stats, ink density, plotter profiles. |
| Export | `src/export/` | Hand-written SVG (mm size + viewBox, Inkscape layers, stroke only) and validation that blocks bad exports. |
| Images | `src/image/` | PNG via fast-png at full bit depth (16-bit depth maps stay 16-bit), JPEG via the browser; one sampler for fit / scale / position (crop), brightness, contrast, invert and blur; built-in sample head. Images live in memory only. |
| Worker | `src/worker/`, `src/pipeline.ts` | Generate → stats → optimise → stats, off the main thread. Partial results stream to the preview; each change terminates and restarts the worker (300 ms debounce). |
| UI | `src/app/`, `src/store/` | React + Zustand + Tailwind + Lucide. Settings persist to localStorage and are validated on load. |

## Decisions

- **No p5.js** (SPEC_ADDENDUM §A, which overrides the main spec). Geometry is plain TypeScript. The preview uses
  Canvas 2D, and the SVG is written by hand, independent of the preview.
- **Millimetres everywhere.** Field grids convert mm to px in one place (`Grid.mmPerPx`). Grid resolution changes
  precision, not the drawing.
- **Determinism.** One seeded PRNG (xorshift32) and hash-based noise. `Math.random()` is never used in geometry; the
  UI uses `crypto` only to pick a new seed.
- **Preview at real pen width**, so on-screen density matches the plot.
- **Export validation**: blocks empty, non-finite, out-of-area, wrong-size, invisible-stroke and malformed output, as
  well as raster, filter, clip, CSS and fill content. Warns on ink overlap (1 mm coverage grid), spacing under
  1.2 × pen width, long plots, many lifts and very short paths.
- **Every control must do something.** `test/algorithms.test.ts` runs every algorithm through the same contract:
  deterministic, finite and inside the margins on several papers, valid export, every parameter changes the drawing,
  and the seed matters exactly when `usesSeed` says it does. (Pure-maths curves only use the seed for wobble or
  detune; the UI says so.)
- **Plotter profile "MakerQ EasyDraw V4"** ships with editable starting values only, not claimed machine specs.
- Flow Field parameters follow SPEC_ADDENDUM §C (streamline engine), mapped onto the spec's control groups:
  seed distribution, line count limit, step size, curvature (max turn), flow direction, noise scale, min spacing
  and randomness (wobble).

## Acceptance test (SPEC_ADDENDUM §D.1)

`test/acceptance.test.ts` decodes `reference/examples/source_lineart.png`, runs Redraw with the README settings on A3
and checks the result against `redraw_dense_A3.svg`: 1,000–1,100 paths (currently ~1,084 vs 1,058), 30–35 m of ink
(~33.0 vs 32.5 m), pen-up under 6 m (~4.1 m), and ink-density correlation on a 4 mm grid above 0.93 (~0.97).
Matching the reference needed two options in the engine that follow the Python tracer rather than the JS worker:
seed clearance 1 × spacing and per-half self-avoidance.

Reference material for porting: `reference/` (see `reference/README.md`) and `SPEC_ADDENDUM.md`.
