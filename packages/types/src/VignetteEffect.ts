import type { RenderEffect } from './RenderEffect';

export interface VignetteEffect extends RenderEffect {
  kind: 'VignetteEffect';
  intensity?: number;
  radius?: number;
  softness?: number;
  color?: number; // packed RGBA. Default 0x000000ff.
}
