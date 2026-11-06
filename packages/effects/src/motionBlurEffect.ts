import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime } from '@flighthq/entity/contract';

import { initializeEffect } from './effect.ts';
import type { MotionBlurEffect } from './types/MotionBlurEffect.ts';

export function createMotionBlurEffect(
  options: Readonly<Omit<EntityWithoutRuntime<MotionBlurEffect>, 'kind'>> = {},
): MotionBlurEffect {
  const out = allocateEntity<MotionBlurEffect>();
  initializeMotionBlurEffect(out, options);
  return finishEntity(out);
}

export function initializeMotionBlurEffect(
  out: EntityConstruction<MotionBlurEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<MotionBlurEffect>, 'kind'>>,
): void {
  initializeEffect(out, 'MotionBlurEffect');
  out.intensity = options.intensity;
  out.samples = options.samples;
}
