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
/** @deprecated Import velocity contracts from `@flighthq/velocity/contract`. */
export type { VelocityContributor } from '@flighthq/velocity/contract';
