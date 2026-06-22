import type { EasingFunction } from '@flighthq/types';

export const easeInBack: EasingFunction = (t) => t * t * ((s + 1) * t - s);

export const easeInOutBack: EasingFunction = (t) =>
  (t *= 2) < 1 ? 0.5 * (t * t * ((s2 + 1) * t - s2)) : 0.5 * ((t -= 2) * t * ((s2 + 1) * t + s2) + 2);

export const easeOutBack: EasingFunction = (t) => (t -= 1) * t * ((s + 1) * t + s) + 1;

const s = 1.70158;
const s2 = s * 1.525;
