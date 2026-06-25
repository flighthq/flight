import type { RenderEffect } from './RenderEffect';
export interface FilmEmulationEffect extends RenderEffect {
  kind: 'FilmEmulationEffect';
  gateWeave?: number;
  grainIntensity?: number;
  halationRadius?: number;
  halationStrength?: number;
}
