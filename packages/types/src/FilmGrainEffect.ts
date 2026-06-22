import type { RenderEffect } from './RenderEffect';

export interface FilmGrainEffect extends RenderEffect {
  kind: 'FilmGrainEffect';
  intensity?: number;
  size?: number;
  seed?: number;
}
