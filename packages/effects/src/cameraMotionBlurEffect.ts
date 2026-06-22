import type { CameraMotionBlurEffect } from '@flighthq/types';

export function createCameraMotionBlurEffect(
  options: Readonly<Omit<CameraMotionBlurEffect, 'kind'>> = {},
): CameraMotionBlurEffect {
  return { kind: 'CameraMotionBlurEffect', ...options };
}
