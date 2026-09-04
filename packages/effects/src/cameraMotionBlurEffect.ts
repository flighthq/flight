import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { CameraMotionBlurEffect, EntityConstruction, EntityWithoutRuntime } from '@flighthq/types/contract';

import { initializeRenderEffect } from './renderEffect';

export function createCameraMotionBlurEffect(
  options: Readonly<Omit<EntityWithoutRuntime<CameraMotionBlurEffect>, 'kind'>> = {},
): CameraMotionBlurEffect {
  const out = allocateEntity<CameraMotionBlurEffect>();
  initializeCameraMotionBlurEffect(out, options);
  return finishEntity(out);
}

export function initializeCameraMotionBlurEffect(
  out: EntityConstruction<CameraMotionBlurEffect>,
  options: Readonly<Omit<EntityWithoutRuntime<CameraMotionBlurEffect>, 'kind'>>,
): void {
  initializeRenderEffect(out, 'CameraMotionBlurEffect');
  out.intensity = options.intensity;
  out.samples = options.samples;
}
