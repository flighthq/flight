import type { EasingFunction } from '@flighthq/types';

export const easeInCubic: EasingFunction = (t) => t * t * t;

export const easeInOutCubic: EasingFunction = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const easeOutCubic: EasingFunction = (t) => 1 - Math.pow(1 - t, 3);
