import type { ForceFalloff } from './ForceFalloff';

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
