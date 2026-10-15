/** Moiré — overlapping line or ring systems; the interference appears where they cross. One SVG layer per system. */
import type { Point } from "../geometry/types";
import { type Curve, num, sheetOf, str, toLayeredCollection } from "./common";
import { type GenerativeAlgorithm, type ParameterDefinition, resolveParams } from "./types";

const parameters: ParameterDefinition[] = [
  { id: "pattern", type: "select", group: "Structure", label: "Pattern", default: "rings",
    options: [{ value: "lines", label: "Parallel lines" }, { value: "rings", label: "Concentric rings" }, { value: "mixed", label: "Lines and rings" }],
    description: "What each layer is made of. Mixed alternates lines and rings." },
  { id: "layerCount", type: "number", group: "Structure", label: "Layer count", default: 2, min: 2, max: 6, step: 1,
    description: "Overlapping systems. Each is its own SVG layer, so it can be plotted with its own pen." },
  { id: "lineSpacing", type: "number", group: "Density", label: "Line spacing", default: 2.2, min: 0.4, max: 12, step: 0.05, unit: "mm",
    description: "Distance between lines (or rings) within a layer.", role: "minSpacing" },
  { id: "rotation", type: "number", group: "Geometry", label: "Rotation", default: 4, min: 0, max: 60, step: 0.1, unit: "°",
    description: "Rotation of each layer relative to the previous one. Small angles give large moiré bands." },
  { id: "angle", type: "number", group: "Geometry", label: "Base angle", default: 0, min: 0, max: 179, step: 1, unit: "°", description: "Angle of the first layer." },
  { id: "offset", type: "number", group: "Composition", label: "Offset", default: 10, min: 0, max: 80, step: 0.5, unit: "mm",
    description: "Shift between layers (moves ring centres apart)." },
  { id: "distortion", type: "number", group: "Distortion", label: "Distortion", default: 0, min: 0, max: 20, step: 0.1, unit: "mm",
    description: "Amplitude of the wave applied to each line or ring." },
  { id: "frequency", type: "number", group: "Distortion", label: "Frequency", default: 2, min: 0, max: 30, step: 1,
    description: "Waves along each line, or lobes around each ring.", visibleWhen: (v) => (v.distortion as number) > 0 },
  { id: "phase", type: "number", group: "Distortion", label: "Phase", default: 0, min: 0, max: 359, step: 1, unit: "°", description: "Shifts the waves; each layer is shifted further.", visibleWhen: (v) => (v.distortion as number) > 0 },
  { id: "lens", type: "number", group: "Distortion", label: "Lens", default: 0, min: -0.8, max: 0.8, step: 0.01,
    description: "Bulges (positive) or pinches (negative) every layer around the centre." },
  { id: "lensSize", type: "number", group: "Distortion", label: "Lens size", default: 55, min: 5, max: 300, step: 1, unit: "mm",
    description: "Radius of the lens.", visibleWhen: (v) => v.lens !== 0 },
  { id: "step", type: "number", group: "Advanced", label: "Sample step", default: 0.6, min: 0.1, max: 5, step: 0.05, unit: "mm", description: "Distance between points along lines." },
];

export const moire: GenerativeAlgorithm = {
  id: "moire",
  name: "Moiré",
  category: "Patterns",
  description: "Overlapping line and ring systems that interfere into large optical bands.",
  parameters,
  usesSeed: () => false,
  async generate({ params, paper }) {
    const v = resolveParams(moire, params), sheet = sheetOf(paper), a = sheet.area;
    const cx = a.x + a.width / 2, cy = a.y + a.height / 2, n = num(v, "layerCount"), gap = num(v, "lineSpacing"), step = num(v, "step");
    const dist = num(v, "distortion"), freq = num(v, "frequency"), ph0 = (num(v, "phase") * Math.PI) / 180;
    const lens = num(v, "lens"), ls = num(v, "lensSize");
    const diag = Math.hypot(a.width, a.height), off = num(v, "offset");
    const warp = (p: Point): Point => {
      if (!lens) return p;
      const dx = p.x - cx, dy = p.y - cy, k = 1 + lens * Math.exp(-(dx * dx + dy * dy) / (2 * ls * ls));
      return { x: cx + dx * k, y: cy + dy * k };
    };
    const layers = Array.from({ length: n }, (_, i) => {
      const th = ((num(v, "angle") + i * num(v, "rotation")) * Math.PI) / 180, ux = Math.cos(th), uy = Math.sin(th), nx = -uy, ny = ux;
      const ph = ph0 + (i * Math.PI) / 2, shift = (i - (n - 1) / 2) * off, curves: Curve[] = [];
      const kind = str(v, "pattern") === "mixed" ? (i % 2 ? "rings" : "lines") : str(v, "pattern");
      if (kind === "lines") {
        const L = diag + 2 * dist + 10, count = Math.ceil((diag + Math.abs(shift) * 2) / gap), k = (2 * Math.PI * freq) / L;
        for (let j = -count / 2; j <= count / 2; j++) {
          const o = j * gap + shift, pts: Point[] = [];
          for (let u = -L / 2; u <= L / 2; u += step) {
            const d = dist * Math.sin(k * u + ph);
            pts.push(warp({ x: cx + ux * u + nx * (o + d), y: cy + uy * u + ny * (o + d) }));
          }
          curves.push({ points: pts, closed: false });
        }
      } else {
        const ox = cx + ux * shift, oy = cy + uy * shift, maxR = diag / 2 + Math.abs(shift) + dist;
        for (let r = gap; r <= maxR; r += gap) {
          const m = Math.max(16, Math.ceil((2 * Math.PI * r) / step)), pts: Point[] = [];
          for (let s = 0; s < m; s++) {
            const t = (s / m) * 2 * Math.PI, rr = r + dist * Math.sin(Math.round(freq) * t + ph);
            pts.push(warp({ x: ox + rr * Math.cos(t + th), y: oy + rr * Math.sin(t + th) }));
          }
          curves.push({ points: pts, closed: true });
        }
      }
      return { id: `layer${i + 1}`, name: `${kind} ${i + 1}`, curves };
    });
    return toLayeredCollection(sheet, layers);
  },
};
