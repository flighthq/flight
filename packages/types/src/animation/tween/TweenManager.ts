/* eslint-disable @typescript-eslint/no-explicit-any */

import type { EasingFunction } from '../../easing/EasingFunction';
import type { Tween } from './Tween';

export interface TweenManager {
  readonly __brand: 'TweenManager';
  defaultEase: EasingFunction;
  tweens: Map<object, Tween<any>[]>;
}
