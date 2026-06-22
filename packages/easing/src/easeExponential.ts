import type { EasingFunction } from '@flighthq/types';

export const easeInExponential: EasingFunction = (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10));

export const easeInOutExponential: EasingFunction = (t) => {
  if (t === 0 || t === 1) return t;
  return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
};

export const easeOutExponential: EasingFunction = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
