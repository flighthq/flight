import { easeOutExponential } from '@flighthq/easing/contract';
import { createEntity } from '@flighthq/entity/contract';
import type { TweenManager, TweenManagerOptions } from '@flighthq/types/contract';

export function createTweenManager(options?: Readonly<TweenManagerOptions>): TweenManager {
  return createEntity({
    __brand: 'TweenManager',
    defaultEase: options?.defaultEase ?? easeOutExponential,
    tweens: new Map(),
  });
}

export const defaultManager: TweenManager = createTweenManager();
