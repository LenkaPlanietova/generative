/** Interference — circular waves from point sources add up; the fringes are traced as contour lines. */
import { blur } from "../core/blur";
import { rng } from "../core/rng";
import { gridOver, num, sheetOf, str, toCollection, traceLevels } from "./common";
import { type GenerativeAlgorithm, type ParameterDefinition, resolveParams } from "./types";

const parameters: ParameterDefinition[] = [
  { id: "sources", type: "number", group: "Structure", label: "Sources", default: 2, min: 1, max: 10, step: 1, description: "Number of wave sources." },
  { id: "arrangement", type: "select", group: "Composition", label: "Arrangement", default: "line",
    options: [{ value: "circle", label: "On a circle" }, { value: "line", label: "In a line" }, { value: "random", label: "Random (seeded)" }],
    description: "Where the sources sit." },
  { id: "spread", type: "number", group: "Composition", label: "Source spread", default: 30, min: 0, max: 300, step: 1, unit: "mm",
    description: "Distance of the sources from the middle." },
  { id: "wavelength", type: "number", group: "Geometry", label: "Wavelength", default: 8, min: 1, max: 80, step: 0.1, unit: "mm", description: "Distance between wave crests." },
  { id: "phaseStep", type: "number", group: "Geometry", label: "Phase step", default: 0, min: 0, max: 359, step: 1, unit: "°", description: "Phase difference between successive sources." },
  { id: "attenuation", type: "number", group: "Distortion", label: "Attenuation", default: 0.4, min: 0, max: 3, step: 0.01,
    description: "How fast each wave fades with distance (per 100 mm)." },
  { id: "contourCount", type: "number", group: "Structure", label: "Fringe lines", default: 1, min: 1, max: 12, step: 1,
    description: "Contour levels per fringe — more gives thicker, engraved bands." },
  { id: "band", type: "number", group: "Density", label: "Band width", default: 0.35, min: 0.02, max: 0.95, step: 0.01,
    description: "Spread of the levels around the zero crossing, as a share of the field's range.", visibleWhen: (v) => (v.contourCount as number) > 1 },
  { id: "smoothing", type: "number", group: "Advanced", label: "Curve smoothing", default: 1, min: 0, max: 3, step: 1, description: "Chaikin smoothing passes." },
  { id: "resolution", type: "number", group: "Advanced", label: "Field resolution", default: 520, min: 100, max: 1200, step: 10, unit: "px",
    description: "Grid cells along the long side. Keep several cells per wavelength." },
];

export const interference: GenerativeAlgorithm = {
  id: "interference",
  name: "Interference",
  category: "Patterns",
  description: "Fringes of overlapping circular waves from several sources, traced as contours.",
  parameters,
  usesSeed: (v) => v.arrangement === "random",
  seedHint: "Choose the Random arrangement to use it.",
  async generate({ params, seed, paper }) {
    const v = resolveParams(interference, params), sheet = sheetOf(paper), a = sheet.area;
    const n = num(v, "sources"), spread = num(v, "spread"), R = rng(seed), cx = a.width / 2, cy = a.height / 2;
    const srcs = Array.from({ length: n }, (_, i) => {
      const arr = str(v, "arrangement");
      if (arr === "line") return { x: cx + (n === 1 ? 0 : (i / (n - 1) - 0.5) * 2 * spread), y: cy };
      if (arr === "random") return { x: cx + (R() * 2 - 1) * spread, y: cy + (R() * 2 - 1) * spread };
      const t = (i / n) * 2 * Math.PI - Math.PI / 2;
      return { x: cx + spread * Math.cos(t), y: cy + spread * Math.sin(t) };
    });
    const { W, H, sx, sy } = gridOver(a, num(v, "resolution")), k = (2 * Math.PI) / num(v, "wavelength");
    const att = num(v, "attenuation") / 100, dph = (num(v, "phaseStep") * Math.PI) / 180, data = new Float32Array(W * H);
    let m = 0;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      let s = 0;
      srcs.forEach((p, q) => { const d = Math.hypot(i * sx - p.x, j * sy - p.y); s += Math.exp(-att * d) * Math.sin(k * d + q * dph); });
      data[j * W + i] = s;
      m = Math.max(m, Math.abs(s));
    }
    const field = blur(data, W, H, 0.6), c = num(v, "contourCount"), band = num(v, "band") * m;
    const levels = Array.from({ length: c }, (_, q) => (c === 1 ? 0 : -band + (2 * band * q) / (c - 1)));
    return toCollection(sheet, traceLevels(field, W, H, levels, a, num(v, "smoothing")).flat());
  },
};
