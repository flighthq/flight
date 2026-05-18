import type { EasingFunction } from '../animation-easing/EasingFunction';
import type { Signal } from '../signals/Signal';
import type { TweenPropertyDetail } from './TweenPropertyDetail';

export type NumericProps<T> = { [K in keyof T as T[K] extends number ? K : never]?: number };

export interface Tween<T extends object> {
  complete: boolean;
  delay: number;
  duration: number;
  ease: EasingFunction;
  elapsed: number;
  initialized: boolean;
  onComplete: Signal<() => void>;
  onRepeat: Signal<() => void>;
  onUpdate: Signal<() => void>;
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
