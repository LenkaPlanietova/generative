# Plot Lab

Generative art and pen-plotter studio. Algorithms generate real vector geometry in millimetres; the preview,
SVG exporter, plotter optimiser and statistics all consume the same geometry.

**Status: Phase 6** (performance and polish) — all roadmap phases are in place. Phase 1 delivered the app, geometry system, Flow Field, seeds, paper
sizes, preview and validated SVG export. Phase 2 added Contour Field, Wave Distortion, Radial Geometry, Spirograph,
Lissajous Curves and Harmonograph. Phase 3 adds Moiré, Guilloché, Interference, Reaction-Diffusion, advanced noise
(ridged, billowed, domain-warped), Noise Flow and Topographic Fields. Phase 4 adds image import (16-bit PNG
aware), a shared image sampler, Redraw (passes the SPEC_ADDENDUM acceptance test), Contour Portrait (the sculptural
portrait engine), Wave Portrait, Adaptive Hatching, Flow Hatching and Image Displacement. Phase 5 adds project files, presets, the
variation explorer and clip to shape (SPEC_ADDENDUM §E). Phase 6 adds adaptive preview quality (a quick draft while
adjusting, then full quality), a cache of recent results, a configurable point safety limit, and keyboard shortcuts
(press `?` in the app).

| Algorithm | How it works |
|---|---|
| Flow Field | Evenly spaced streamlines (Jobard–Lefer) through a seeded noise terrain, with variable spacing. |
| Contour Field | Marching squares over attractor / noise / radial / wave-surface fields; segments joined into continuous paths. |
| Wave Distortion | Parallel lines displaced by two sine waves plus noise, with a phase drift and an amplitude envelope; clipped to the area. |
| Radial Geometry | Polar rings or a spiral with petals, twist, amplitude growth, symmetric noise and multiple centres. |
| Spirograph | Hypotrochoids / epitrochoids; closes automatically after r / gcd(R, r) turns. |
| Lissajous Curves | x = A sin(at + δ), y = B sin(bt), with phase-stepped copies for ribbons. |
| Harmonograph | Four damped oscillators (two per axis), optional seeded detune. |
| Noise Torus | A torus displaced along its normals by seeded 3D noise (fBm), drawn as rings around the donut and/or the tube, rotated (spin, tilt, turn), projected with optional perspective, hidden lines removed. Top view (tilt 0°) = concentric noise rings. |
| Noise Flow | Noise-angle flow field (smooth, ridged, billowed or domain-warped noise) on the evenly spaced streamline engine. |
| Topographic Fields | Contour map of advanced-noise terrain with a sea level; coastline and every Nth contour on a separate "index" layer. |
| Moiré | Two to six line or ring systems with rotation, offset, waves and a lens; each system is its own SVG layer. |
| Guilloché | Bands of phase-shifted closed rosettes r = R + A·env(θ)·sin(fθ + 2πk/n) that interlace into an engraved lattice. |
| Interference | Sum of circular waves from point sources (circle, line or seeded positions), fringes traced as contours. |
| Redraw | Structure tensor of a reference image → direction; its tone → spacing; streamline engine with the Python reference's seeding and self-avoidance. |
| Contour Portrait | Depth map (+ photo relief) → direction, photo → spacing, with fidelity, abstraction, detail preservation and edge sensitivity (spec §8). |
| Wave Portrait | Parallel lines whose wave amplitude and frequency grow with darkness (phase integrated along the line). |
| Adaptive Hatching | Up to four hatch directions, each added below a darker tone threshold, each on its own SVG layer. |
| Flow Hatching | Adaptive Hatching's tone bands drawn with Redraw's streamlines: each darker band adds a layer of evenly spaced lines along the image's forms, turned by a crossing angle (shallow 25° by default, diagonal or right angles), each on its own SVG layer. |
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
| 3D | `src/render3d/hidden.ts` | Hidden-line removal: the surface mesh is rasterised into a depth buffer in sheet mm; each line is tested along its length and cut where the surface is nearer, bridging sub-mm flicker gaps and dropping flecks where lines run edge-on. Camera: spin (Z), tilt (X), turn (Y), orthographic or perspective. |
| Geometry tools | `src/geometry/clip.ts`, `shape.ts` | Exact polyline clipping to the drawing area (Liang–Barsky), fit-to-area, rotation, Chaikin smoothing. |
| Engine | `src/engine/streamlines.ts` | Jobard–Lefer evenly spaced streamlines with variable separation, ported from `reference/js/streamlines.worker.js`. |
| Plotter | `src/plotter/` | Optimiser (dedupe, short-path removal, RDP within tolerance, nearest-neighbour ordering with reversal, optional joining of pen-up gaps under a set length), stats, ink density, plotter profiles. Time estimate = travel at full speed + pen-lift delays + acceleration losses (a full stop costs v / a; a corner keeping f of full speed costs v(1 − f)² / a), times a calibration factor set from a real plot. |
| Export | `src/export/` | Hand-written SVG (mm size + viewBox, Inkscape layers, stroke only) and validation that blocks bad exports. Multi-layer drawings can also export one SVG per layer (same page and coordinates, so pens register), singly or as a stored ZIP (`zip.ts`). Warns when many pen-up moves are under 0.5 mm. |
| Images | `src/image/` | PNG via fast-png at full bit depth (16-bit depth maps stay 16-bit), JPEG via the browser; one sampler for fit / scale / position (crop), brightness, contrast, invert and blur; built-in sample head. Images live in memory only. |
| Projects | `src/project/` | JSON project files (format `plot-lab-project`, version 1): algorithm, parameters, seed, paper, stroke, plotter, optimisation, clip, and reference images embedded as PNG (16-bit kept). Parsing validates and clamps everything. Presets and recent projects live in local storage (`src/store/library.ts`). Variations: seeded new seeds and/or mutation of creative parameters (composition, image, quality and pen-safety spacing stay fixed). |
| Plot Layers | `src/plotter/plotLayers.ts`, `src/geometry/mask.ts`, `src/import/svg.ts`, `src/export/axidraw.ts` | Splits every row by a hand-drawn polygon mask into numbered AxiDraw layers (see below). Runs in the pipeline in place of path ordering. |
| Clip | `src/geometry/clipShape.ts` | Circle / ellipse / rectangle, keep inside or outside; exact segment–shape intersections; optional outline layer. Runs in the pipeline before optimisation. |
| Worker | `src/worker/`, `src/pipeline.ts`, `src/store/generation.ts` | Generate → clip → safety check → stats → optimise → stats, off the main thread. Each change cancels the running worker. Algorithms with a draft mode (`src/algorithms/draft.ts`: lower field resolution or coarser sampling only) render a draft ~90 ms after a change and full quality after a 700 ms pause; export only accepts full quality. The last 12 full-quality results are cached by settings, so going back is instant. |
| UI | `src/app/`, `src/store/` | React + Zustand + Tailwind + Lucide. Settings persist to localStorage and are validated on load. |

