import { createEntity } from '@flighthq/entity/contract';
import type { MotionBlurEffect } from '@flighthq/types/contract';

export function createMotionBlurEffect(options: Readonly<Omit<MotionBlurEffect, 'kind'>> = {}): MotionBlurEffect {
  return createEntity({ kind: 'MotionBlurEffect', ...options });
}
