import type { EasingFunction } from './EasingFunction.ts';
export interface EasingSegment {
  readonly ease: EasingFunction;
  readonly weight?: number;
}
