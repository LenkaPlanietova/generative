import { create } from "zustand";

/** Plot Layers view state (not saved): mask drawing mode, hidden preview layers, seam markers. */
export interface PlotViewState {
  drawing: boolean;
  /** Layer numbers hidden in the preview. */
  hidden: number[];
  seams: boolean;
  setDrawing(drawing: boolean): void;
  toggleLayer(n: number): void;
  setSeams(seams: boolean): void;
}

export const usePlotView = create<PlotViewState>()((set) => ({
  drawing: false, hidden: [], seams: true,
  setDrawing: (drawing) => set({ drawing }),
  toggleLayer: (n) => set((s) => ({ hidden: s.hidden.includes(n) ? s.hidden.filter((x) => x !== n) : [...s.hidden, n] })),
  setSeams: (seams) => set({ seams }),
}));
