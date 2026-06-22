import type { EasingFunction } from '@flighthq/types';

export const easeInOutQuintic: EasingFunction = (t) =>
  t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;

export const easeInQuintic: EasingFunction = (t) => t * t * t * t * t;

export const easeOutQuintic: EasingFunction = (t) => 1 - Math.pow(1 - t, 5);
