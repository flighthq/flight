/**
 * A coarse, downscaled RGB summary of a bitmap used for tolerant visual-regression checks (see
 * createBitmapFingerprint). The bitmap is reduced to a gridSize × gridSize grid of averaged RGB
 * cells, so sub-pixel antialiasing and minor jitter — which break an exact pixel hash — wash out,
 * while gross changes (blank output, wrong colour, large layout shifts) still register. Small enough
 * to commit as text instead of a PNG (see formatBitmapFingerprint / parseBitmapFingerprint).
 */
export interface BitmapFingerprint extends Entity {
  /** Cells per axis; the grid is gridSize × gridSize. */
  readonly gridSize: number;
  /** Row-major averaged cells, three bytes (R, G, B) each: length gridSize × gridSize × 3. */
  readonly cells: Uint8Array;
}
import type { Entity } from './Entity';
