import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, CameraMotionBlurEffect } from '@flighthq/types/contract';

export function createCameraMotionBlurEffect(
  options: Readonly<Omit<EntityWithoutRuntime<CameraMotionBlurEffect>, 'kind'>> = {},
): CameraMotionBlurEffect {
  return createEntity({ kind: 'CameraMotionBlurEffect', ...options });
}
