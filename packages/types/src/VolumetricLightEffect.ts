import type { RenderEffect } from './RenderEffect';
export interface VolumetricLightEffect extends RenderEffect {
  kind: 'VolumetricLightEffect';
  density?: number;
  // ★ ENCODING NOT FIXED: no backend runner reads this field. renderEffectDefaults supplies 0xffffffff,
  // which reads as packed RGBA, but nothing decodes it, so setting it has no effect on any backend and
  // the convention is only settled when a runner is written.
  lightColor?: number;
  lightX?: number;
  lightY?: number;
  samples?: number;
  scattering?: number;
}
