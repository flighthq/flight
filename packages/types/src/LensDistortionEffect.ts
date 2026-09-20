import type { Effect } from './Effect';

export interface LensDistortionEffect extends Effect {
  kind: 'LensDistortionEffect';
  amount?: number; // + barrel, - pincushion.
  scale?: number;
}
