import { easeOutExponential } from '@flighthq/easing/contract';
import type { TweenManager, TweenManagerOptions } from '@flighthq/types/contract';

export function createTweenManager(options?: Readonly<TweenManagerOptions>): TweenManager {
  return {
    __brand: 'TweenManager',
    defaultEase: options?.defaultEase ?? easeOutExponential,
    tweens: new Map(),
  };
}

export const defaultManager: TweenManager = createTweenManager();
