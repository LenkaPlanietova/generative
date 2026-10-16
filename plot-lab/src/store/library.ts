/** Presets and recent projects, kept in this browser's local storage. */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ParamValues } from "../algorithms/types";

export interface Preset { id: string; name: string; algorithmId: string; params: ParamValues; seed: number; createdAt: string }
export interface RecentProject { name: string; savedAt: string; algorithmId: string; /** Project JSON without images (too large for local storage). */ json: string }

interface LibraryState {
  presets: Preset[];
  recent: RecentProject[];
  addPreset(p: Omit<Preset, "id" | "createdAt">): Preset;
  removePreset(id: string): void;
  addRecent(r: RecentProject): void;
}

export const MAX_RECENT = 8;

export const useLibrary = create<LibraryState>()(
  persist(
    (set) => ({
      presets: [],
      recent: [],
      addPreset: (p) => {
        const preset: Preset = { ...p, id: `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`, createdAt: new Date().toISOString() };
        set((s) => ({ presets: [...s.presets, preset] }));
        return preset;
      },
      removePreset: (id) => set((s) => ({ presets: s.presets.filter((p) => p.id !== id) })),
      addRecent: (r) => set((s) => ({ recent: [r, ...s.recent.filter((x) => x.name !== r.name)].slice(0, MAX_RECENT) })),
    }),
    { name: "plot-lab/library", version: 1 },
  ),
);
