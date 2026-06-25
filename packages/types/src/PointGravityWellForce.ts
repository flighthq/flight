import type { ForceFalloff } from './ForceFalloff';
/** Gravity well / attractor that pulls particles toward a point using a physically-based
 *  inverse-square or linear falloff, with a configurable well radius and a repulsor mode.
 *
 *  `PointGravityWellForce` differs from `AttractorForce` in its defaults and intent:
 *  - It models a gravitational well, so `'inverseSquare'` falloff is the canonical default.
 *  - The `minRadius` clamp prevents the singularity at the origin (equivalent to the
 *    gravitational softening length in N-body simulation).
 *  - `repulse: true` inverts the force direction for a repulsion field.
 */
export interface PointGravityWellForce {
  kind: 'PointGravityWellForce';
  x: number;
  y: number;
  strength: number;
  /** Hard cutoff radius. Particles beyond this distance are not affected. */
  radius?: number;
  /** Softening length: minimum effective distance clamped in the denominator to prevent
   *  the singularity at the origin. Defaults to 1 world unit. */
  minRadius?: number;
  falloff?: ForceFalloff;
  /** When true, the force pushes particles away from the well instead of toward it. */
  repulse?: boolean;
}
export const PointGravityWellForceKind = 'PointGravityWellForce';
