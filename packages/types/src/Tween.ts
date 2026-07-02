import type { EasingFunction } from './EasingFunction';
import type { Signal } from './Signal';
import type { TweenPropertyDetail } from './TweenPropertyDetail';

export type NumericProps<T> = { [K in keyof T as T[K] extends number ? K : never]?: number };

export interface Tween<T extends object> {
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
