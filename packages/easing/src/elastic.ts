import type { EasingFunction } from '@flighthq/types';

const p = 0.4;
const p2 = 0.45;
const s = (p / (2 * Math.PI)) * Math.asin(1);
const s2 = (p2 / (2 * Math.PI)) * Math.asin(1);

export const Elastic: { easeIn: EasingFunction; easeInOut: EasingFunction; easeOut: EasingFunction } = {
  easeIn: (t) => {
    if (t === 0 || t === 1) return t;
    return -(Math.pow(2, 10 * (t -= 1)) * Math.sin(((t - s) * (2 * Math.PI)) / p));
  },
  easeInOut: (t) => {
    if (t === 0 || t === 1) return t;
    if ((t *= 2) < 1) return -0.5 * (Math.pow(2, 10 * (t -= 1)) * Math.sin(((t - s2) * (2 * Math.PI)) / p2));
    return 0.5 * Math.pow(2, -10 * (t -= 1)) * Math.sin(((t - s2) * (2 * Math.PI)) / p2) + 1;
  },
  easeOut: (t) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin(((t - s) * (2 * Math.PI)) / p) + 1;
  },
};
