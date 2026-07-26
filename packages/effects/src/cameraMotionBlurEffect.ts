import type { CameraMotionBlurEffect } from '@flighthq/types/contract';

export function createCameraMotionBlurEffect(
  options: Readonly<Omit<CameraMotionBlurEffect, 'kind'>> = {},
): CameraMotionBlurEffect {
  return { kind: 'CameraMotionBlurEffect', ...options };
}
