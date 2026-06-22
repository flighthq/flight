import type { RenderEffect } from './RenderEffect';

export interface InvertEffect extends RenderEffect {
  kind: 'InvertEffect';
  intensity?: number;
}
