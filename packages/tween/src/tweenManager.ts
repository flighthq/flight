import { Expo } from '@flighthq/tween-easing';
import type { TweenManager, TweenManagerOptions } from '@flighthq/types';

export type { TweenManagerOptions } from '@flighthq/types';

export function createTweenManager(options?: Readonly<TweenManagerOptions>): TweenManager {
  return {
    __brand: 'TweenManager',
    defaultEase: options?.defaultEase ?? Expo.easeOut,
    tweens: new Map(),
  };
}

export const defaultManager: TweenManager = createTweenManager();
