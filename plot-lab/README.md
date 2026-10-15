# Plot Lab

Generative art and pen-plotter studio. Algorithms generate real vector geometry in millimetres; the preview,
SVG exporter, plotter optimiser and statistics all consume the same geometry.

**Status: Phase 1** (functional MVP): app layout, geometry system, Flow Field, live parameters, seeds,
paper sizes, canvas preview, validated SVG export, tests.

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
| Algorithms | `src/algorithms/` | Plugin interface `GenerativeAlgorithm` + `ParameterDefinition`. The UI builds controls from the definitions. Register new algorithms in `registry.ts`. |
| Fields | `src/core/fields.ts`, `src/fields/` | `DirectionField` (double-angle) and `ScalarField` sources: noise, structure tensor, constant, radial. |
| Engine | `src/engine/streamlines.ts` | Jobard–Lefer evenly spaced streamlines with variable separation, ported from `reference/js/streamlines.worker.js`. |
| Plotter | `src/plotter/` | Optimiser (dedupe, short-path removal, RDP within tolerance, nearest-neighbour ordering with reversal), stats, ink density, plotter profiles. |
| Export | `src/export/` | Hand-written SVG (mm size + viewBox, Inkscape layers, stroke only) and validation that blocks bad exports. |
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
- **Plotter profile "MakerQ EasyDraw V4"** ships with editable starting values only, not claimed machine specs.
- Flow Field parameters follow SPEC_ADDENDUM §C (streamline engine), mapped onto the spec's control groups:
  seed distribution, line count limit, step size, curvature (max turn), flow direction, noise scale, min spacing
  and randomness (wobble).

Reference material for porting: `reference/` (see `reference/README.md`) and `SPEC_ADDENDUM.md`.
