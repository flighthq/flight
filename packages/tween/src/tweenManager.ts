import { easeOutExponential } from '@flighthq/easing/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { TweenManager, TweenManagerOptions, EntityConstruction } from '@flighthq/types/contract';

export function createTweenManager(options?: Readonly<TweenManagerOptions>): TweenManager {
  const out = allocateEntity<TweenManager>();
  initializeTweenManager(out, options);
  return finishEntity(out);
}

export function initializeTweenManager(
  out: EntityConstruction<TweenManager>,
  options?: Readonly<TweenManagerOptions>,
): void {
  out.__brand = 'TweenManager';
  out.defaultEase = options?.defaultEase ?? easeOutExponential;
  out.tweens = new Map();
}

export const defaultManager: TweenManager = createTweenManager();
