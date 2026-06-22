import type { RenderEffect } from './RenderEffect';

export interface SketchEffect extends RenderEffect {
  kind: 'SketchEffect';
  strength?: number;
}
