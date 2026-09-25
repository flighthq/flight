/* eslint-disable @typescript-eslint/no-explicit-any */

import type { EasingFunction } from './EasingFunction.ts';
import type { Entity } from './Entity.ts';
import type { Tween } from './Tween.ts';

export interface TweenManager extends Entity {
  readonly __brand: 'TweenManager';
  defaultEase: EasingFunction;
  tweens: Map<object, Tween<any>[]>;
}
