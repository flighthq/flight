import type { EasingFunction } from './EasingFunction';

export interface TweenStaggerOptions {
  /**
   * Delay in seconds between each target's tween start.
   * Default: 0.1.
   */
  each?: number;
  /**
   * How to order the stagger delay distribution across targets.
   * - 'start': first target starts first (default).
   * - 'center': middle target starts first, delays spread outward.
   * - 'end': last target starts first.
   * - number: index of the target that starts first; delays spread outward from there.
   */
  from?: 'center' | 'end' | 'start' | number;
  /** Optional easing applied to the stagger delay distribution (not to individual tweens). */
  staggerEase?: EasingFunction;
}
