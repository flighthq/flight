import { createEntity } from '@flighthq/entity/contract';
import type { CameraMotionBlurEffect } from '@flighthq/types/contract';

export function createCameraMotionBlurEffect(
  options: Readonly<Omit<CameraMotionBlurEffect, 'kind'>> = {},
): CameraMotionBlurEffect {
  return createEntity({ kind: 'CameraMotionBlurEffect', ...options });
}
