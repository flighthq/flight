import type { RenderEffect } from './RenderEffect';
export interface VolumetricLightEffect extends RenderEffect {
  kind: 'VolumetricLightEffect';
  density?: number;
  lightColor?: number;
  lightX?: number;
  lightY?: number;
  samples?: number;
  scattering?: number;
}
