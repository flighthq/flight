import type { EasingFunction } from './EasingFunction.ts';
import type { Entity } from './Entity.ts';
import type { Signal } from './Signal.ts';
import type { TweenPropertyDetail } from './TweenPropertyDetail.ts';

export type NumericProps<T> = { [K in keyof T as T[K] extends number ? K : never]?: number };

export interface Tween<T extends object> extends Entity {
  complete: boolean;
  delay: number;
  duration: number;
  ease: EasingFunction;
  elapsed: number;
  initialized: boolean;
  /** Fires once when the tween finishes its final cycle (after all repeats). */
  onComplete: Signal<() => void>;
  onRepeat: Signal<() => void>;
  onUpdate: Signal<() => void>;
  onYoyo: Signal<() => void>;
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
