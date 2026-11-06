import type { Effect } from './Effect.ts';

export interface CrtEffect extends Effect {
  kind: 'CrtEffect';
  curvature?: number;
  scanlineIntensity?: number;
  vignette?: number;
  aberration?: number;
}
