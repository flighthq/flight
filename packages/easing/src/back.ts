import type { EasingFunction } from '@flighthq/types';

const s = 1.70158;
const s2 = s * 1.525;

export const Back: { easeIn: EasingFunction; easeInOut: EasingFunction; easeOut: EasingFunction } = {
  easeIn: (t) => t * t * ((s + 1) * t - s),
  easeInOut: (t) =>
    (t *= 2) < 1 ? 0.5 * (t * t * ((s2 + 1) * t - s2)) : 0.5 * ((t -= 2) * t * ((s2 + 1) * t + s2) + 2),
  easeOut: (t) => (t -= 1) * t * ((s + 1) * t + s) + 1,
};
