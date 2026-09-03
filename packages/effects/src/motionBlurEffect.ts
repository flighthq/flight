import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, MotionBlurEffect } from '@flighthq/types/contract';

export function createMotionBlurEffect(
  options: Readonly<Omit<EntityWithoutRuntime<MotionBlurEffect>, 'kind'>> = {},
): MotionBlurEffect {
  return createEntity({ kind: 'MotionBlurEffect', ...options });
}
