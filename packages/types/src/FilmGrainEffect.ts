import type { Effect } from './Effect';

export interface FilmGrainEffect extends Effect {
  kind: 'FilmGrainEffect';
  intensity?: number;
  size?: number;
  seed?: number;
}
