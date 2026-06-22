import type { EasingFunction } from '@flighthq/types';

export const Sine: { easeIn: EasingFunction; easeInOut: EasingFunction; easeOut: EasingFunction } = {
  easeIn: (t) => 1 - Math.cos((t * Math.PI) / 2),
  easeInOut: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  easeOut: (t) => Math.sin((t * Math.PI) / 2),
};
