import { adaptiveHatching } from "./adaptiveHatching";
import { contourField } from "./contourField";
import { contourPortrait } from "./contourPortrait";
import { flowField } from "./flowField";
import { harmonograph } from "./harmonograph";
import { imageDisplacement } from "./imageDisplacement";
import { guilloche } from "./guilloche";
import { interference } from "./interference";
import { lissajous } from "./lissajous";
import { moire } from "./moire";
import { noiseFlow } from "./noiseFlow";
import { radialGeometry } from "./radialGeometry";
import { reactionDiffusion } from "./reactionDiffusion";
import { redraw } from "./redraw";
import { spirograph } from "./spirograph";
import { topographic } from "./topographic";
import type { GenerativeAlgorithm } from "./types";
import { waveDistortion } from "./waveDistortion";
import { wavePortrait } from "./wavePortrait";

export const ALGORITHMS: GenerativeAlgorithm[] = [
  flowField, noiseFlow, contourField, topographic, waveDistortion, radialGeometry, spirograph, lissajous, harmonograph,
  moire, guilloche, interference, reactionDiffusion,
  redraw, contourPortrait, wavePortrait, adaptiveHatching, imageDisplacement,
];

export const getAlgorithm = (id: string): GenerativeAlgorithm | undefined => ALGORITHMS.find((a) => a.id === id);

/**
 * The library as the sidebar shows it. Entries without an implementation are listed with the phase that adds
 * them, or "later" for ideas outside the current roadmap.
 */
export const LIBRARY: { category: string; items: { id: string; name: string; phase?: number | "later" }[] }[] = [
  { category: "Flow", items: [{ id: "flow-field", name: "Flow Field" }, { id: "streamlines", name: "Streamlines", phase: "later" }, { id: "noise-flow", name: "Noise Flow" }] },
  { category: "Geometry", items: [
    { id: "radial", name: "Radial Geometry", phase: 2 }, { id: "spirograph", name: "Spirograph", phase: 2 },
    { id: "lissajous", name: "Lissajous Curves", phase: 2 }, { id: "harmonograph", name: "Harmonographs", phase: 2 },
    { id: "parametric", name: "Parametric Curves", phase: "later" },
  ] },
  { category: "Patterns", items: [
    { id: "wave", name: "Wave Distortion", phase: 2 }, { id: "interference", name: "Interference" },
    { id: "moire", name: "Moiré" }, { id: "guilloche", name: "Guilloché" }, { id: "repetition", name: "Geometric Repetition", phase: "later" },
  ] },
  { category: "Fields", items: [
    { id: "contour", name: "Contour Field" }, { id: "topographic", name: "Topographic Fields" },
    { id: "attractor", name: "Attractor Fields", phase: "later" }, { id: "reaction-diffusion", name: "Reaction-Diffusion Contours" },
  ] },
  { category: "Image-driven", items: [
    { id: "redraw", name: "Redraw" }, { id: "contour-portrait", name: "Contour Portrait" }, { id: "wave-portrait", name: "Wave Portrait" },
    { id: "hatching", name: "Adaptive Hatching" }, { id: "displacement", name: "Image Displacement" },
  ] },
];
