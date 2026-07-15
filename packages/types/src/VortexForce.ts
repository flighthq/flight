import type { ForceFalloff } from './ForceFalloff';

export interface VortexForce {
  kind: 'VortexForce';
  x: number;
  y: number;
  z?: number;
  axisX?: number;
  axisY?: number;
  axisZ?: number;
  strength: number;
  radius?: number;
  falloff?: ForceFalloff;
}

export const VortexForceKind = 'VortexForce';
