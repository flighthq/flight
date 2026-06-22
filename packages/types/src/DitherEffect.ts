import type { RenderEffect } from './RenderEffect';

export interface DitherEffect extends RenderEffect {
  kind: 'DitherEffect';
  levels?: number;
}
