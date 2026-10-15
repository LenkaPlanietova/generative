# Plot Lab

Pen-plotter art workbench. Geometry is plain TypeScript vector data (no p5, no raster step). The preview uses
Canvas 2D at real pen width, and the export is hand-written mm-unit SVG.

**Status: Phase 1 (Flow Field)** on an evenly spaced streamline engine (Jobard–Lefer, variable separation),
ported from `reference/js/streamlines.worker.js`. See `SPEC_ADDENDUM.md` and `reference/README.md`.

```bash
npm install
npm run dev        # app
npm test           # engine tests + exact parity with the reference worker
npm run build
```

## Layout

| Path | What |
|---|---|
| `src/core/fields.ts` | `DirectionField` (double-angle `c`,`s`), `ScalarField`, `Grid` (the single mm → px conversion) |
| `src/fields/` | Field sources: seeded noise, structure tensor (detail + swirl, offset, wobble), constant, radial gradient |
| `src/engine/streamlines.ts` | The streamline engine. Takes any `DirectionField` + tone `ScalarField`, all params in mm/° |
| `src/engine/simplify.ts`, `order.ts` | RDP, greedy nearest-neighbour ordering with reversal, plot stats |
| `src/algorithms/flowField.ts` | Phase 1: noise direction + constant/radial density → engine → mm paths, before/after stats |
| `src/worker/` | Web Worker: streams batches ~every 140 ms; the UI restarts it on each change (350 ms debounce) |
| `src/render/` | Canvas preview (real pen width at physical scale) and SVG export |
| `test/parity.test.ts` | Runs the reference worker in a `vm` sandbox and checks the TS port gives identical fields, lines, RDP and order |

Also in place from the addendum: A5 / Square paper presets (§G), pen-width ↔ spacing warning (§F), and
ink / pen-up / time before and after optimisation (§H). Not yet done: clip to shape (§E) and image field sources (Phase 4).
