import type { EasingFunction } from '@flighthq/types';

export const Cubic: { easeIn: EasingFunction; easeInOut: EasingFunction; easeOut: EasingFunction } = {
  easeIn: (t) => t * t * t,
  easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  easeOut: (t) => 1 - Math.pow(1 - t, 3),
};
