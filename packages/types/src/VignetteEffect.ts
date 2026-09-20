import type { Effect } from './Effect';

export interface VignetteEffect extends Effect {
  kind: 'VignetteEffect';
  intensity?: number;
  radius?: number;
  softness?: number;
  color?: number; // packed RGBA. Default 0x000000ff.
}
