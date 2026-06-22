import type { RenderEffect } from './RenderEffect';

export interface HalftoneEffect extends RenderEffect {
  kind: 'HalftoneEffect';
  scale?: number;
  angle?: number;
}
