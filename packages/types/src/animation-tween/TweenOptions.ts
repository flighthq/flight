import type { EasingFunction } from '../animation-easing/EasingFunction';

export interface TweenOptions {
  delay?: number;
  ease?: EasingFunction;
  overwrite?: boolean;
  reflect?: boolean;
  /** Number of times to repeat after the initial play. Use -1 for infinite. */
  repeat?: number;
  reverse?: boolean;
  /** Normalize angular change to the shortest rotational path (within ±180°). */
  smartRotation?: boolean;
  snapping?: boolean;
}
