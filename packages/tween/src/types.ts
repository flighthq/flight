// The tween-owned contracts. They import nothing from @flighthq/types, which re-exports them
// type-only for compatibility.

import type { EasingFunction } from '@flighthq/easing/contract';
import type { EntityRaw, EntityRuntime } from '@flighthq/entity/contract';
import type { EntityRuntimeKey } from '@flighthq/entity/contract';
import type { Signal } from '@flighthq/signals/contract';

interface TweenEntity extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}

export interface TweenPropertyDetail {
  change: number;
  key: string;
  start: number;
}

export type NumericProps<T> = { [K in keyof T as T[K] extends number ? K : never]?: number };

export interface Tween<T extends object> extends TweenEntity {
  complete: boolean;
  delay: number;
  duration: number;
  ease: EasingFunction;
  elapsed: number;
  initialized: boolean;
  /** Fires once when the tween finishes its final cycle (after all repeats). */
  onComplete: Signal<void>;
  onRepeat: Signal<void>;
  onUpdate: Signal<void>;
  onYoyo: Signal<void>;
  paused: boolean;
  properties: TweenPropertyDetail[];
  propertyMap: Readonly<NumericProps<T>>;
  reflect: boolean;
  /** Repeat count remaining. -1 means infinite. */
  repeat: number;
  reverse: boolean;
  smartRotation: boolean;
  snapping: boolean;
  target: T;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TweenManager extends TweenEntity {
  readonly __brand: 'TweenManager';
  defaultEase: EasingFunction;
  tweens: Map<object, Tween<any>[]>;
}

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

export interface TweenManagerOptions {
  /** Default easing function used by tweens that do not specify one explicitly. */
  defaultEase?: EasingFunction;
}

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

export interface StopTweenOptions {
  /** Apply final property values to the target before stopping. Default: false. */
  complete?: boolean;
  /** Fire onComplete when complete is true. Default: true. */
  sendEvent?: boolean;
}
