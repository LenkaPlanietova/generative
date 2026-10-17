/**
 * Plotter profiles. Values are the user's to set — nothing here is a claim about a machine's real limits.
 * Speeds, acceleration, pen-lift delay and the calibration factor only feed the time estimate; the drawing-area
 * limit only feeds a warning.
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
  /** mm/s²; 0 = ignore acceleration */
  acceleration: number;
  /** Multiplies every estimate; set by calibrating against a real plot. 1 = uncalibrated. */
  timeFactor: number;
}

export const DEFAULT_PROFILE: PlotterProfile = {
  id: "makerq-easydraw-v4",
  name: "MakerQ EasyDraw V4",
  maxWidth: 0,
  maxHeight: 0,
  penDownSpeed: 30,
  penUpSpeed: 75,
  penLiftDelay: 0.35,
  acceleration: 500,
  timeFactor: 1,
};

/** Calibration factor that makes `estimate` (s, uncalibrated) read as `actual` (s). Clamped to a sane range. */
export function calibrate(estimate: number, actual: number): number {
  if (!(estimate > 0) || !(actual > 0)) return 1;
  return Math.min(5, Math.max(0.2, actual / estimate));
}
