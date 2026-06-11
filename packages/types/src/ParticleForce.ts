export type ForceFalloff = 'none' | 'linear' | 'inverseSquare';

export interface AttractorForce {
  type: 'attractor';
  x: number;
  y: number;
  strength: number;
  radius?: number;
  falloff?: ForceFalloff;
}

export interface VortexForce {
  type: 'vortex';
  x: number;
  y: number;
  strength: number;
  radius?: number;
  falloff?: ForceFalloff;
}

export interface DragForce {
  type: 'drag';
  strength: number;
}

export interface WindForce {
  type: 'wind';
  x: number;
  y: number;
}

export interface TurbulenceForce {
  type: 'turbulence';
  strength: number;
  scale: number;
}

export type ParticleForce = AttractorForce | VortexForce | DragForce | WindForce | TurbulenceForce;
