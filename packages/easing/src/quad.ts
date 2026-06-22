import type { EasingFunction } from '@flighthq/types';

export const Quad: { easeIn: EasingFunction; easeInOut: EasingFunction; easeOut: EasingFunction } = {
  easeIn: (t) => t * t,
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeOut: (t) => t * (2 - t),
};
