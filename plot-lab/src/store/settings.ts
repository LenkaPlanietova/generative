import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ALGORITHMS, getAlgorithm } from "../algorithms/registry";
import { type ParamValue, type ParamValues, defaultParams, resolveParams } from "../algorithms/types";
import { DEFAULT_PAPER, type PaperSettings } from "../core/paper";
import { type ClipSettings, DEFAULT_CLIP } from "../geometry/clipShape";
import { DEFAULT_MAX_POINTS } from "../pipeline";
import { DEFAULT_OPTIMIZE, type OptimizeOptions } from "../plotter/optimize";
import { DEFAULT_PROFILE, type PlotterProfile } from "../plotter/profiles";

export interface ViewOptions { grid: boolean; margins: boolean; pathViz: boolean; reference: boolean }

export interface SettingsState {
  algorithmId: string;
  params: Record<string, ParamValues>;
  seed: number;
  seedLocked: boolean;
  /** Previous seeds, most recent last. */
  seedHistory: number[];
  paper: PaperSettings;
  profile: PlotterProfile;
  penWidth: number;
  strokeColor: string;
  paperColor: string;
  optimize: OptimizeOptions;
  view: ViewOptions;
  auto: boolean;
  projectName: string;
  clip: ClipSettings;
  /** Safety limit: maximum points in one drawing. */
  maxPoints: number;

  setAlgorithm(id: string): void;
  setParam(id: string, value: ParamValue): void;
  resetParam(id: string): void;
  resetParams(): void;
  setSeed(seed: number): void;
  randomSeed(): void;
  nextVariation(): void;
  previousSeed(): void;
  setSeedLocked(locked: boolean): void;
  setPaper(p: Partial<PaperSettings>): void;
  setProfile(p: Partial<PlotterProfile>): void;
  setStroke(p: Partial<Pick<SettingsState, "penWidth" | "strokeColor" | "paperColor">>): void;
  setOptimize(p: Partial<OptimizeOptions>): void;
  setView(p: Partial<ViewOptions>): void;
  setAuto(auto: boolean): void;
  setClip(p: Partial<ClipSettings>): void;
  setProjectName(name: string): void;
  setMaxPoints(n: number): void;
  /** Replace the parameters of one algorithm (presets, variations, projects). */
  setParams(algorithmId: string, params: ParamValues): void;
  /** Start over: defaults for every algorithm, a fresh seed, no clip. Machine settings (profile, pen) are kept. */
  newProject(): void;
}

