import type { Light } from './Light';

// Uniform omnidirectional fill. No position or direction; lights every surface equally. Does
// not cast shadows.
export interface AmbientLight extends Light {
  color: number;
  intensity: number;
  kind: 'AmbientLight';
}

export const AmbientLightKind = 'AmbientLight';
