import type { Effect } from './Effect.ts';
export interface BarrelDistortionEffect extends Effect {
  kind: 'BarrelDistortionEffect';
  amount?: number;
  scale?: number;
}
