/** Image Displacement — parallel lines pushed sideways by the image's brightness, so the picture appears as relief. */
import { perlin2 } from "../fields/noise";
import type { Point } from "../geometry/types";
import { sampleImages } from "../image/sample";
import { IMAGE_PARAMS, adjustFrom } from "../image/params";
import { lumaSampler } from "../image/sampler";
import { type Curve, num, sheetOf, str, toCollection } from "./common";
import { type GenerativeAlgorithm, type ParameterDefinition, resolveParams } from "./types";

const parameters: ParameterDefinition[] = [
  ...IMAGE_PARAMS,
  { id: "lineSpacing", type: "number", group: "Structure", label: "Line spacing", default: 1.8, min: 0.3, max: 15, step: 0.05, unit: "mm", description: "Distance between lines." },
  { id: "orientation", type: "number", group: "Structure", label: "Orientation", default: 0, min: 0, max: 179, step: 1, unit: "°", description: "0° = horizontal lines." },
  { id: "displacement", type: "number", group: "Distortion", label: "Displacement", default: 5, min: 0, max: 40, step: 0.1, unit: "mm", description: "How far the darkest areas push the lines." },
  { id: "mode", type: "select", group: "Distortion", label: "Displace by", default: "dark",
    options: [{ value: "dark", label: "Darkness (dark lifts)" }, { value: "light", label: "Brightness (light lifts)" }, { value: "both", label: "Both ways from mid-grey" }],
    description: "Which tones push the lines, and in which direction." },
  { id: "gamma", type: "number", group: "Distortion", label: "Response curve", default: 1, min: 0.2, max: 3, step: 0.05, description: "Below 1 exaggerates subtle tones." },
  { id: "noiseStrength", type: "number", group: "Noise", label: "Noise strength", default: 0, min: 0, max: 10, step: 0.1, unit: "mm", description: "Seeded noise added to the displacement." },
  { id: "noiseScale", type: "number", group: "Noise", label: "Noise scale", default: 20, min: 1, max: 200, step: 1, unit: "mm",
    description: "Size of the noise features.", visibleWhen: (v) => (v.noiseStrength as number) > 0 },
  { id: "step", type: "number", group: "Advanced", label: "Sample step", default: 0.3, min: 0.05, max: 2, step: 0.05, unit: "mm", description: "Distance between points along a line." },
];

export const imageDisplacement: GenerativeAlgorithm = {
  id: "displacement",
  name: "Image Displacement",
  category: "Image-driven",
  description: "Parallel lines lifted by the image's tones, like a relief or a seismograph.",
  parameters,
  inputs: { photo: true },
  usesSeed: (v) => (v.noiseStrength as number) > 0,
  seedHint: "Turn up Noise strength to use it.",
  async generate({ params, seed, paper, images }) {
    const v = resolveParams(imageDisplacement, params), sheet = sheetOf(paper), a = sheet.area;
    const L = lumaSampler(images?.photo ?? sampleImages().photo, a, adjustFrom(v), 0.25);
    const th = (num(v, "orientation") * Math.PI) / 180, ux = Math.cos(th), uy = Math.sin(th), nx = -uy, ny = ux;
    const cx = a.x + a.width / 2, cy = a.y + a.height / 2, D = num(v, "displacement"), mode = str(v, "mode"), g = num(v, "gamma");
    const diag = Math.hypot(a.width, a.height) + 2 * D, gap = num(v, "lineSpacing"), step = num(v, "step");
    const noise = perlin2(seed * 9 + 5), NS = num(v, "noiseStrength"), nsc = num(v, "noiseScale"), curves: Curve[] = [];
    for (let o = -diag / 2; o <= diag / 2; o += gap) {
      const pts: Point[] = [];
      for (let u = -diag / 2; u <= diag / 2; u += step) {
        const bx = cx + ux * u + nx * o, by = cy + uy * u + ny * o, t = L(bx, by);
        const k = mode === "dark" ? (1 - t) ** g : mode === "light" ? t ** g : Math.sign(0.5 - t) * Math.abs(1 - 2 * t) ** g;
        const d = -D * k + (NS ? NS * noise(bx / nsc, by / nsc) : 0);
        pts.push({ x: bx + nx * d, y: by + ny * d });
      }
      curves.push({ points: pts, closed: false });
    }
    return toCollection(sheet, curves);
  },
};
