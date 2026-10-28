import type { EasingFunction } from './EasingFunction.ts';

/** @deprecated Import `EasingSegment` from `@flighthq/easing/contract`. */
export interface EasingSegment {
  readonly ease: EasingFunction;
  readonly weight?: number;
}
