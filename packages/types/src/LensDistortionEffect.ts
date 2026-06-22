import type { RenderEffect } from './RenderEffect';

export interface LensDistortionEffect extends RenderEffect {
  kind: 'LensDistortionEffect';
  amount?: number; // + barrel, - pincushion.
  scale?: number;
}
