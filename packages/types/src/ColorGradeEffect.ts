import type { RenderEffect } from './RenderEffect';

export interface ColorGradeEffect extends RenderEffect {
  kind: 'ColorGradeEffect';
  exposure?: number;
  contrast?: number;
  saturation?: number;
  temperature?: number;
  tint?: number;
  brightness?: number;
}
