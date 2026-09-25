import type { ForceFalloff } from './ForceFalloff.ts';

export interface AttractorForce {
  kind: 'AttractorForce';
  x: number;
  y: number;
  z?: number;
  strength: number;
  radius?: number;
  falloff?: ForceFalloff;
}

export const AttractorForceKind = 'AttractorForce';
