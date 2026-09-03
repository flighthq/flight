/* eslint-disable @typescript-eslint/no-explicit-any */

import type { EasingFunction } from './EasingFunction';
import type { Entity } from './Entity';
import type { Tween } from './Tween';

export interface TweenManager extends Entity {
  readonly __brand: 'TweenManager';
  defaultEase: EasingFunction;
  tweens: Map<object, Tween<any>[]>;
}
