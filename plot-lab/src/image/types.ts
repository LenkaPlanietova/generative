/** A decoded image as linear 0..1 luminance (white = 1), at full bit depth. */
export interface GrayImage {
  /** Content identity: changes when the pixels change (used to know when to regenerate). */
  id: string;
  name: string;
  width: number;
  height: number;
  data: Float32Array;
  /** Bits per sample in the source file (8 or 16 for PNG; 8 for JPEG). */
  bits: number;
}

export interface ImageInputs {
  photo?: GrayImage;
  depth?: GrayImage;
}
