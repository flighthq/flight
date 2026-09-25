import type { Effect } from './Effect.ts';

export interface LensDistortionEffect extends Effect {
  kind: 'LensDistortionEffect';
  amount?: number; // + barrel, - pincushion.
  scale?: number;
}
