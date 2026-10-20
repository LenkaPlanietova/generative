/**
 * Noise Torus — a donut whose surface is pushed in and out by 3D noise, drawn as rings around it (and/or around
 * its tube), turned freely in 3D and projected onto the sheet with hidden lines removed. Seen from straight above
 * (tilt 0°) it is a set of concentric noisy rings.
 */
import { fbm3 } from "../fields/noise";
import { DepthBuffer, type P3, camera, visibleRuns } from "../render3d/hidden";
import { type Curve, num, sheetOf, toLayeredCollection } from "./common";
import { type GenerativeAlgorithm, type ParameterDefinition, resolveParams } from "./types";

const lines = (v: Record<string, unknown>) => v.lines as "rings" | "tube" | "both";

const parameters: ParameterDefinition[] = [
  { id: "majorRadius", type: "number", group: "Geometry", label: "Donut radius", default: 52, min: 5, max: 400, step: 0.5, unit: "mm",
    description: "From the centre of the hole to the middle of the tube." },
  { id: "tubeRadius", type: "number", group: "Geometry", label: "Tube radius", default: 26, min: 1, max: 300, step: 0.5, unit: "mm",
    description: "Thickness of the ring. Larger than the donut radius closes the hole." },
  { id: "tilt", type: "number", group: "Composition", label: "Tilt", default: 58, min: -180, max: 180, step: 1, unit: "°",
    description: "Tips the donut towards you: 0° = seen from above, 90° = edge-on." },
  { id: "spin", type: "number", group: "Composition", label: "Spin", default: 0, min: -180, max: 180, step: 1, unit: "°",
    description: "Turns the donut around its own axis (moves the noise around the ring)." },
  { id: "turn", type: "number", group: "Composition", label: "Turn", default: 0, min: -180, max: 180, step: 1, unit: "°",
    description: "Turns the tilted donut left or right." },
  { id: "perspective", type: "number", group: "Composition", label: "Perspective", default: 0.3, min: 0, max: 1, step: 0.01,
    description: "0 = flat (no perspective), 1 = very close camera." },
  { id: "offsetX", type: "number", group: "Composition", label: "Position X", default: 0, min: -400, max: 400, step: 0.5, unit: "mm", description: "Moves the donut horizontally." },
  { id: "offsetY", type: "number", group: "Composition", label: "Position Y", default: 0, min: -400, max: 400, step: 0.5, unit: "mm", description: "Moves the donut vertically." },
  { id: "lines", type: "select", group: "Structure", label: "Lines", default: "rings",
    options: [{ value: "rings", label: "Rings around the donut" }, { value: "tube", label: "Rings around the tube" }, { value: "both", label: "Both (two layers)" }],
    description: "Which way the lines run over the surface." },
  { id: "ringCount", type: "number", group: "Structure", label: "Ring count", default: 70, min: 3, max: 400, step: 1,
    description: "Rings around the donut, spread evenly round the tube.", visibleWhen: (v) => lines(v) !== "tube" },
  { id: "tubeCount", type: "number", group: "Structure", label: "Tube ring count", default: 120, min: 3, max: 600, step: 1,
    description: "Rings around the tube, spread evenly round the donut.", visibleWhen: (v) => lines(v) !== "rings" },
  { id: "amplitude", type: "number", group: "Noise", label: "Amplitude", default: 7, min: 0, max: 60, step: 0.1, unit: "mm",
    description: "How far the noise pushes the surface in and out." },
  { id: "noiseScale", type: "number", group: "Noise", label: "Noise scale", default: 35, min: 2, max: 400, step: 0.5, unit: "mm",
    description: "Size of the bumps.", visibleWhen: (v) => (v.amplitude as number) > 0 },
  { id: "octaves", type: "number", group: "Noise", label: "Octaves", default: 2, min: 1, max: 6, step: 1,
    description: "Layers of finer detail on top of the main bumps.", visibleWhen: (v) => (v.amplitude as number) > 0 },
  { id: "hidden", type: "boolean", group: "Advanced", label: "Hide lines behind", default: true,
    description: "Removes the parts of lines that the surface covers, as on a solid object. Off = see-through wireframe." },
  { id: "precision", type: "number", group: "Advanced", label: "Hidden-line precision", default: 0.25, min: 0.05, max: 2, step: 0.05, unit: "mm",
    description: "Cell size of the visibility test. Smaller is cleaner at the outlines and slower.", visibleWhen: (v) => v.hidden as boolean },
  { id: "segment", type: "number", group: "Advanced", label: "Segment length", default: 0.6, min: 0.1, max: 5, step: 0.05, unit: "mm",
    description: "Sampling distance along each ring." },
];

