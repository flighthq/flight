// What `explainCamera3DView` measured about a camera's view matrix. Plain data: the caller decides what
// a deviation means for its own use, because the same matrix is exact for some consumers and wrong for
// others.
export interface Camera3DViewExplanation {
  /** Determinant of the upper 3x3. +1 for a rigid basis, -1 for a reflection; both are orthogonal. */
  determinant: number;
  /** True when the basis is orthonormal within tolerance — reflections included. */
  isOrthonormal: boolean;
  /** True when the basis is orthogonal but mirrored (`determinant < 0`), as a water or mirror camera is. */
  isReflection: boolean;
  /** Largest absolute deviation from unit length across the three basis vectors. */
  scaleDeviation: number;
  /** Largest absolute pairwise dot product between the three basis vectors; zero when unsheared. */
  shearDeviation: number;
}
