/** Radial Geometry — concentric rings or a spiral in polar coordinates, with radial waves, twist and noise. */
import { perlin2 } from "../fields/noise";
import type { Point } from "../geometry/types";
import { type Curve, num, sheetOf, str, toCollection } from "./common";
import { type GenerativeAlgorithm, type ParameterDefinition, resolveParams } from "./types";

const spiral = (v: Record<string, unknown>) => v.mode === "spiral";

const parameters: ParameterDefinition[] = [
  { id: "mode", type: "select", group: "Structure", label: "Form", default: "rings",
    options: [{ value: "rings", label: "Concentric rings" }, { value: "spiral", label: "Spiral" }],
    description: "Separate closed rings, or one continuous spiral." },
  { id: "ringCount", type: "number", group: "Structure", label: "Ring count", default: 50, min: 1, max: 400, step: 1,
    description: "Number of rings.", visibleWhen: (v) => !spiral(v) },
  { id: "turns", type: "number", group: "Structure", label: "Spiral turns", default: 64, min: 1, max: 400, step: 1,
    description: "Number of turns of the spiral.", visibleWhen: spiral },
  { id: "radius", type: "number", group: "Geometry", label: "Radius", default: 80, min: 5, max: 600, step: 1, unit: "mm", description: "Outer radius." },
  { id: "innerRadius", type: "number", group: "Geometry", label: "Inner radius", default: 12, min: 0, max: 300, step: 0.5, unit: "mm", description: "Radius of the innermost ring." },
  { id: "radialAmp", type: "number", group: "Distortion", label: "Radial amplitude", default: 3.5, min: 0, max: 40, step: 0.1, unit: "mm",
    description: "Depth of the radial sine wave (petals)." },
  { id: "angularFreq", type: "number", group: "Distortion", label: "Angular frequency", default: 7, min: 0, max: 60, step: 1,
    description: "Petals around each ring." },
  { id: "twist", type: "number", group: "Distortion", label: "Angular distortion", default: 2.5, min: 0, max: 30, step: 0.1, unit: "°/ring",
    description: "Rotates the petals a little more on each ring, so they twist outwards." },
  { id: "growth", type: "number", group: "Distortion", label: "Amplitude growth", default: 1, min: 0, max: 3, step: 0.05,
    description: "How the petal depth grows outwards: 0 = constant, 1 = proportional to radius." },
  { id: "noise", type: "number", group: "Noise", label: "Noise", default: 1.5, min: 0, max: 30, step: 0.1, unit: "mm", description: "Seeded radial noise." },
  { id: "noiseScale", type: "number", group: "Noise", label: "Noise features", default: 3, min: 0.5, max: 20, step: 0.1,
    description: "Noise bumps per symmetry sector." },
  { id: "symmetry", type: "number", group: "Noise", label: "Symmetry", default: 6, min: 1, max: 24, step: 1,
    description: "The noise repeats this many times around the centre." },
  { id: "centres", type: "number", group: "Composition", label: "Centres", default: 1, min: 1, max: 6, step: 1,
    description: "Number of ring systems (multi-centre geometry); they overlap into interference patterns." },
  { id: "centreSpread", type: "number", group: "Composition", label: "Centre spread", default: 30, min: 0, max: 300, step: 1, unit: "mm",
    description: "Distance of the centres from the middle.", visibleWhen: (v) => (v.centres as number) > 1 },
  { id: "centreX", type: "number", group: "Composition", label: "Centre X", default: 0, min: -300, max: 300, step: 1, unit: "mm", description: "Horizontal centre offset." },
  { id: "centreY", type: "number", group: "Composition", label: "Centre Y", default: 0, min: -300, max: 300, step: 1, unit: "mm", description: "Vertical centre offset." },
  { id: "segment", type: "number", group: "Advanced", label: "Segment length", default: 0.6, min: 0.1, max: 5, step: 0.05, unit: "mm", description: "Distance between points along a ring." },
];

export const radialGeometry: GenerativeAlgorithm = {
  id: "radial",
  name: "Radial Geometry",
  category: "Geometry",
  description: "Concentric rings and spirals in polar coordinates, with petals, twist and symmetry.",
  parameters,
  usesSeed: (v) => (v.noise as number) > 0,
  async generate({ params, seed, paper }) {
    const v = resolveParams(radialGeometry, params), sheet = sheetOf(paper), a = sheet.area;
    const R = num(v, "radius"), r0 = Math.min(num(v, "innerRadius"), R), amp = num(v, "radialAmp"), freq = num(v, "angularFreq");
    const twist = (num(v, "twist") * Math.PI) / 180, grow = num(v, "growth"), N = num(v, "noise"), sym = num(v, "symmetry"), nf = num(v, "noiseScale");
    const noise = perlin2(seed * 5 + 3), seg = num(v, "segment"), isSpiral = str(v, "mode") === "spiral";
    const radiusAt = (r: number, th: number, ring: number) => {
      const g = R > 0 ? (r / R) ** grow : 1;
      // Noise sampled on a circle in "symmetry space", so it repeats `sym` times around and varies with radius.
      const ts = th * sym, k = nf / (2 * Math.PI) * 2;
      return r + amp * g * Math.sin(freq * th + ring * twist) + N * noise(Math.cos(ts) * k + r * 0.02, Math.sin(ts) * k);
    };
    const nC = num(v, "centres"), spread = nC > 1 ? num(v, "centreSpread") : 0, curves: Curve[] = [];
    for (let c = 0; c < nC; c++) {
      const ang = (c / nC) * 2 * Math.PI - Math.PI / 2;
      const ox = a.x + a.width / 2 + num(v, "centreX") + spread * Math.cos(ang), oy = a.y + a.height / 2 + num(v, "centreY") + spread * Math.sin(ang);
      const pt = (rr: number, th: number): Point => ({ x: ox + rr * Math.cos(th), y: oy + rr * Math.sin(th) });
      if (isSpiral) {
        const turns = num(v, "turns"), pts: Point[] = [];
        let th = 0;
        const end = turns * 2 * Math.PI;
        while (th <= end) {
          const r = r0 + ((R - r0) * th) / end;
          pts.push(pt(radiusAt(r, th, th / (2 * Math.PI)), th));
          th += seg / Math.max(seg, r); // constant arc length
        }
        curves.push({ points: pts, closed: false });
      } else {
        const n = num(v, "ringCount");
        for (let i = 0; i < n; i++) {
          const r = n === 1 ? R : r0 + ((R - r0) * i) / (n - 1);
          const m = Math.max(12, Math.ceil((2 * Math.PI * Math.max(r, 1)) / seg)), pts: Point[] = [];
          for (let s = 0; s < m; s++) { const th = (s / m) * 2 * Math.PI; pts.push(pt(Math.max(0, radiusAt(r, th, i)), th)); }
          curves.push({ points: pts, closed: true });
        }
      }
    }
    return toCollection(sheet, curves);
  },
};
