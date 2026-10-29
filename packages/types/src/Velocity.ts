import type {
  Velocity2D as Velocity2DOwned,
  VelocityExplanation as VelocityExplanationOwned,
  VelocityField as VelocityFieldOwned,
  VelocitySample as VelocitySampleOwned,
} from '@flighthq/velocity/contract';

/** @deprecated Import `Velocity2D` from `@flighthq/velocity/contract`. */
export type Velocity2D = Velocity2DOwned;

/** @deprecated Import `VelocitySample` from `@flighthq/velocity/contract`. */
export type VelocitySample = VelocitySampleOwned;

/** @deprecated Import `VelocityField` from `@flighthq/velocity/contract`. */
export type VelocityField = VelocityFieldOwned;

/** @deprecated Import `VelocityExplanation` from `@flighthq/velocity/contract`. */
export type VelocityExplanation = VelocityExplanationOwned;

// A source of per-node velocity for a frame — physics, tween, camera, or the transform-delta baseline.
// Implementations write into the field (via contributeVelocity / suppressVelocity) for `root`'s subtree.
// Kept as a plain function so any system can be one without depending on the velocity package's internals.
export type VelocityContributor = (field: VelocityField, root: object) => void;
