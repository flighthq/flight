import type { RenderEffect } from './RenderEffect';

export interface HueSaturationEffect extends RenderEffect {
  kind: 'HueSaturationEffect';
  hue?: number; // degrees.
  saturation?: number;
  lightness?: number;
}