## Plot Layers (mask split for AxiDraw)

Pausing an EasyDraw / AxiDraw mid-plot costs a few mm of registration, so instead of pausing, Plot Layers splits the
drawing by a mask into numbered layers that AxiDraw Control plots one at a time from its **Layers** tab: **1 object**
(inside the mask) and **2 background** (outside). Names and order are editable. Draw the mask on the canvas (click
for corners, drag for freehand, Enter or double-click to close) or import it from an SVG layer named `mask`. Any SVG
of polylines (e.g. an earlier Wave Portrait export) can also be imported as the drawing to split.

Per row, in this order:

1. **Cut** where the row crosses the mask edge.
2. **Snap** each cut to a flat point. A cut lands only where the line stays within `flatThresholdMm` of its row's
   baseline over 1 mm, searching up to `snapSearchMm` along the baseline. Moving outwards (into the background)
   counts once; moving inwards counts three times, so the wiggles stay whole in the object layer. If no flat point is
   in reach, the cut goes to the nearest wave peak or zero crossing and is **flagged** (red dot in the preview).
3. **Feathered** edge: each cut moves outwards by a seeded random amount up to `staggerMm`, only onto flat points.
4. **Merge** pieces shorter than `minSegmentMm` into the neighbouring layer.
5. **Seam gap** (`seamGapMm`, default 0 = butt joint): only the background side moves. Negative values overlap.
6. **Direction**: object pieces run left to right. A background piece that touches the mask ends at the mask edge,
   so the pen lifts off at the seam: left pieces run →, right pieces run ←. A background piece between two parts
   of the mask, or one that doesn't touch it, runs →.
7. **Simplify** (Ramer–Douglas–Peucker, `simplifyToleranceMm`).

Rows stay top to bottom and are never reordered: the normal optimiser's ordering and gap-joining are skipped.

- **Ink budget:** each layer's pen-down length is compared with `inkPerPumpMm × inkSafety`. A layer over budget is
  flagged. Optionally it is split into numbered parts, only between rows.
- **Priming:** each layer starts with `primeZigzags` zigzags and `primeDabs` 0.3 mm dabs, each layer in a fresh spot
  of the priming strip. By default the strip sits in the bottom margin. The strip has to be on the page, because
  AxiDraw doesn't plot outside the document. Validation lets only priming strokes leave the drawing area.
- **Export:** the plotting layers come first, labelled `1 object`, `2 background`, …; the mask follows on a `%mask`
  layer. The metadata comment holds the split settings, the mask and the seed. The export dialog also writes
  step-by-step plotting instructions, and the per-layer ZIP includes them as a text file.

AxiDraw layer-name rules, checked against the driver source (`LayerProperties.parse` / `find_int` in
evil-mad/axidraw `path_objects.py`) and ported in `src/export/axidraw.ts`:

- The Layers tab plots every layer whose name **starts with** the chosen integer, so `1a` and `1b` are both layer 1.
- A name whose first character is `%` is a documentation layer and never plots.
- A leading `!` forces a pause.

Export validation therefore blocks duplicate layer numbers and `!` names.

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
