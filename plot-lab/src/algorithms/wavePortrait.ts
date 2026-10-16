/** Wave Portrait — parallel lines that oscillate faster and deeper where the image is dark (classic squiggle). */
import type { Point } from "../geometry/types";
import { sampleImages } from "../image/sample";
import { IMAGE_PARAMS, adjustFrom } from "../image/params";
import { lumaSampler } from "../image/sampler";
import { type Curve, num, sheetOf, toCollection } from "./common";
import { type GenerativeAlgorithm, type ParameterDefinition, resolveParams } from "./types";

const parameters: ParameterDefinition[] = [
  ...IMAGE_PARAMS,
  { id: "lineSpacing", type: "number", group: "Structure", label: "Line spacing", default: 2.4, min: 0.5, max: 15, step: 0.05, unit: "mm", description: "Distance between the base lines." },
  { id: "orientation", type: "number", group: "Structure", label: "Orientation", default: 0, min: 0, max: 179, step: 1, unit: "°", description: "0° = horizontal lines." },
  { id: "amplitude", type: "number", group: "Distortion", label: "Amplitude", default: 1.05, min: 0, max: 10, step: 0.05, unit: "mm",
    description: "Wave height in the darkest areas. Above half the line spacing, neighbouring lines touch." },
  { id: "darkWavelength", type: "number", group: "Distortion", label: "Dark wavelength", default: 0.7, min: 0.2, max: 10, step: 0.05, unit: "mm", description: "Wavelength in the darkest areas." },
  { id: "lightWavelength", type: "number", group: "Distortion", label: "Light wavelength", default: 4, min: 0.5, max: 30, step: 0.1, unit: "mm", description: "Wavelength in the lightest areas." },
  { id: "gamma", type: "number", group: "Density", label: "Gamma", default: 1, min: 0.2, max: 3, step: 0.05, description: "Below 1 adds waves in the mid-tones." },
  { id: "flatHighlights", type: "boolean", group: "Density", label: "Lift pen in highlights", default: false,
    description: "Break the line where the image is paper-white instead of drawing it flat." },
  { id: "step", type: "number", group: "Advanced", label: "Sample step", default: 0.12, min: 0.03, max: 1, step: 0.01, unit: "mm", description: "Distance between points along the line." },
];

export const wavePortrait: GenerativeAlgorithm = {
  id: "wave-portrait",
  name: "Wave Portrait",
  category: "Image-driven",
  description: "Parallel lines that ripple faster and deeper in the dark parts of the image.",
  parameters,
  inputs: { photo: true },
  usesSeed: () => false,
  async generate({ params, paper, images }) {
    const v = resolveParams(wavePortrait, params), sheet = sheetOf(paper), a = sheet.area;
    const L = lumaSampler(images?.photo ?? sampleImages().photo, a, adjustFrom(v), 0.25);
    const th = (num(v, "orientation") * Math.PI) / 180, ux = Math.cos(th), uy = Math.sin(th), nx = -uy, ny = ux;
    const cx = a.x + a.width / 2, cy = a.y + a.height / 2, diag = Math.hypot(a.width, a.height);
    const gap = num(v, "lineSpacing"), amp = num(v, "amplitude"), wd = num(v, "darkWavelength"), wl = num(v, "lightWavelength");
    const g = num(v, "gamma"), step = num(v, "step"), lift = v.flatHighlights as boolean, curves: Curve[] = [];
    for (let o = -diag / 2; o <= diag / 2; o += gap) {
      let phase = 0, pts: Point[] = [];
      for (let u = -diag / 2; u <= diag / 2; u += step) {
        const bx = cx + ux * u + nx * o, by = cy + uy * u + ny * o, t = L(bx, by);
        if (lift && t > 0.985) { if (pts.length > 1) curves.push({ points: pts, closed: false }); pts = []; continue; }
        const dark = (1 - t) ** g;
        phase += (2 * Math.PI * step) / (wl + (wd - wl) * dark);
        const d = amp * dark * Math.sin(phase);
        pts.push({ x: bx + nx * d, y: by + ny * d });
      }
      if (pts.length > 1) curves.push({ points: pts, closed: false });
    }
    return toCollection(sheet, curves);
  },
};
