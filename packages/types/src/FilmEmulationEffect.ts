import type { Effect } from './Effect';
export interface FilmEmulationEffect extends Effect {
  kind: 'FilmEmulationEffect';
  gateWeave?: number;
  grainIntensity?: number;
  halationRadius?: number;
  halationStrength?: number;
}
