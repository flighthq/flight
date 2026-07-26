import type { MotionBlurEffect } from '@flighthq/types/contract';

export function createMotionBlurEffect(options: Readonly<Omit<MotionBlurEffect, 'kind'>> = {}): MotionBlurEffect {
  return { kind: 'MotionBlurEffect', ...options };
}
