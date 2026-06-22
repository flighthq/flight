import type { RenderEffect } from './RenderEffect';

export interface SmaaEffect extends RenderEffect {
  kind: 'SmaaEffect';
  threshold?: number;
}
