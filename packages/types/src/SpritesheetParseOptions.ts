export interface SpritesheetParseOptions {
  /** Default frame duration in ms used by formats that do not embed per-frame timing. Defaults to 100. */
  frameDuration?: number;
  /** Atlas image height for formats that omit dimensions (e.g. Starling). */
  imageHeight?: number;
  /** Atlas image width for formats that omit dimensions (e.g. Starling). */
  imageWidth?: number;
}
