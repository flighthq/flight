import type { RenderEffect } from './RenderEffect';

export interface LookupTableGradeEffect extends RenderEffect {
  kind: 'LookupTableGradeEffect';
  size?: number; // cube size of the LUT (e.g. 16, 32).
  strength?: number;
}
