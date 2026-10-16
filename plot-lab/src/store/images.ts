import { create } from "zustand";
import { decodeImageFile, normalise } from "../image/decode";
import type { GrayImage } from "../image/types";

export interface ImageState {
  photo?: GrayImage;
  depth?: GrayImage;
  loading?: "photo" | "depth";
  error?: string;
  load(kind: "photo" | "depth", file: File): Promise<void>;
  clear(kind: "photo" | "depth"): void;
}

/** Reference images (kept in memory only; too large for local storage). */
export const useImages = create<ImageState>()((set) => ({
  async load(kind, file) {
    set({ loading: kind, error: undefined });
    try {
      const img = await decodeImageFile(file);
      set({ [kind]: kind === "depth" ? normalise(img) : img, loading: undefined });
    } catch (e) {
      set({ loading: undefined, error: `Couldn't read ${file.name}: ${e instanceof Error ? e.message : String(e)}. Use a PNG or JPG.` });
    }
  },
  clear: (kind) => set({ [kind]: undefined, error: undefined }),
}));
