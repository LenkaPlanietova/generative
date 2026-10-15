# PLOT LAB — reference implementation

Working, tested prototypes of the streamline technique behind the "redraw dense" portrait.
Use them as **reference for porting into the PLOT LAB TypeScript codebase**, not as code to ship as-is.

The goal for Claude Code: reproduce `examples/redraw_dense_A3.svg` from
`examples/source_lineart.png` inside PLOT LAB, with every setting below exposed as a parameter.

## What's here

| Path | What it is | Status |
|---|---|---|
| `js/streamlines.worker.js` | The whole engine as one plain-JS Web Worker: fields → streamlines → simplify → order | Runs in the demo; closest to the TS port |
| `demo/flowline-studio.html` | Single-file app using that worker: sliders, live preview, A5–A2 paper, SVG export | Open in a browser to see the behaviour |
| `python/flow_lines.py` | Same tracer in Python (`Tracer` class) + photo/depth-map portrait pipeline | Tested |
| `python/redraw_from_lineart.py` | CLI that produced the favourite piece | Tested: reproduces 1,058 lines / 32.5 m ink |
| `python/depth_map_colab.ipynb` | Photo → 16-bit depth map with Depth Anything V2 (Colab, GPU) | Tested |
| `examples/` | Source image, the favourite SVG, and its preview | — |

Run the Python version:
```
pip install opencv-python numpy
python python/redraw_from_lineart.py examples/source_lineart.png out.svg
```

## How the technique works

1. **Direction field (structure tensor).** Blur the source, take the x/y gradients,
   and build the tensor `Jxx = gx², Jyy = gy², Jxy = gx·gy`, each blurred again.
   Blend two scales: `detail` (local features: eyelids, lips) + `swirl × swirlWeight` (overall form).
   Store the orientation in **double-angle form** `(c, s) = (−(Jxx−Jyy), −2Jxy)`.
   The minus signs rotate it 90°, so lines run *along* contours instead of across them.
   Double-angle form is sign-free: orientations at 0° and 180° are the same, so blurring and
   interpolating never cancel out. Recover the angle with `θ = ½·atan2(s, c)`, and flip
   the step direction when it points against the previous step.
   - Source can be: a line drawing (redraw mode), a **depth map** (contour-wrap portraits),
     photo brightness, or noise. A depth map plus a little photo "relief" gives the best faces.
2. **Tone field.** Blurred brightness, contrast-stretched to 0..1. Separation between lines
   is `dMin + (dMax − dMin) · tone^gamma`. Dark areas get dense lines.
3. **Evenly spaced streamlines (Jobard–Lefer 1997, with variable separation).**
   - Integrate with RK2 (midpoint) at `step ≈ 0.35 × dMin`.
   - Stop a line when it: leaves the area; enters tone > `whiteCut`; comes closer than
     `sep × clearance` to an existing line (spatial hash grid, cell = dMax); hits its own
     older points (self-collision, skipping the most recent ~2.5·dMax of its own points);
     or turns sharper than `maxTurn` in one step (that's a singularity, such as a swirl centre).
   - Trace both directions from each seed. Discard lines shorter than `minLen`.
   - **Seeding:** each accepted line pushes candidate seeds at ±sep along its normal
     (queue, FIFO). When the queue is empty, fall back to a jittered grid of candidates,
     sorted darkest-first, so every region gets lines.
4. **Simplify** with RDP at ~0.05–0.08 mm (well below pen width).
5. **Order** greedy nearest-neighbour with reversal. On the favourite piece this cut pen-up travel
   from ~50 m to ~4 m (35 → 25 min plot time at 30 mm/s).

## Settings of the favourite piece ("redraw dense", A3)

| Param | Value | Notes |
|---|---|---|
| Paper / margin | A3 portrait / 20 mm | |
| Darkest spacing `dMin` | **0.35 mm** | Must stay above pen width or areas plot solid black |
| Lightest spacing `dMax` | **1.3 mm** | |
| Gamma | **0.5** | Below 1 pushes more lines into the mid-tones |
| White cut | **0.985** | Leaves only true highlights empty |
| Clearance | **0.55** | |
| Min line length | 3 mm | |
| Max turn per step | 40° | |
| Detail / swirl / swirl weight | 3 px / 12 px / 0.5 | In source pixels, ×2 working upscale |
| Pen | 0.1–0.2 mm fineliner on smooth paper | 0.3+ mm fills in the face |
| Result | 1,058 lines · 32.5 m ink · 4 m pen-up · ~25 min | |

"Light" variant: `dMin 0.45, dMax 2.2, gamma 0.45`.

## Lessons learned (please keep these)

- **Bitmap tracing fails** on this kind of art. Thresholding + skeletonising merges neighbouring hairlines
  into blobs and turns soft shading into scribbles. Generating new lines from a field is what works.
- **Parameters must be in millimetres** and converted to grid pixels in one place (`mmPerPx`),
  otherwise spacing changes with paper size and preview resolution.
- **Depth maps must be read as 16-bit.** 8-bit depth creates visible stair-step bands in the lines.
  Browsers' `<img>`/canvas decode PNGs to 8-bit, so use a PNG decoder (the demo uses UPNG.js).
- Use **one seeded PRNG** (the demo uses xorshift32) for seed jitter and noise. No `Math.random()` in algorithms.
- Stream partial results from the worker every ~150 ms for a live preview, and terminate and restart the worker
  on every parameter change (debounced ~350 ms).
- Performance: the JS worker does an A3 portrait at an 800 px grid in a few seconds. The spatial hash grid
  is essential; a naïve neighbour search is O(n²) and unusable.
