import type {
  CameraMotionBlurEffect,
  DirectionalBlurEffect,
  MotionBlurEffect,
  RadialBlurEffect,
} from '@flighthq/types';

// Motion-blur effect intents. Plain data with a `type` discriminant; per-backend recipes register a
// runner against that `type`. Camera motion blur is tagged [MOTION] — a true implementation needs
// motion vectors; the Gl recipe approximates it as a zoom/radial blur scaled by intensity.

export function createCameraMotionBlurEffect(
  options: Readonly<Omit<CameraMotionBlurEffect, 'type'>> = {},
): CameraMotionBlurEffect {
  return { type: 'cameraMotionBlur', ...options };
}

export function createDirectionalBlurEffect(
  options: Readonly<Omit<DirectionalBlurEffect, 'type'>> = {},
): DirectionalBlurEffect {
  return { type: 'directionalBlur', ...options };
}

export function createMotionBlurEffect(options: Readonly<Omit<MotionBlurEffect, 'type'>> = {}): MotionBlurEffect {
  return { type: 'motionBlur', ...options };
}

export function createRadialBlurEffect(options: Readonly<Omit<RadialBlurEffect, 'type'>> = {}): RadialBlurEffect {
  return { type: 'radialBlur', ...options };
}
