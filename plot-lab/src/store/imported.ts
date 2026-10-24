import { create } from "zustand";
import type { GeometryCollection } from "../geometry/types";
import { inputFromSvg, maskFromSvg, parseSvg } from "../import/svg";
import { useSettings } from "./settings";

export interface ImportedSvg {
  /** Changes with every import, so a new file regenerates. */
  id: string;
  name: string;
  input: GeometryCollection;
}

export interface ImportState {
  /** Polylines drawn instead of the algorithm (Plot Layers → Source). In memory only. */
  svg?: ImportedSvg;
  error?: string;
  notice?: string;
  /** Use an SVG's polylines as the drawing; its "mask" layer, if any, becomes the mask. */
  loadInput(file: File): Promise<void>;
  /** Take only the mask from an SVG layer named "mask". */
  loadMask(file: File): Promise<void>;
  clear(): void;
}

let n = 0;

export const useImported = create<ImportState>()((set) => {
  const read = async (file: File) => parseSvg(await file.text());
  const fail = (file: File, e: unknown) => set({ error: `Couldn't read ${file.name}: ${e instanceof Error ? e.message : String(e)}`, notice: undefined });
  return {
    async loadInput(file) {
      try {
        const svg = await read(file), input = inputFromSvg(svg), mask = maskFromSvg(svg);
        if (!input.paths.length) throw new Error("it has no paths outside the mask layer.");
        if (mask) useSettings.getState().setPlotLayers({ mask, enabled: true });
        set({ svg: { id: `${file.name}#${++n}`, name: file.name, input }, error: undefined,
          notice: `${input.paths.length} paths, ${svg.widthMm} × ${svg.heightMm} mm${mask ? ", mask from its mask layer" : ""}.` });
      } catch (e) { fail(file, e); }
    },
    async loadMask(file) {
      try {
        const mask = maskFromSvg(await read(file));
        if (!mask) throw new Error('it has no closed shape on a layer named "mask".');
        useSettings.getState().setPlotLayers({ mask, enabled: true });
        set({ error: undefined, notice: `Mask from ${file.name} (${mask.length} points).` });
      } catch (e) { fail(file, e); }
    },
    clear: () => set({ svg: undefined, error: undefined, notice: undefined }),
  };
});
