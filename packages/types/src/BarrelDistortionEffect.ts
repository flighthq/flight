import type { RenderEffect } from './RenderEffect';
export interface BarrelDistortionEffect extends RenderEffect {
  kind: 'BarrelDistortionEffect';
  amount?: number;
  scale?: number;
}
