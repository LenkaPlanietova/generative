import type { ParameterDefinition, ParamValues } from "../algorithms/types";
import type { ImageAdjust } from "./sampler";

/** Image placement and tone controls shared by every image-driven algorithm (spec §7). */
export const IMAGE_PARAMS: ParameterDefinition[] = [
  { id: "fit", type: "select", group: "Image", label: "Fit", default: "contain",
    options: [{ value: "contain", label: "Fit inside" }, { value: "cover", label: "Fill (crop)" }, { value: "stretch", label: "Stretch" }],
    description: "How the image is placed in the drawing area. Fill crops whatever sticks out." },
  { id: "imageScale", type: "number", group: "Image", label: "Scale", default: 1, min: 0.2, max: 5, step: 0.01, unit: "×",
    description: "Zoom the image; with Position this crops to any part of it." },
  { id: "imageX", type: "number", group: "Image", label: "Position X", default: 0, min: -400, max: 400, step: 0.5, unit: "mm", description: "Moves the image horizontally." },
  { id: "imageY", type: "number", group: "Image", label: "Position Y", default: 0, min: -400, max: 400, step: 0.5, unit: "mm", description: "Moves the image vertically." },
  { id: "levelsBlack", type: "number", group: "Image", label: "Levels: black", default: 0, min: 0, max: 0.9, step: 0.01,
    description: "Tones this dark or darker become full black." },
  { id: "levelsWhite", type: "number", group: "Image", label: "Levels: white", default: 1, min: 0.1, max: 1, step: 0.01,
    description: "Tones this light or lighter become paper white. Lower it for bright, high-key photos so lit skin stays clean." },
  { id: "levelsMid", type: "number", group: "Image", label: "Levels: midtones", default: 1, min: 0.3, max: 3, step: 0.05,
    description: "Above 1 lightens the middle greys, below 1 darkens them; black and white stay put." },
  { id: "brightness", type: "number", group: "Image", label: "Brightness", default: 0, min: -0.5, max: 0.5, step: 0.01, description: "Brightens or darkens the image before sampling." },
  { id: "contrast", type: "number", group: "Image", label: "Contrast", default: 1, min: 0.2, max: 4, step: 0.05, description: "Contrast around mid-grey." },
  { id: "invert", type: "boolean", group: "Image", label: "Invert", default: false, description: "Swap light and dark." },
  { id: "imageBlur", type: "number", group: "Image", label: "Blur for sampling", default: 0, min: 0, max: 10, step: 0.1, unit: "mm",
    description: "Softens the image before the algorithm reads it." },
];

export const adjustFrom = (v: ParamValues): ImageAdjust => ({
  fit: v.fit as ImageAdjust["fit"], scale: v.imageScale as number, offsetX: v.imageX as number, offsetY: v.imageY as number,
  blackPoint: (v.levelsBlack as number) ?? 0, whitePoint: (v.levelsWhite as number) ?? 1, midtones: (v.levelsMid as number) ?? 1,
  brightness: v.brightness as number, contrast: v.contrast as number, invert: v.invert as boolean, blur: v.imageBlur as number,
});
