/**
 * A coarse, downscaled RGB summary of a surface used for tolerant visual-regression checks (see
 * createSurfaceFingerprint). The surface is reduced to a gridSize × gridSize grid of averaged RGB
 * cells, so sub-pixel antialiasing and minor jitter — which break an exact pixel hash — wash out,
 * while gross changes (blank output, wrong colour, large layout shifts) still register. Small enough
 * to commit as text instead of a PNG (see formatSurfaceFingerprint / parseSurfaceFingerprint).
 */
export interface SurfaceFingerprint {
  /** Cells per axis; the grid is gridSize × gridSize. */
  readonly gridSize: number;
  /** Row-major averaged cells, three bytes (R, G, B) each: length gridSize × gridSize × 3. */
  readonly cells: Uint8Array;
}
