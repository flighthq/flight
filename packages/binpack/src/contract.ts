// Generated from crates/flight-binpack/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export {
  explainUnpackedRectangles,
  getUnpackedRectangleReasonString,
  parseUnpackedRectangleReason,
} from './explainUnpackedRectangles.ts';
export type { UnpackedRectangleExplanation, UnpackedRectangleReason } from './explainUnpackedRectangles.ts';
export {
  BIN_PACK_DEFAULT_MAX_EXTENT,
  getBinPackHeuristicString,
  getPackResultOccupancy,
  packRectangles,
  parseBinPackHeuristic,
} from './packRectangles.ts';
export type {
  BinPackHeuristic,
  BinPackOptions,
  PackResult,
  PackableRectangle,
  PackedRectangle,
  RectangleId,
} from './packRectangles.ts';
