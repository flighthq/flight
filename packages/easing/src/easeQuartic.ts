import type { EasingFunction } from '@flighthq/types';

export const easeInOutQuartic: EasingFunction = (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);

export const easeInQuartic: EasingFunction = (t) => t * t * t * t;

export const easeOutQuartic: EasingFunction = (t) => 1 - Math.pow(1 - t, 4);
