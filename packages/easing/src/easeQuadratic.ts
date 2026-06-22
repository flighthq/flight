import type { EasingFunction } from '@flighthq/types';

export const easeInOutQuadratic: EasingFunction = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export const easeInQuadratic: EasingFunction = (t) => t * t;

export const easeOutQuadratic: EasingFunction = (t) => t * (2 - t);
