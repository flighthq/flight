import type { Effect } from './Effect.ts';
export interface FilmEmulationEffect extends Effect {
  kind: 'FilmEmulationEffect';
  gateWeave?: number;
  grainIntensity?: number;
  halationRadius?: number;
  halationStrength?: number;
}
