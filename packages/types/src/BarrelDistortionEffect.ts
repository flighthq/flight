import type { Effect } from './Effect';
export interface BarrelDistortionEffect extends Effect {
  kind: 'BarrelDistortionEffect';
  amount?: number;
  scale?: number;
}
