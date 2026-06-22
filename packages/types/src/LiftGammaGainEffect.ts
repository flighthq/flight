import type { RenderEffect } from './RenderEffect';

export interface LiftGammaGainEffect extends RenderEffect {
  kind: 'LiftGammaGainEffect';
  lift?: number; // packed RGBA, neutral 0x808080ff.
  gamma?: number; // packed RGBA.
  gain?: number; // packed RGBA.
}
