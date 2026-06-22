import type { RenderEffect } from './RenderEffect';

export interface SepiaEffect extends RenderEffect {
  kind: 'SepiaEffect';
  intensity?: number;
}
