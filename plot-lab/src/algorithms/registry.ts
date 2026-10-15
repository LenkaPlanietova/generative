import { flowField } from "./flowField";
import type { GenerativeAlgorithm } from "./types";

export const ALGORITHMS: GenerativeAlgorithm[] = [flowField];

export const getAlgorithm = (id: string): GenerativeAlgorithm | undefined => ALGORITHMS.find((a) => a.id === id);

/** The library as the sidebar shows it. Entries without an implementation are listed with the phase that adds them. */
export const LIBRARY: { category: string; items: { id: string; name: string; phase?: number }[] }[] = [
  { category: "Flow", items: [{ id: "flow-field", name: "Flow Field" }, { id: "streamlines", name: "Streamlines", phase: 2 }, { id: "noise-flow", name: "Noise Flow", phase: 3 }] },
  { category: "Geometry", items: [
    { id: "radial", name: "Radial Geometry", phase: 2 }, { id: "spirograph", name: "Spirograph", phase: 2 },
    { id: "lissajous", name: "Lissajous Curves", phase: 2 }, { id: "harmonograph", name: "Harmonographs", phase: 2 },
    { id: "parametric", name: "Parametric Curves", phase: 2 },
  ] },
  { category: "Patterns", items: [
    { id: "wave", name: "Wave Distortion", phase: 2 }, { id: "interference", name: "Interference", phase: 3 },
    { id: "moire", name: "Moiré", phase: 3 }, { id: "guilloche", name: "Guilloché", phase: 3 }, { id: "repetition", name: "Geometric Repetition", phase: 3 },
  ] },
  { category: "Fields", items: [
    { id: "contour", name: "Contour Lines", phase: 2 }, { id: "topographic", name: "Topographic Fields", phase: 2 },
    { id: "attractor", name: "Attractor Fields", phase: 3 }, { id: "reaction-diffusion", name: "Reaction-Diffusion Contours", phase: 3 },
  ] },
  { category: "Image-driven", items: [
    { id: "wave-portrait", name: "Wave Portrait", phase: 4 }, { id: "contour-portrait", name: "Contour Portrait", phase: 4 },
    { id: "hatching", name: "Adaptive Hatching", phase: 4 }, { id: "displacement", name: "Image Displacement", phase: 4 },
  ] },
];