export const noiseTorus: GenerativeAlgorithm = {
  id: "noise-torus",
  name: "Noise Torus",
  category: "Geometry",
  description: "A noisy donut drawn in rings, turned in 3D, with the hidden back removed.",
  parameters,
  usesSeed: (v) => (v.amplitude as number) > 0,
  seedHint: "Set Amplitude above 0 to add seeded noise.",
  async generate({ params, seed, paper, signal }) {
    const v = resolveParams(noiseTorus, params), sheet = sheetOf(paper), a = sheet.area;
    const R = num(v, "majorRadius"), r = num(v, "tubeRadius"), amp = num(v, "amplitude"), scale = num(v, "noiseScale");
    const noise = fbm3(seed, num(v, "octaves")), seg = num(v, "segment");
    const project = camera({
      spin: num(v, "spin"), tilt: num(v, "tilt"), turn: num(v, "turn"), perspective: num(v, "perspective"), extent: R + r + amp,
      cx: a.x + a.width / 2 + num(v, "offsetX"), cy: a.y + a.height / 2 + num(v, "offsetY"),
    });
    // Surface point at (u around the donut, w around the tube), displaced along the normal by noise.
    const point = (u: number, w: number): P3 => {
      const cu = Math.cos(u), su = Math.sin(u), cw = Math.cos(w), sw = Math.sin(w);
      const ring = R + r * cw, x = ring * cu, y = ring * su, z = r * sw;
      const d = amp > 0 ? amp * noise(x / scale, y / scale, z / scale) : 0;
      return project(x + d * cw * cu, y + d * cw * su, z + d * sw);
    };

    let buf: DepthBuffer | null = null;
    if (v.hidden) {
      const cell = num(v, "precision"), margin = 2 * (R + r + amp);
      buf = new DepthBuffer(a.x - margin, a.y - margin, a.width + 2 * margin, a.height + 2 * margin, cell);
      // Mesh fine enough that facets stay well under the visibility tolerance.
      const nu = Math.min(2000, Math.max(48, Math.ceil((2 * Math.PI * (R + r + amp)) / Math.max(cell * 4, 0.8)))),
        nw = Math.min(1000, Math.max(24, Math.ceil((2 * Math.PI * (r + amp)) / Math.max(cell * 4, 0.8))));
      const grid: P3[] = new Array((nu + 1) * (nw + 1));
      for (let i = 0; i <= nu; i++) for (let j = 0; j <= nw; j++) grid[i * (nw + 1) + j] = point((2 * Math.PI * i) / nu, (2 * Math.PI * j) / nw);
      for (let i = 0; i < nu; i++) {
        if (signal?.aborted) break;
        for (let j = 0; j < nw; j++) {
          const p00 = grid[i * (nw + 1) + j], p10 = grid[(i + 1) * (nw + 1) + j], p01 = grid[i * (nw + 1) + j + 1], p11 = grid[(i + 1) * (nw + 1) + j + 1];
          buf.triangle(p00, p10, p11);
          buf.triangle(p00, p11, p01);
        }
      }
    }
    const eps = Math.max(0.15, 3 * num(v, "precision")) + 0.01 * (r + amp);

    const trace = (f: (t: number) => P3, length: number): Curve[] => {
      const n = Math.max(24, Math.ceil(length / seg)), pts: P3[] = [];
      for (let k = 0; k < n; k++) pts.push(f((2 * Math.PI * k) / n));
      if (!buf) return [{ points: pts.map((p) => ({ x: p.x, y: p.y })), closed: true }];
      return visibleRuns(pts, true, buf, eps, 1, 1.2).map((points) => ({ points, closed: false }));
    };

    const layers: { id: string; name: string; curves: Curve[] }[] = [];
    if (lines(v) !== "tube") {
      const n = num(v, "ringCount"), curves: Curve[] = [];
      for (let k = 0; k < n && !signal?.aborted; k++) {
        const w = (2 * Math.PI * (k + 0.5)) / n;
        curves.push(...trace((u) => point(u, w), 2 * Math.PI * (R + r * Math.cos(w) + amp)));
      }
      layers.push({ id: "rings", name: "rings", curves });
    }
    if (lines(v) !== "rings") {
      const n = num(v, "tubeCount"), curves: Curve[] = [];
      for (let k = 0; k < n && !signal?.aborted; k++) {
        const u = (2 * Math.PI * k) / n;
        curves.push(...trace((w) => point(u, w), 2 * Math.PI * (r + amp)));
      }
      layers.push({ id: "tube", name: "tube rings", curves });
    }
    return toLayeredCollection(sheet, layers);
  },
};
