/** Paper presets and sheet layout. All sizes in millimetres (portrait width × height). */

export const PAPER_PRESETS = {
  A5: [148, 210],
  A4: [210, 297],
  A3: [297, 420],
  A2: [420, 594],
  Square: [200, 200],
} as const satisfies Record<string, readonly [number, number]>;

export type PaperName = keyof typeof PAPER_PRESETS | "Custom";
export const PAPER_NAMES: PaperName[] = ["A5", "A4", "A3", "A2", "Square", "Custom"];

export interface PaperSettings {
  paper: PaperName;
  customWidth: number;
  customHeight: number;
  orientation: "portrait" | "landscape";
  margin: number;
}

export const DEFAULT_PAPER: PaperSettings = { paper: "A4", customWidth: 300, customHeight: 300, orientation: "portrait", margin: 20 };

export interface Sheet {
  width: number;
  height: number;
  /** Drawing area (inside the margins), in mm from the sheet's top-left corner. */
  area: { x: number; y: number; width: number; height: number };
}

export function sheetFor(s: PaperSettings): Sheet {
  let [w, h] = s.paper === "Custom" ? [s.customWidth, s.customHeight] : PAPER_PRESETS[s.paper];
  if (s.orientation === "landscape" ? h > w : w > h) [w, h] = [h, w];
  const m = Math.max(0, Math.min(s.margin, w / 2 - 5, h / 2 - 5));
  return { width: w, height: h, area: { x: m, y: m, width: w - 2 * m, height: h - 2 * m } };
}
