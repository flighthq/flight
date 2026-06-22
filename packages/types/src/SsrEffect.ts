import type { RenderEffect } from './RenderEffect';

export interface SsrEffect extends RenderEffect {
  kind: 'SsrEffect'; // [DEPTH]
  maxDistance?: number;
  resolution?: number;
  steps?: number;
}
