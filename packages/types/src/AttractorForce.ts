import type { ForceFalloff } from './ForceFalloff';

export interface AttractorForce {
  kind: 'AttractorForce';
  x: number;
  y: number;
  strength: number;
  radius?: number;
  falloff?: ForceFalloff;
}

export const AttractorForceKind = 'AttractorForce';