export const MAX_SEED = 999_999;
const clampSeed = (n: number) => Math.min(MAX_SEED, Math.max(1, Math.round(Number.isFinite(n) ? n : 1)));
/** UI-only randomness: picks a new seed. Algorithms never call this. */
const freshSeed = () => 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % MAX_SEED);

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => {
      const changeSeed = (seed: number) => {
        const s = get();
        if (s.seedLocked || seed === s.seed) return;
        set({ seed, seedHistory: [...s.seedHistory, s.seed].slice(-50) });
      };
      return {
        algorithmId: ALGORITHMS[0].id,
        params: Object.fromEntries(ALGORITHMS.map((a) => [a.id, defaultParams(a)])),
        seed: 7,
        seedLocked: false,
        seedHistory: [],
        paper: DEFAULT_PAPER,
        profile: DEFAULT_PROFILE,
        penWidth: 0.3,
        strokeColor: "#000000",
        paperColor: "#ffffff",
        optimize: DEFAULT_OPTIMIZE,
        view: { grid: false, margins: true, pathViz: false, reference: false },
        auto: true,
        projectName: "Untitled",
        clip: DEFAULT_CLIP,
        maxPoints: DEFAULT_MAX_POINTS,

        setAlgorithm: (id) => { if (getAlgorithm(id)) set({ algorithmId: id }); },
        setParam: (id, value) => set((s) => ({ params: { ...s.params, [s.algorithmId]: { ...s.params[s.algorithmId], [id]: value } } })),
        resetParam: (id) => set((s) => {
          const def = getAlgorithm(s.algorithmId)?.parameters.find((p) => p.id === id);
          return def ? { params: { ...s.params, [s.algorithmId]: { ...s.params[s.algorithmId], [id]: def.default } } } : {};
        }),
        resetParams: () => set((s) => ({ params: { ...s.params, [s.algorithmId]: defaultParams(getAlgorithm(s.algorithmId)!) } })),
        setSeed: (seed) => changeSeed(clampSeed(seed)),
        randomSeed: () => changeSeed(freshSeed()),
        nextVariation: () => changeSeed((get().seed % MAX_SEED) + 1),
        previousSeed: () => {
          const s = get();
          if (s.seedLocked || !s.seedHistory.length) return;
          set({ seed: s.seedHistory[s.seedHistory.length - 1], seedHistory: s.seedHistory.slice(0, -1) });
        },
        setSeedLocked: (seedLocked) => set({ seedLocked }),
        setPaper: (p) => set((s) => ({ paper: { ...s.paper, ...p } })),
        setProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),
        setStroke: (p) => set(p),
        setOptimize: (p) => set((s) => ({ optimize: { ...s.optimize, ...p } })),
        setView: (p) => set((s) => ({ view: { ...s.view, ...p } })),
        setAuto: (auto) => set({ auto }),
        setClip: (p) => set((s) => ({ clip: { ...s.clip, ...p } })),
        setMaxPoints: (maxPoints) => set({ maxPoints: Math.max(10_000, Math.round(maxPoints)) }),
        setProjectName: (projectName) => set({ projectName: projectName.slice(0, 120) }),
        setParams: (algorithmId, params) => {
          const a = getAlgorithm(algorithmId);
          if (a) set((s) => ({ params: { ...s.params, [algorithmId]: resolveParams(a, params) } }));
        },
        newProject: () => set((s) => ({
          algorithmId: ALGORITHMS[0].id,
          params: Object.fromEntries(ALGORITHMS.map((a) => [a.id, defaultParams(a)])),
          seed: freshSeed(), seedHistory: [], seedLocked: false, clip: DEFAULT_CLIP, projectName: "Untitled", paper: { ...DEFAULT_PAPER, ...{ paper: s.paper.paper, orientation: s.paper.orientation } },
        })),
      };
    },
    {
      name: "plot-lab/settings",
      version: 1,
      // Saved settings are merged over current defaults and validated, so old or edited storage can't break anything.
      merge: (saved, current) => {
        const s = { ...current, ...(saved as Partial<SettingsState>) };
        s.params = Object.fromEntries(ALGORITHMS.map((a) => [a.id, resolveParams(a, (saved as SettingsState | undefined)?.params?.[a.id] ?? {})]));
        if (!getAlgorithm(s.algorithmId)) s.algorithmId = ALGORITHMS[0].id;
        s.paper = { ...DEFAULT_PAPER, ...s.paper };
        s.profile = { ...DEFAULT_PROFILE, ...s.profile };
        s.optimize = { ...DEFAULT_OPTIMIZE, ...s.optimize };
        s.view = { ...current.view, ...s.view };
        s.clip = { ...DEFAULT_CLIP, ...s.clip };
        return s;
      },
      partialize: (s) => ({
        algorithmId: s.algorithmId, params: s.params, seed: s.seed, seedLocked: s.seedLocked, seedHistory: s.seedHistory,
        paper: s.paper, profile: s.profile, penWidth: s.penWidth, strokeColor: s.strokeColor, paperColor: s.paperColor,
        optimize: s.optimize, view: s.view, auto: s.auto, projectName: s.projectName, clip: s.clip, maxPoints: s.maxPoints,
      }),
    },
  ),
);

export const currentParams = (s: SettingsState): ParamValues => resolveParams(getAlgorithm(s.algorithmId)!, s.params[s.algorithmId] ?? {});
