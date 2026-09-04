import { easeOutExponential } from '@flighthq/easing/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { TweenManager, TweenManagerOptions } from '@flighthq/types/contract';

export function createTweenManager(options?: Readonly<TweenManagerOptions>): TweenManager {
  const out = allocateEntity<TweenManager>();
  out.__brand = 'TweenManager';
  out.defaultEase = options?.defaultEase ?? easeOutExponential;
  out.tweens = new Map();
  return finishEntity(out);
}

export const defaultManager: TweenManager = createTweenManager();
