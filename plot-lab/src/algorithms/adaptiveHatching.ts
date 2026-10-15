/** Adaptive Hatching — cross-hatching that adds a direction for each darker tone band; each direction is a pen layer. */
import type { Point } from "../geometry/types";
import { sampleImages } from "../image/sample";
import { IMAGE_PARAMS, adjustFrom } from "../image/params";
import { lumaSampler } from "../image/sampler";
import { type Curve, num, sheetOf, toLayeredCollection } from "./common";
import { type GenerativeAlgorithm, type ParameterDefinition, resolveParams } from "./types";

const ANGLE_STEPS = [0, 90, 45, -45];

const parameters: ParameterDefinition[] = [
  ...IMAGE_PARAMS,
  { id: "layers", type: "number", group: "Structure", label: "Hatch layers", default: 3, min: 1, max: 4, step: 1,
    description: "Directions of hatching. Each darker tone band adds the next direction (0°, 90°, 45°, −45° from the base angle)." },
  { id: "angle", type: "number", group: "Structure", label: "Base angle", default: 45, min: 0, max: 179, step: 1, unit: "°", description: "Direction of the first hatch layer." },
  { id: "spacing", type: "number", group: "Density", label: "Hatch spacing", default: 1.1, min: 0.3, max: 10, step: 0.05, unit: "mm", role: "minSpacing", description: "Distance between hatch lines." },
  { id: "threshold1", type: "number", group: "Density", label: "Layer 1 below tone", default: 0.82, min: 0, max: 1, step: 0.01, description: "Layer 1 hatches where the image is darker than this." },
  { id: "threshold2", type: "number", group: "Density", label: "Layer 2 below tone", default: 0.58, min: 0, max: 1, step: 0.01,
    description: "Layer 2 adds its direction where darker than this.", visibleWhen: (v) => (v.layers as number) >= 2 },
  { id: "threshold3", type: "number", group: "Density", label: "Layer 3 below tone", default: 0.36, min: 0, max: 1, step: 0.01,
    description: "Layer 3 adds its direction where darker than this.", visibleWhen: (v) => (v.layers as number) >= 3 },
  { id: "threshold4", type: "number", group: "Density", label: "Layer 4 below tone", default: 0.18, min: 0, max: 1, step: 0.01,
    description: "Layer 4 adds its direction where darker than this.", visibleWhen: (v) => (v.layers as number) >= 4 },
  { id: "minSegment", type: "number", group: "Structure", label: "Min stroke length", default: 1.5, min: 0, max: 20, step: 0.1, unit: "mm", description: "Shorter strokes are dropped." },
  { id: "bridge", type: "number", group: "Structure", label: "Bridge gaps under", default: 0.8, min: 0, max: 10, step: 0.1, unit: "mm",
    description: "Joins strokes separated by a smaller gap, to save pen lifts." },
  { id: "toneBlur", type: "number", group: "Advanced", label: "Tone smoothing", default: 0.6, min: 0, max: 10, step: 0.05, unit: "mm", description: "Softens the tone bands' edges." },
  { id: "step", type: "number", group: "Advanced", label: "Sample step", default: 0.25, min: 0.05, max: 2, step: 0.05, unit: "mm", description: "Distance between tone samples along a line." },
];

export const adaptiveHatching: GenerativeAlgorithm = {
  id: "hatching",
  name: "Adaptive Hatching",
  category: "Image-driven",
  description: "Engraving-style cross-hatching: each darker tone band adds a direction, each direction a pen layer.",
  parameters,
  inputs: { photo: true },
  usesSeed: () => false,
  async generate({ params, paper, images }) {
    const v = resolveParams(adaptiveHatching, params), sheet = sheetOf(paper), a = sheet.area;
    const L = lumaSampler(images?.photo ?? sampleImages().photo, a, { ...adjustFrom(v), blur: (v.imageBlur as number) + num(v, "toneBlur") }, 0.25);
    const cx = a.x + a.width / 2, cy = a.y + a.height / 2, diag = Math.hypot(a.width, a.height);
    const gap = num(v, "spacing"), step = num(v, "step"), minSeg = num(v, "minSegment"), bridge = num(v, "bridge");
    const layers = Array.from({ length: num(v, "layers") }, (_, i) => {
      const th = ((num(v, "angle") + ANGLE_STEPS[i]) * Math.PI) / 180, ux = Math.cos(th), uy = Math.sin(th), nx = -uy, ny = ux;
      const limit = num(v, `threshold${i + 1}`), curves: Curve[] = [];
      for (let o = -diag / 2 + (i % 2) * gap * 0.5; o <= diag / 2; o += gap) {
        let run: Point[] = [], gapLen = 0;
        const flush = () => {
          if (run.length > 1 && Math.hypot(run[run.length - 1].x - run[0].x, run[run.length - 1].y - run[0].y) >= minSeg)
            curves.push({ points: [run[0], run[run.length - 1]], closed: false });
          run = [];
        };
        for (let u = -diag / 2; u <= diag / 2; u += step) {
          const p = { x: cx + ux * u + nx * o, y: cy + uy * u + ny * o };
          if (L(p.x, p.y) < limit) { run.push(p); gapLen = 0; }
          else if (run.length) { gapLen += step; if (gapLen > bridge) flush(); }
        }
        flush();
      }
      return { id: `hatch${i + 1}`, name: `hatch ${i + 1} (${Math.round(num(v, "angle") + ANGLE_STEPS[i])}°)`, curves };
    });
    return toLayeredCollection(sheet, layers);
  },
};
