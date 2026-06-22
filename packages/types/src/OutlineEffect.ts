import type { RenderEffect } from './RenderEffect';

export interface OutlineEffect extends RenderEffect {
  kind: 'OutlineEffect';
  threshold?: number;
  thickness?: number;
  color?: number;
}
