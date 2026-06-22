import type { ForceFalloff } from './ForceFalloff';

export interface VortexForce {
  kind: 'VortexForce';
  x: number;
  y: number;
  strength: number;
  radius?: number;
  falloff?: ForceFalloff;
}

export const VortexForceKind = 'VortexForce';
