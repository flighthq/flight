import type { EasingFunction } from './EasingFunction';
export interface EasingSegment {
  readonly ease: EasingFunction;
  readonly weight?: number;
}
