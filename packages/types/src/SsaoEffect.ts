import type { RenderEffect } from './RenderEffect';

export interface SsaoEffect extends RenderEffect {
  kind: 'SsaoEffect'; // [DEPTH]
  radius?: number;
  intensity?: number;
  bias?: number;
  samples?: number;
}
