import type { EasingFunction } from '@flighthq/types';

export const easeInOutSine: EasingFunction = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

export const easeInSine: EasingFunction = (t) => 1 - Math.cos((t * Math.PI) / 2);

export const easeOutSine: EasingFunction = (t) => Math.sin((t * Math.PI) / 2);
