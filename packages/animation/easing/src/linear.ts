import type { EasingFunction } from '@flighthq/types';

export const Linear: { easeNone: EasingFunction } = {
  easeNone: (t) => t,
};
