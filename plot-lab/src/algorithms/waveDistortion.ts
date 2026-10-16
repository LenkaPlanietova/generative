/** Wave Distortion — parallel lines displaced by layered sine waves and noise, clipped to the drawing area. */
import { perlin2 } from "../fields/noise";
import type { Point } from "../geometry/types";
import { type Curve, num, sheetOf, str, toCollection } from "./common";
import { type GenerativeAlgorithm, type ParameterDefinition, resolveParams } from "./types";

const parameters: ParameterDefinition[] = [
  { id: "spacingMode", type: "select", group: "Structure", label: "Lines by", default: "count",
    options: [{ value: "count", label: "Line count" }, { value: "spacing", label: "Line spacing" }],
    description: "Set the number of lines, or the distance between them." },
  { id: "lineCount", type: "number", group: "Structure", label: "Line count", default: 120, min: 2, max: 600, step: 1,
    description: "Number of parallel lines across the drawing area.", visibleWhen: (v) => v.spacingMode === "count" },
  { id: "lineSpacing", type: "number", group: "Structure", label: "Line spacing", default: 2, min: 0.3, max: 30, step: 0.1, unit: "mm",
    description: "Distance between neighbouring lines.", visibleWhen: (v) => v.spacingMode === "spacing" },
  { id: "orientation", type: "number", group: "Structure", label: "Orientation", default: 0, min: 0, max: 179, step: 1, unit: "°",
    description: "0° = horizontal waves, 90° = vertical." },
  { id: "amplitude", type: "number", group: "Distortion", label: "Amplitude", default: 14, min: 0, max: 60, step: 0.1, unit: "mm",
    description: "Height of the main wave." },
  { id: "frequency", type: "number", group: "Distortion", label: "Frequency", default: 1.5, min: 0, max: 40, step: 0.1,
    description: "Main waves along the line, across the drawing area." },
  { id: "phase", type: "number", group: "Distortion", label: "Phase", default: 0, min: 0, max: 359, step: 1, unit: "°", description: "Shifts the main wave along the lines." },
  { id: "drift", type: "number", group: "Distortion", label: "Distortion (phase drift)", default: 6, min: 0, max: 45, step: 0.1, unit: "°/line",
    description: "Phase shift from one line to the next, so the waves travel diagonally across the lines." },
  { id: "amplitude2", type: "number", group: "Distortion", label: "Second wave amplitude", default: 1.2, min: 0, max: 30, step: 0.1, unit: "mm",
    description: "Multi-frequency: height of a second, finer wave." },
  { id: "frequency2", type: "number", group: "Distortion", label: "Second wave frequency", default: 9, min: 0, max: 80, step: 0.1,
    description: "Second-wave frequency across the drawing area." },
  { id: "noiseStrength", type: "number", group: "Noise", label: "Noise strength", default: 2, min: 0, max: 40, step: 0.1, unit: "mm",
    description: "Seeded noise displacement." },
  { id: "noiseScale", type: "number", group: "Noise", label: "Noise scale", default: 45, min: 2, max: 400, step: 1, unit: "mm", description: "Size of the noise features." },
  { id: "envelope", type: "select", group: "Composition", label: "Amplitude envelope", default: "radial",
    options: [{ value: "uniform", label: "Uniform" }, { value: "radial", label: "Radial (swell in the centre)" }, { value: "edges", label: "Calm centre, wild edges" }],
    description: "Where the distortion is strongest." },
  { id: "envelopeSize", type: "number", group: "Composition", label: "Envelope size", default: 55, min: 5, max: 400, step: 1, unit: "mm",
    description: "Radius of the envelope.", visibleWhen: (v) => v.envelope !== "uniform" },
  { id: "step", type: "number", group: "Advanced", label: "Sample step", default: 0.5, min: 0.1, max: 5, step: 0.05, unit: "mm", description: "Distance between points along each line." },
];

export const waveDistortion: GenerativeAlgorithm = {
  id: "wave",
  name: "Wave Distortion",
  category: "Patterns",
  description: "Parallel lines bent by layered sine waves and noise.",
  parameters,
  usesSeed: (v) => (v.noiseStrength as number) > 0,
  seedHint: "Turn up Noise strength to use it.",
  async generate({ params, seed, paper }) {
    const v = resolveParams(waveDistortion, params), sheet = sheetOf(paper), a = sheet.area;
    const th = (num(v, "orientation") * Math.PI) / 180, ux = Math.cos(th), uy = Math.sin(th), nx = -uy, ny = ux;
    const cx = a.x + a.width / 2, cy = a.y + a.height / 2;
    const along = Math.abs(a.width * ux) + Math.abs(a.height * uy), across = Math.abs(a.width * nx) + Math.abs(a.height * ny);
    const L = along + 2 * (num(v, "amplitude") + num(v, "amplitude2") + num(v, "noiseStrength")) + 10; // overscan, clipped later
    const count = str(v, "spacingMode") === "count" ? num(v, "lineCount") : Math.max(1, Math.floor(across / num(v, "lineSpacing")) + 1);
    const gap = str(v, "spacingMode") === "count" ? across / count : num(v, "lineSpacing");
    const k1 = (2 * Math.PI * num(v, "frequency")) / along, k2 = (2 * Math.PI * num(v, "frequency2")) / along;
    const A1 = num(v, "amplitude"), A2 = num(v, "amplitude2"), NS = num(v, "noiseStrength"), nsc = num(v, "noiseScale");
    const ph = (num(v, "phase") * Math.PI) / 180, drift = (num(v, "drift") * Math.PI) / 180, env = str(v, "envelope"), es = num(v, "envelopeSize");
    const noise = perlin2(seed * 3 + 11), step = num(v, "step"), n = Math.ceil(L / step);
    const curves: Curve[] = [];
    for (let i = 0; i < count; i++) {
      const off = (i - (count - 1) / 2) * gap, pts: Point[] = [];
      for (let s = 0; s <= n; s++) {
        const u = -L / 2 + s * step, bx = cx + ux * u + nx * off, by = cy + uy * u + ny * off;
        const r = Math.hypot(bx - cx, by - cy), g = Math.exp(-(r * r) / (2 * es * es));
        const e = env === "radial" ? g : env === "edges" ? 1 - g : 1;
        const d = e * (A1 * Math.sin(k1 * u + ph + i * drift) + A2 * Math.sin(k2 * u + ph * 2 + i * drift * 1.7)) + NS * noise(bx / nsc, by / nsc);
        pts.push({ x: bx + nx * d, y: by + ny * d });
      }
      curves.push({ points: pts, closed: false });
    }
    return toCollection(sheet, curves);
  },
};
