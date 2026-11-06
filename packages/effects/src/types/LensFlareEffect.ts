import type { Effect } from './Effect.ts';

export interface LensFlareEffect extends Effect {
  kind: 'LensFlareEffect'; // [HDR]
  threshold?: number;
  intensity?: number;
  ghosts?: number;
  halo?: number;
}
