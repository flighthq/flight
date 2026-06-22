import type { EasingFunction } from '@flighthq/types';

export const easeInCircular: EasingFunction = (t) => 1 - Math.sqrt(1 - t * t);

export const easeInOutCircular: EasingFunction = (t) =>
  t < 0.5 ? (1 - Math.sqrt(1 - 4 * t * t)) / 2 : (Math.sqrt(1 - (-2 * t + 2) ** 2) + 1) / 2;

export const easeOutCircular: EasingFunction = (t) => Math.sqrt(1 - (t - 1) * (t - 1));
