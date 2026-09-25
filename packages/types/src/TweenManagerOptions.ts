import type { EasingFunction } from './EasingFunction.ts';

export interface TweenManagerOptions {
  /** Default easing function used by tweens that do not specify one explicitly. */
  defaultEase?: EasingFunction;
}
