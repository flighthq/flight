import type { RenderEffect } from './RenderEffect';

export interface LensFlareEffect extends RenderEffect {
  kind: 'LensFlareEffect'; // [HDR]
  threshold?: number;
  intensity?: number;
  ghosts?: number;
  halo?: number;
}
