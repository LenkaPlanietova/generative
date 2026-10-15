/**
 * Plotter profiles. Values are the user's to set — nothing here is a claim about a machine's real limits.
 * Speeds and pen-lift delay only feed the time estimate; the drawing-area limit only feeds a warning.
 */
export interface PlotterProfile {
  id: string;
  name: string;
  /** Usable drawing area in mm; 0 = not set (no check). */
  maxWidth: number;
  maxHeight: number;
  /** mm/s */
  penDownSpeed: number;
  /** mm/s */
  penUpSpeed: number;
  /** s per pen lift + drop */
  penLiftDelay: number;
}

export const DEFAULT_PROFILE: PlotterProfile = {
  id: "makerq-easydraw-v4",
  name: "MakerQ EasyDraw V4",
  maxWidth: 0,
  maxHeight: 0,
  penDownSpeed: 30,
  penUpSpeed: 75,
  penLiftDelay: 0.35,
};
