import type { RenderEffect } from './RenderEffect';

export interface TaaEffect extends RenderEffect {
  kind: 'TaaEffect'; // [TEMPORAL] needs a history buffer + motion vectors.
  feedback?: number;
}
